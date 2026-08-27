/** @jest-environment node */
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { lookupGroup, lookupProcess } from '@/scripts/ci/disposable-lifecycle/proc';
import {
  createOwnedRoot,
  removeOwnedRoot,
  type OwnedRoot,
} from '@/scripts/ci/disposable-lifecycle/owned-root';
import {
  finishGatedProcess,
  releaseGatedProcess,
  spawnGatedProcess,
  waitForOwnedOutcome,
  type OwnedProcessDependencies,
} from '@/scripts/ci/disposable-lifecycle/owned-process';
import type {
  GroupLookup,
  ProcessIdentity,
  ProcessLookup,
} from '@/scripts/ci/disposable-lifecycle/types';

type FixtureDirectory = {
  readonly path: string;
  device: bigint | undefined;
  inode: bigint | undefined;
  readonly allowedBasenames: Set<string>;
};

type FixtureChild = {
  readonly child: ChildProcess;
  identity: ProcessIdentity | undefined;
};

type AuthorizedFixtureChild = Readonly<{
  child: ChildProcess;
  identity: ProcessIdentity;
}>;

type FixtureSignal = 'SIGHUP' | 'SIGINT' | 'SIGTERM';

type FixtureSignalSource = Readonly<{
  on: (signal: FixtureSignal, listener: () => void) => void;
  off: (signal: FixtureSignal, listener: () => void) => void;
}>;

type OwnedFixtureOptions = Readonly<{
  timeoutMs?: number;
  signalSource?: FixtureSignalSource;
  groupSignal?: (processGroupId: number, signal: NodeJS.Signals) => void;
}>;

type IdentityMutation = (identity: ProcessIdentity) => ProcessIdentity;

function fixtureInventory(): readonly string[] {
  return readdirSync('/tmp')
    .filter(
      (basename) =>
        basename.startsWith('casn-quality-regression-') ||
        basename.startsWith('casn-gate-fixture-'),
    )
    .map((basename) => {
      const stat = lstatSync(join('/tmp', basename), { bigint: true });
      return `${basename}\t${stat.dev.toString(10)}\t${stat.ino.toString(10)}`;
    })
    .sort();
}

function sameIdentity(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return (
    left.pid === right.pid &&
    left.startTime === right.startTime &&
    left.parentPid === right.parentPid &&
    left.processGroupId === right.processGroupId &&
    left.sessionId === right.sessionId
  );
}

function isLiveFixtureChild(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

function isExpectedFixtureAnchor(child: ChildProcess, identity: ProcessIdentity): boolean {
  return (
    isLiveFixtureChild(child) &&
    identity.pid === child.pid &&
    identity.parentPid === process.pid &&
    identity.pid === identity.processGroupId &&
    identity.pid === identity.sessionId
  );
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function waitForFixtureChildClose(child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (child.exitCode === null && child.signalCode === null) {
    if (Date.now() >= deadline) {
      throw new Error(`fixture child ${child.pid ?? 'unknown'} did not close within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForFixtureProcessAbsence(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lookup = lookupProcess(pid);
  while (lookup.kind !== 'absent') {
    if (Date.now() >= deadline) {
      const detail = lookup.kind === 'unknown' ? `unknown:${lookup.reason}` : lookup.kind;
      let procDetail = 'proc-present';
      try {
        lstatSync(`/proc/${pid}`);
        readFileSync(`/proc/${pid}/stat`, 'utf8');
      } catch (error: unknown) {
        procDetail = error instanceof Error && 'code' in error ? String(error.code) : String(error);
      }
      throw new Error(`fixture PID ${pid} absence remained ${detail} (${procDetail})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    lookup = lookupProcess(pid);
  }
}

class OwnedFixture {
  private readonly roots: OwnedRoot[] = [];
  private readonly directories: FixtureDirectory[] = [];
  private readonly children: FixtureChild[] = [];
  private readonly groupSignal: (processGroupId: number, signal: NodeJS.Signals) => void;
  private cleanupInProgress: Promise<void> | undefined;

  constructor(options: Pick<OwnedFixtureOptions, 'groupSignal'> = {}) {
    this.groupSignal =
      options.groupSignal ??
      ((processGroupId, signal) => {
        process.kill(-processGroupId, signal);
      });
  }

  createRoot(): OwnedRoot {
    const root = createOwnedRoot();
    this.roots.push(root);
    return root;
  }

  createDirectory(): string {
    const path = mkdtempSync('/tmp/casn-gate-fixture-');
    const directory: FixtureDirectory = {
      path,
      device: undefined,
      inode: undefined,
      allowedBasenames: new Set(),
    };
    this.directories.push(directory);
    const stat = lstatSync(path, { bigint: true });
    directory.device = stat.dev;
    directory.inode = stat.ino;
    return path;
  }

  absentFile(directoryPath: string, basename: string): string {
    const directory = this.directories.find((candidate) => candidate.path === directoryPath);
    if (directory === undefined || basename === '' || basename.includes('/')) {
      throw new Error('fixture file must use a captured directory and direct basename');
    }
    directory.allowedBasenames.add(basename);
    return join(directoryPath, basename);
  }

  captureChild(child: ChildProcess): void {
    const captured: FixtureChild = { child, identity: undefined };
    this.children.push(captured);
    if (child.pid === undefined) {
      return;
    }
    const lookup = lookupProcess(child.pid);
    if (lookup.kind === 'present' && isExpectedFixtureAnchor(child, lookup.identity)) {
      captured.identity = Object.freeze({ ...lookup.identity });
    }
  }

  latestChild(): AuthorizedFixtureChild {
    const captured = [...this.children].reverse().find((candidate) => candidate.identity !== undefined);
    if (captured?.identity === undefined) {
      throw new Error('fixture has no captured child');
    }
    return { child: captured.child, identity: captured.identity };
  }

  private async cleanupChild(captured: FixtureChild): Promise<void> {
    const failures: unknown[] = [];
    const pid = captured.child.pid;
    if (captured.identity !== undefined && isLiveFixtureChild(captured.child)) {
      const lookup = lookupProcess(captured.identity.pid);
      if (
        lookup.kind === 'present' &&
        sameIdentity(lookup.identity, captured.identity) &&
        isExpectedFixtureAnchor(captured.child, lookup.identity)
      ) {
        try {
          this.groupSignal(captured.identity.processGroupId, 'SIGKILL');
        } catch (error: unknown) {
          if (!isErrnoCode(error, 'ESRCH')) {
            failures.push(error);
          }
        }
      }
    }
    try {
      await waitForFixtureChildClose(captured.child, 2_000);
    } catch (error: unknown) {
      failures.push(error);
    }
    if (pid !== undefined) {
      try {
        await waitForFixtureProcessAbsence(pid, 2_000);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `fixture child ${pid ?? 'unknown'} cleanup failed`);
    }
  }

  private cleanupRoot(root: OwnedRoot): void {
    if (!existsSync(root.path)) {
      return;
    }
    const removal = removeOwnedRoot(root);
    if (removal.kind === 'failed') {
      throw new Error(`fixture root cleanup failed: ${removal.reason}`);
    }
  }

  private cleanupDirectory(directory: FixtureDirectory): void {
    if (!existsSync(directory.path)) {
      return;
    }
    if (directory.device === undefined || directory.inode === undefined) {
      throw new Error('fixture directory identity was not captured');
    }
    const stat = lstatSync(directory.path, { bigint: true });
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== directory.device ||
      stat.ino !== directory.inode
    ) {
      throw new Error('fixture directory identity changed');
    }
    const entries = readdirSync(directory.path);
    const unexpected = entries.find((entry) => !directory.allowedBasenames.has(entry));
    if (unexpected !== undefined) {
      throw new Error(`fixture directory contains an unauthorized entry: ${unexpected}`);
    }
    for (const entry of entries) {
      const path = join(directory.path, entry);
      const child = lstatSync(path);
      if (!child.isFile() || child.isSymbolicLink()) {
        throw new Error(`fixture directory contains an unexpected entry: ${entry}`);
      }
      unlinkSync(path);
    }
    rmdirSync(directory.path);
  }

  private async performCleanup(): Promise<void> {
    const failures: unknown[] = [];
    for (const captured of [...this.children].reverse()) {
      try {
        await this.cleanupChild(captured);
        this.children.splice(this.children.indexOf(captured), 1);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    for (const root of [...this.roots].reverse()) {
      try {
        this.cleanupRoot(root);
        this.roots.splice(this.roots.indexOf(root), 1);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    for (const directory of [...this.directories].reverse()) {
      try {
        this.cleanupDirectory(directory);
        this.directories.splice(this.directories.indexOf(directory), 1);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} fixture cleanup operation(s) failed`);
    }
  }

  cleanup(): Promise<void> {
    if (this.cleanupInProgress !== undefined) {
      return this.cleanupInProgress;
    }
    const cleanup = this.performCleanup();
    this.cleanupInProgress = cleanup;
    void cleanup.then(
      () => {
        this.cleanupInProgress = undefined;
      },
      () => {
        this.cleanupInProgress = undefined;
      },
    );
    return cleanup;
  }
}

function fixtureDependencies(
  fixture: OwnedFixture,
  options: Readonly<{
    lookupProcess?: (pid: number) => ProcessLookup;
    lookupGroup?: (
      processGroupId: number,
      sessionId: number,
      excludedPids: ReadonlySet<number>,
    ) => GroupLookup;
    signal?: (pid: number, signal: NodeJS.Signals) => void;
    observeSpawn?: (child: ChildProcess) => void;
    gateEnvironment?: Readonly<Record<string, string>>;
    waitingTimeoutMs?: number;
    unreleasedExitTimeoutMs?: number;
  }> = {},
): OwnedProcessDependencies {
  return {
    lookupProcess: options.lookupProcess ?? lookupProcess,
    lookupGroup:
      options.lookupGroup ??
      ((processGroupId, sessionId, excludedPids) =>
        lookupGroup(processGroupId, sessionId, undefined, excludedPids)),
    signal:
      options.signal ??
      ((pid, signal) => {
        process.kill(pid, signal);
      }),
    observeSpawn: options.observeSpawn ?? ((child) => fixture.captureChild(child)),
    gateEnvironment:
      options.gateEnvironment === undefined
        ? {}
        : { CASN_LIFECYCLE_TEST_GATE_MODE: '1', ...options.gateEnvironment },
    waitingTimeoutMs: options.waitingTimeoutMs ?? 1_000,
    unreleasedExitTimeoutMs: options.unreleasedExitTimeoutMs ?? 3_000,
  };
}

const fixtureSignals: readonly FixtureSignal[] = ['SIGHUP', 'SIGINT', 'SIGTERM'];
const defaultFixtureTimeoutMs = 10_000;

function defaultFixtureSignalSource(): FixtureSignalSource {
  return {
    on: (signal, listener) => {
      process.on(signal, listener);
    },
    off: (signal, listener) => {
      process.off(signal, listener);
    },
  };
}

async function withOwnedFixture<T>(
  run: (fixture: OwnedFixture, interruption: AbortSignal) => Promise<T>,
  options: OwnedFixtureOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? defaultFixtureTimeoutMs;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new Error('fixture timeout must be an integer from 1 through 2147483647ms');
  }

  const fixture = new OwnedFixture({ groupSignal: options.groupSignal });
  const controller = new AbortController();
  const signalSource = options.signalSource ?? defaultFixtureSignalSource();
  let rejectInterruption: (failure: Error) => void = () => undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    rejectInterruption = reject;
  });
  const interrupt = (failure: Error): void => {
    if (controller.signal.aborted) {
      return;
    }
    rejectInterruption(failure);
    controller.abort(failure);
  };
  const signalListeners = fixtureSignals.map((signal) => {
    const listener = (): void => interrupt(new Error(`fixture interrupted by ${signal}`));
    signalSource.on(signal, listener);
    return { signal, listener };
  });
  const timer = setTimeout(
    () => interrupt(new Error(`fixture deadline exceeded after ${timeoutMs}ms`)),
    timeoutMs,
  );

  const execution = await Promise.race([run(fixture, controller.signal), interruption]).then(
    (value) => ({ kind: 'returned' as const, value }),
    (error: unknown) => ({ kind: 'failed' as const, error }),
  );
  clearTimeout(timer);
  for (const { signal, listener } of signalListeners) {
    signalSource.off(signal, listener);
  }

  let cleanupFailure: unknown;
  try {
    await fixture.cleanup();
  } catch (error: unknown) {
    cleanupFailure = error;
  }

  if (execution.kind === 'failed') {
    if (cleanupFailure !== undefined) {
      const runMessage = execution.error instanceof Error ? execution.error.message : 'unknown test failure';
      const cleanupMessage =
        cleanupFailure instanceof Error ? cleanupFailure.message : 'unknown cleanup failure';
      throw new AggregateError(
        [execution.error, cleanupFailure],
        `test failed (${runMessage}) and fixture cleanup failed (${cleanupMessage})`,
      );
    }
    throw execution.error;
  }
  if (cleanupFailure !== undefined) {
    throw cleanupFailure;
  }
  return execution.value;
}

test(
  'keeps the target behind the parent-owned gate until release',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'released');
      const owned = await spawnGatedProcess({
        root,
        command: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'released')",
        ],
        env: { MARKER: marker },
      }, fixtureDependencies(fixture));

      expect(owned.anchor.parentPid).toBe(process.pid);
      expect(owned.anchor.pid).toBe(owned.anchor.processGroupId);
      expect(owned.anchor.pid).toBe(owned.anchor.sessionId);
      expect(existsSync(marker)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(existsSync(marker)).toBe(false);
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 0 });
      expect(readFileSync(marker, 'utf8')).toBe('released');
      await finishGatedProcess(owned, 5_000);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    }),
  15_000,
);

test(
  'kills an exact captured anchor when registration stalls before waiting',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            gateEnvironment: { CASN_LIFECYCLE_TEST_GATE_WAITING_DELAY_MS: '5000' },
            waitingTimeoutMs: 100,
            unreleasedExitTimeoutMs: 1_000,
            signal: (pid, signal) => {
              signals.push({ pid, signal });
              process.kill(pid, signal);
            },
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 124,
        message: expect.stringContaining('gate waiting'),
      });

      const captured = fixture.latestChild();
      expect(signals).toEqual([{ pid: captured.identity.pid, signal: 'SIGKILL' }]);
      expect(lookupProcess(captured.identity.pid)).toEqual({ kind: 'absent' });
      expect(existsSync(marker)).toBe(false);
    }),
  15_000,
);

test(
  'self-expires and reaps without signaling when anchor identity changes before release',
  async () => {
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];
      let lookupCount = 0;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture, {
          lookupProcess: (pid) => {
            const actual = lookupProcess(pid);
            if (actual.kind !== 'present') {
              return actual;
            }
            lookupCount += 1;
            return lookupCount === 1
              ? actual
              : {
                  ...actual,
                  identity: { ...actual.identity, startTime: actual.identity.startTime + 1n },
                };
          },
          signal: (pid, signal) => {
            signals.push({ pid, signal });
          },
        }),
      );

      await expect(releaseGatedProcess(owned)).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('self-expired and was reaped'),
      });
      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBe(124);
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }, {
      groupSignal: (processGroupId, signal) => {
        fixtureGroupSignals.push({ processGroupId, signal });
        process.kill(-processGroupId, signal);
      },
    });
    expect(fixtureGroupSignals).toEqual([]);
  },
  15_000,
);

test(
  'fails pre-registration cleanup without signaling a reused PID identity',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];
      let lookupCount = 0;

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            gateEnvironment: { CASN_LIFECYCLE_TEST_GATE_WAITING_DELAY_MS: '5000' },
            waitingTimeoutMs: 100,
            unreleasedExitTimeoutMs: 3_000,
            lookupProcess: (pid) => {
              const actual = lookupProcess(pid);
              if (actual.kind !== 'present') {
                return actual;
              }
              lookupCount += 1;
              if (lookupCount === 1) {
                return actual;
              }
              return {
                ...actual,
                identity: { ...actual.identity, startTime: actual.identity.startTime + 1n },
              };
            },
            signal: (pid, signal) => {
              signals.push({ pid, signal });
            },
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('identity changed'),
      });

      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }),
  15_000,
);

test.each(['absent', 'unknown'] as const)(
  'self-expires and reaps without signaling when the release lookup becomes %s',
  async (releaseLookup) => {
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];
      let lookupCount = 0;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture, {
          lookupProcess: (pid) => {
            lookupCount += 1;
            if (lookupCount === 1) {
              return lookupProcess(pid);
            }
            return releaseLookup === 'absent'
              ? { kind: 'absent' }
              : { kind: 'unknown', reason: 'injected-release-unknown' };
          },
          signal: (pid, signal) => {
            signals.push({ pid, signal });
          },
        }),
      );

      await expect(releaseGatedProcess(owned)).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('self-expired and was reaped'),
      });
      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBe(124);
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }, {
      groupSignal: (processGroupId, signal) => {
        fixtureGroupSignals.push({ processGroupId, signal });
        process.kill(-processGroupId, signal);
      },
    });
    expect(fixtureGroupSignals).toEqual([]);
  },
  15_000,
);

test(
  'reaps a gate that has already self-expired before release without signaling',
  async () => {
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
        fixtureDependencies(fixture, {
          signal: (pid, signal) => {
            signals.push({ pid, signal });
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 2_250));
      await expect(releaseGatedProcess(owned)).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('self-expired and was reaped'),
      });
      expect(fixture.latestChild().child.exitCode).toBe(124);
      expect(signals).toEqual([]);
    }, {
      groupSignal: (processGroupId, signal) => {
        fixtureGroupSignals.push({ processGroupId, signal });
        process.kill(-processGroupId, signal);
      },
    });
    expect(fixtureGroupSignals).toEqual([]);
  },
  15_000,
);

test(
  'self-expires and reaps after a disconnected release channel without signaling',
  async () => {
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
        fixtureDependencies(fixture, {
          signal: (pid, signal) => {
            signals.push({ pid, signal });
          },
        }),
      );
      owned.child.disconnect();

      let releaseFailure: unknown;
      try {
        await releaseGatedProcess(owned);
      } catch (error: unknown) {
        releaseFailure = error;
      }
      expect(releaseFailure).toMatchObject({ exitCode: 70 });
      expect(releaseFailure).toBeInstanceOf(Error);
      if (!(releaseFailure instanceof Error)) {
        throw new Error('release failure was not an Error');
      }
      expect(fixture.latestChild().child.exitCode).toBe(124);
      expect(releaseFailure.message).toContain('self-expired and was reaped');
      expect(signals).toEqual([]);
    }, {
      groupSignal: (processGroupId, signal) => {
        fixtureGroupSignals.push({ processGroupId, signal });
        process.kill(-processGroupId, signal);
      },
    });
    expect(fixtureGroupSignals).toEqual([]);
  },
  15_000,
);

test(
  'reports retained cleanup when a revoked release remains live after the self-expiry point',
  async () => {
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];
      let lookupCount = 0;
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
        fixtureDependencies(fixture, {
          gateEnvironment: { CASN_LIFECYCLE_TEST_GATE_HANG_AFTER_EXPIRY_MS: '5000' },
          lookupProcess: (pid) => {
            const actual = lookupProcess(pid);
            if (actual.kind !== 'present') {
              return actual;
            }
            lookupCount += 1;
            return lookupCount === 1
              ? actual
              : {
                  ...actual,
                  identity: { ...actual.identity, startTime: actual.identity.startTime + 1n },
                };
          },
          signal: (pid, signal) => {
            signals.push({ pid, signal });
          },
          unreleasedExitTimeoutMs: 2_300,
        }),
      );

      await expect(releaseGatedProcess(owned)).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('retained cleanup failure'),
      });
      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBeNull();
      expect(captured.child.signalCode).toBeNull();
      expect(signals).toEqual([]);
    }, {
      groupSignal: (processGroupId, signal) => {
        fixtureGroupSignals.push({ processGroupId, signal });
        process.kill(-processGroupId, signal);
      },
    });
    expect(fixtureGroupSignals).toHaveLength(1);
  },
  15_000,
);

test(
  'keeps an unknown initial lookup closed until self-expiry and reaps the anchor without signaling',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            lookupProcess: () => ({ kind: 'unknown', reason: 'injected-unknown' }),
            signal: (pid, signal) => {
              signals.push({ pid, signal });
            },
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('self-expired and was reaped'),
      });

      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBe(124);
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }),
  15_000,
);

test(
  'keeps an absent initial lookup closed until self-expiry and reaps the anchor without signaling',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            lookupProcess: () => ({ kind: 'absent' }),
            signal: (pid, signal) => {
              signals.push({ pid, signal });
            },
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('self-expired and was reaped'),
      });

      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBe(124);
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }),
  15_000,
);

test(
  'rejects a present lookup that does not identify the exact returned child PID',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            lookupProcess: (pid) => {
              const actual = lookupProcess(pid);
              if (actual.kind !== 'present') {
                return actual;
              }
              return {
                ...actual,
                identity: {
                  ...actual.identity,
                  pid: actual.identity.pid + 1,
                  processGroupId: actual.identity.pid + 1,
                  sessionId: actual.identity.pid + 1,
                },
              };
            },
            signal: (pid, signal) => {
              signals.push({ pid, signal });
            },
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('returned child PID'),
      });

      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBe(124);
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }),
  15_000,
);

test.each<Readonly<{ label: string; mutate: IdentityMutation }>>([
  {
    label: 'PPID',
    mutate: (identity) => ({ ...identity, parentPid: identity.parentPid + 1 }),
  },
  {
    label: 'PGID',
    mutate: (identity) => ({ ...identity, processGroupId: identity.processGroupId + 1 }),
  },
  {
    label: 'SID',
    mutate: (identity) => ({ ...identity, sessionId: identity.sessionId + 1 }),
  },
])(
  'keeps a wrong initial $label topology closed until self-expiry without granting signal authority',
  async ({ mutate }) => {
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            lookupProcess: (pid) => {
              const actual = lookupProcess(pid);
              return actual.kind === 'present'
                ? { ...actual, identity: mutate(actual.identity) }
                : actual;
            },
            signal: (pid, signal) => {
              signals.push({ pid, signal });
            },
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('expected detached anchor'),
      });

      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBe(124);
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }, {
      groupSignal: (processGroupId, signal) => {
        fixtureGroupSignals.push({ processGroupId, signal });
        process.kill(-processGroupId, signal);
      },
    });
    expect(fixtureGroupSignals).toEqual([]);
  },
  15_000,
);

test(
  'retains a visible cleanup failure when unknown authority outlives gate self-expiry',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'not-launched');
      const signals: Array<Readonly<{ pid: number; signal: NodeJS.Signals }>> = [];

      await expect(
        spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'bad')",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture, {
            gateEnvironment: { CASN_LIFECYCLE_TEST_GATE_HANG_AFTER_EXPIRY_MS: '5000' },
            lookupProcess: () => ({ kind: 'unknown', reason: 'injected-unknown' }),
            signal: (pid, signal) => {
              signals.push({ pid, signal });
            },
            unreleasedExitTimeoutMs: 2_500,
          }),
        ),
      ).rejects.toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('retained cleanup failure'),
      });

      const captured = fixture.latestChild();
      expect(captured.child.exitCode).toBeNull();
      expect(captured.child.signalCode).toBeNull();
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }),
  15_000,
);

test(
  'preserves an exact nonzero target outcome through the stable anchor',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '-e',
            "process.stdout.write('literal stdout'); process.stderr.write('literal stderr'); process.exitCode=23",
          ],
          env: {},
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 23 });
      await finishGatedProcess(owned, 5_000);
      expect(readFileSync(owned.stdoutPath, 'utf8')).toBe('literal stdout');
      expect(readFileSync(owned.stderrPath, 'utf8')).toBe('literal stderr');
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    }),
  15_000,
);

test(
  'ignores poisoned parent gate-test variables on the default spawn path',
  async () => {
    const poisonedEnvironment = {
      CASN_LIFECYCLE_TEST_GATE_MODE: '1',
      CASN_LIFECYCLE_TEST_GATE_WAITING_DELAY_MS: '5000',
      CASN_LIFECYCLE_TEST_GATE_HANG_AFTER_EXPIRY_MS: '5000',
    } as const;
    const previous = Object.fromEntries(
      Object.keys(poisonedEnvironment).map((name) => [name, process.env[name]]),
    );
    for (const [name, value] of Object.entries(poisonedEnvironment)) {
      process.env[name] = value;
    }

    try {
      await withOwnedFixture(async (fixture) => {
        const root = fixture.createRoot();
        const owned = await spawnGatedProcess(
          { root, command: process.execPath, args: ['-e', 'process.exitCode=19'], env: {} },
          fixtureDependencies(fixture),
        );

        await releaseGatedProcess(owned);
        expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 19 });
        await finishGatedProcess(owned, 5_000);
        expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
      });
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  },
  15_000,
);

const invalidDeadlineValues = [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 2_147_483_648] as const;

test.each(invalidDeadlineValues)(
  'rejects invalid waiting deadline %s before creating logs or a gate child',
  async (waitingTimeoutMs) => {
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      await expect(
        spawnGatedProcess(
          { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
          fixtureDependencies(fixture, { waitingTimeoutMs }),
        ),
      ).rejects.toThrow('waitingTimeoutMs must be an integer from 1 through 2147483647ms');
      expect(readdirSync(root.path)).toEqual([]);
    });
  },
  15_000,
);

test.each(invalidDeadlineValues)(
  'rejects invalid unreleased-exit deadline %s before creating logs or a gate child',
  async (unreleasedExitTimeoutMs) => {
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      await expect(
        spawnGatedProcess(
          { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
          fixtureDependencies(fixture, { unreleasedExitTimeoutMs }),
        ),
      ).rejects.toThrow('unreleasedExitTimeoutMs must be an integer from 1 through 2147483647ms');
      expect(readdirSync(root.path)).toEqual([]);
    });
  },
  15_000,
);

test(
  'rejects invalid public outcome deadlines before returning an available outcome',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exitCode=17'], env: {} },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 17 });

      for (const timeoutMs of invalidDeadlineValues) {
        await expect(waitForOwnedOutcome(owned, timeoutMs)).rejects.toThrow(
          'timeoutMs must be an integer from 1 through 2147483647ms',
        );
      }
      await finishGatedProcess(owned, 5_000);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    }),
  15_000,
);

test(
  'rejects invalid public finish deadlines without consuming finalization authority',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exitCode=29'], env: {} },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 29 });

      for (const timeoutMs of invalidDeadlineValues) {
        await expect(finishGatedProcess(owned, timeoutMs)).rejects.toThrow(
          'timeoutMs must be an integer from 1 through 2147483647ms',
        );
      }
      await finishGatedProcess(owned, 5_000);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    }),
  15_000,
);

test(
  'accepts the inclusive maximum deadline at dependency and public boundaries',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exitCode=31'], env: {} },
        fixtureDependencies(fixture, {
          waitingTimeoutMs: 2_147_483_647,
          unreleasedExitTimeoutMs: 2_147_483_647,
        }),
      );
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 2_147_483_647)).toEqual({ kind: 'exit', code: 31 });
      await finishGatedProcess(owned, 2_147_483_647);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    }),
  15_000,
);

test(
  'caps both logs at one MiB, drains overflow, and returns finalization failure',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '-e',
            "const chunk=Buffer.alloc(1024*1024+257,120); process.stdout.write(chunk,()=>process.stderr.write(chunk))",
          ],
          env: {},
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 0 });
      let finalizationFailure: unknown;
      try {
        await finishGatedProcess(owned, 5_000);
      } catch (error: unknown) {
        finalizationFailure = error;
      }
      expect(finalizationFailure).toMatchObject({
        exitCode: 70,
        message: expect.stringContaining('stdout exceeded 1048576 byte capture limit'),
      });
      expect(finalizationFailure).toMatchObject({
        message: expect.stringContaining('stderr exceeded 1048576 byte capture limit'),
      });
      expect(statSync(owned.stdoutPath).size).toBe(1024 * 1024);
      expect(statSync(owned.stderrPath).size).toBe(1024 * 1024);
      expect(statSync(owned.stdoutPath).mode & 0o777).toBe(0o600);
      expect(statSync(owned.stderrPath).mode & 0o777).toBe(0o600);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    }),
  15_000,
);

test(
  'interrupts a fixture at its outer deadline and removes every owned path',
  async () => {
    const before = fixtureInventory();
    let rootPath: string | undefined;
    let directoryPath: string | undefined;

    await expect(
      withOwnedFixture(
        async (fixture, interruption) => {
          rootPath = fixture.createRoot().path;
          directoryPath = fixture.createDirectory();
          await new Promise<never>((_resolve, reject) => {
            interruption.addEventListener(
              'abort',
              () => reject(new Error('fixture run observed deadline abort')),
              { once: true },
            );
          });
        },
        { timeoutMs: 100 },
      ),
    ).rejects.toThrow('fixture deadline exceeded after 100ms');

    expect(rootPath).toBeDefined();
    expect(directoryPath).toBeDefined();
    expect(existsSync(rootPath ?? '')).toBe(false);
    expect(existsSync(directoryPath ?? '')).toBe(false);
    expect(fixtureInventory()).toEqual(before);
  },
  15_000,
);

test(
  'interrupts a fixture on SIGTERM and removes every owned path',
  async () => {
    const before = fixtureInventory();
    const signalSource = new EventEmitter();
    let rootPath: string | undefined;
    let directoryPath: string | undefined;

    const run = withOwnedFixture(
      async (fixture, interruption) => {
        rootPath = fixture.createRoot().path;
        directoryPath = fixture.createDirectory();
        await new Promise<never>((_resolve, reject) => {
          interruption.addEventListener(
            'abort',
            () => reject(new Error('fixture run observed signal abort')),
            { once: true },
          );
        });
      },
      { signalSource, timeoutMs: 2_000 },
    );
    while (directoryPath === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    signalSource.emit('SIGTERM');

    await expect(run).rejects.toThrow('fixture interrupted by SIGTERM');
    expect(rootPath).toBeDefined();
    expect(existsSync(rootPath ?? '')).toBe(false);
    expect(existsSync(directoryPath)).toBe(false);
    expect(fixtureInventory()).toEqual(before);
  },
  15_000,
);

test(
  'cleans every owned path when the fixture body assertion fails',
  async () => {
    const before = fixtureInventory();
    let rootPath: string | undefined;
    let directoryPath: string | undefined;

    await expect(
      withOwnedFixture(async (fixture) => {
        rootPath = fixture.createRoot().path;
        directoryPath = fixture.createDirectory();
        expect('actual').toBe('intentional-mismatch');
      }),
    ).rejects.toThrow('intentional-mismatch');

    expect(rootPath).toBeDefined();
    expect(directoryPath).toBeDefined();
    expect(existsSync(rootPath ?? '')).toBe(false);
    expect(existsSync(directoryPath ?? '')).toBe(false);
    expect(fixtureInventory()).toEqual(before);
  },
  15_000,
);

test(
  'attempts later cleanup ledgers after the first cleanup failure',
  async () => {
    const before = fixtureInventory();
    const fixture = new OwnedFixture();
    const laterDirectory = fixture.createDirectory();
    const failingDirectory = fixture.createDirectory();
    const failingStat = lstatSync(failingDirectory, { bigint: true });
    const unauthorizedPath = join(failingDirectory, 'unauthorized');
    writeFileSync(unauthorizedPath, 'owned by this test');

    try {
      await expect(fixture.cleanup()).rejects.toBeInstanceOf(AggregateError);
      expect(existsSync(laterDirectory)).toBe(false);
      expect(existsSync(failingDirectory)).toBe(true);
    } finally {
      if (existsSync(unauthorizedPath)) {
        const current = lstatSync(failingDirectory, { bigint: true });
        if (
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          current.dev !== failingStat.dev ||
          current.ino !== failingStat.ino
        ) {
          throw new Error('test rescue directory identity changed');
        }
        const unauthorized = lstatSync(unauthorizedPath);
        if (!unauthorized.isFile() || unauthorized.isSymbolicLink()) {
          throw new Error('test rescue entry identity changed');
        }
        unlinkSync(unauthorizedPath);
      }
      await fixture.cleanup();
    }

    expect(fixtureInventory()).toEqual(before);
  },
  15_000,
);

test(
  'bounds an observeSpawn exception with unopened-gate self-expiry and no fixture group signal',
  async () => {
    const before = fixtureInventory();
    const fixtureGroupSignals: Array<
      Readonly<{ processGroupId: number; signal: NodeJS.Signals }>
    > = [];

    await expect(
      withOwnedFixture(
        async (fixture) => {
          const root = fixture.createRoot();
          let capturedChild: ChildProcess | undefined;
          await expect(
            spawnGatedProcess(
              { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
              fixtureDependencies(fixture, {
                observeSpawn: (child) => {
                  capturedChild = child;
                  fixture.captureChild(child);
                  throw new Error('injected observeSpawn failure');
                },
              }),
            ),
          ).rejects.toMatchObject({
            exitCode: 71,
            message: expect.stringContaining('self-expired and was reaped'),
          });
          expect(capturedChild).toBeDefined();
          expect(capturedChild?.exitCode).toBe(124);
        },
        {
          groupSignal: (processGroupId, signal) => {
            fixtureGroupSignals.push({ processGroupId, signal });
            process.kill(-processGroupId, signal);
          },
        },
      ),
    ).resolves.toBeUndefined();

    expect(fixtureGroupSignals).toEqual([]);
    expect(fixtureInventory()).toEqual(before);
  },
  15_000,
);
