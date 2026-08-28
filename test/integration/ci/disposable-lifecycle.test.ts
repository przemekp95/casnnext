/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
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
import { performance } from 'node:perf_hooks';

import {
  createFinalizeOwnedRunForTests,
  finalizeOwnedRun,
  resolveExitStatus,
  type FinalizeTestActors,
} from '@/scripts/ci/disposable-lifecycle/finalize';
import { lookupGroup, lookupProcess } from '@/scripts/ci/disposable-lifecycle/proc';
import {
  createOwnedRoot,
  removeOwnedRoot,
  type OwnedRoot,
} from '@/scripts/ci/disposable-lifecycle/owned-root';
import {
  assertOwnedProcessAuthority,
  finishGatedProcess,
  reapEscalatedOwnedProcess,
  releaseGatedProcess,
  spawnGatedProcess,
  waitForOwnedOutcome,
  type OwnedProcess,
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

async function waitForFixtureFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      throw new Error(`fixture file ${path} was not created within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function captureOwnedGroupMembers(
  anchor: ProcessIdentity,
  timeoutMs: number,
): Promise<readonly ProcessIdentity[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const group = lookupGroup(
      anchor.processGroupId,
      anchor.sessionId,
      undefined,
      new Set([anchor.pid]),
    );
    if (group.kind === 'unknown') {
      throw new Error(`fixture group lookup was unknown: ${group.reason}`);
    }
    if (group.kind === 'present') {
      return group.members.map((member) => Object.freeze({ ...member }));
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`fixture group had no target member within ${timeoutMs}ms`);
}

async function waitForFixtureProcessState(
  identity: ProcessIdentity,
  expectedState: 'T',
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lookup = lookupProcess(identity.pid);
    if (lookup.kind === 'unknown') {
      throw new Error(`fixture process lookup was unknown: ${lookup.reason}`);
    }
    if (
      lookup.kind === 'present' &&
      sameIdentity(lookup.identity, identity) &&
      lookup.state === expectedState
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`fixture process ${identity.pid} did not reach state ${expectedState}`);
}

async function expectStableOwnedAbsence(
  anchor: ProcessIdentity,
  members: readonly ProcessIdentity[],
): Promise<void> {
  for (let observation = 0; observation < 5; observation += 1) {
    for (const identity of [anchor, ...members]) {
      expect(lookupProcess(identity.pid)).toEqual({ kind: 'absent' });
    }
    expect(lookupGroup(anchor.processGroupId, anchor.sessionId)).toEqual({ kind: 'absent' });
    if (observation < 4) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
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
    now: options.now ?? (() => performance.now()),
    wait:
      options.wait ??
      (async (milliseconds) => {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
      }),
  };
}

function withDeadlineActors(
  dependencies: OwnedProcessDependencies,
  now: () => number,
): OwnedProcessDependencies {
  return {
    ...dependencies,
    now,
    wait: async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

function interceptMessageSettlement(
  child: ChildProcess,
  messageType: 'finish',
  onSettlement: () => void,
): () => void {
  const originalSend = child.send;
  const interceptedSend = ((...input: readonly unknown[]) => {
    const [message, ...rest] = input;
    const callbackIndex = rest.findIndex((entry) => typeof entry === 'function');
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === messageType &&
      callbackIndex >= 0
    ) {
      const callback = rest[callbackIndex] as (...args: readonly unknown[]) => void;
      rest[callbackIndex] = (...args: readonly unknown[]) => {
        onSettlement();
        callback(...args);
      };
    }
    return Reflect.apply(originalSend, child, [message, ...rest]);
  }) as ChildProcess['send'];
  child.send = interceptedSend;
  return () => {
    child.send = originalSend;
  };
}

function finalizeTestActors(
  overrides: Partial<FinalizeTestActors> = {},
): FinalizeTestActors {
  return {
    assertOwnedProcess: assertOwnedProcessAuthority,
    lookupProcess,
    lookupGroup: (processGroupId, sessionId, excludedPids) =>
      lookupGroup(processGroupId, sessionId, undefined, excludedPids),
    now: Date.now,
    wait: async (milliseconds) => {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
    signalGroup: (processGroupId, signal) => {
      process.kill(-processGroupId, signal);
    },
    finishCooperative: async (owned, timeoutMs) => {
      await waitForOwnedOutcome(owned, timeoutMs);
      await finishGatedProcess(owned, timeoutMs);
    },
    reapEscalated: async (owned, timeoutMs) => {
      await waitForFixtureChildClose(owned.child, timeoutMs);
    },
    removeRoot: removeOwnedRoot,
    rootPathIsAbsent: (path) => !existsSync(path),
    ...overrides,
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
  'retains cleanup failure when a disconnected release channel prevents registered close',
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
      expect(releaseFailure.message).toContain('retained cleanup failure');
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

test.each([
  [99, 'accepted'],
  [100, 'rejected'],
] as const)(
  'samples gate readiness at %ims against the strict 100ms monotonic deadline',
  async (observedAt, expected) => {
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let clock = 0;
      const base = fixtureDependencies(fixture, {
        waitingTimeoutMs: 100,
        observeSpawn: (child) => {
          fixture.captureChild(child);
          child.on('message', (message: unknown) => {
            if (
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              message.type === 'waiting'
            ) {
              clock = observedAt;
            }
          });
        },
      });
      const attempt = spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exit(0)'], env: {} },
        withDeadlineActors(base, () => clock),
      );

      if (expected === 'rejected') {
        await expect(attempt).rejects.toMatchObject({
          exitCode: 124,
          message: 'gate waiting: timed out after 100ms',
        });
        return;
      }

      const owned = await attempt;
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 1_000)).toEqual({ kind: 'exit', code: 0 });
      await finishGatedProcess(owned, 1_000);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    });
  },
  15_000,
);

test.each([
  [99, { kind: 'exit', code: 41 }],
  [100, { kind: 'timeout', phase: 'outcome' }],
] as const)(
  'samples the target outcome at %ims against the strict 100ms monotonic deadline',
  async (observedAt, expected) => {
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let clock = 0;
      const base = fixtureDependencies(fixture, {
        observeSpawn: (child) => {
          fixture.captureChild(child);
          child.on('message', (message: unknown) => {
            if (
              typeof message === 'object' &&
              message !== null &&
              'type' in message &&
              message.type === 'outcome'
            ) {
              clock = observedAt;
            }
          });
        },
      });
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exitCode=41'], env: {} },
        withDeadlineActors(base, () => clock),
      );
      await releaseGatedProcess(owned);

      expect(await waitForOwnedOutcome(owned, 100)).toEqual(expected);
      clock = 0;
      await finishGatedProcess(owned, 1_000);
      expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
    });
  },
  15_000,
);

test.each([
  [999, 'accepted'],
  [1_000, 'rejected'],
] as const)(
  'samples finish IPC settlement at %ims against the strict 1000ms monotonic deadline',
  async (observedAt, expected) => {
    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let clock = 0;
      const owned = await spawnGatedProcess(
        { root, command: process.execPath, args: ['-e', 'process.exitCode=43'], env: {} },
        withDeadlineActors(fixtureDependencies(fixture), () => clock),
      );
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 1_000)).toEqual({ kind: 'exit', code: 43 });
      const restoreSend = interceptMessageSettlement(owned.child, 'finish', () => {
        clock = observedAt;
      });

      try {
        if (expected === 'rejected') {
          await expect(finishGatedProcess(owned, 2_000)).rejects.toMatchObject({
            exitCode: 124,
            message: 'finish: IPC send timed out',
          });
        } else {
          await finishGatedProcess(owned, 2_000);
          expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
        }
      } finally {
        restoreSend();
      }
    });
  },
  15_000,
);

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

test(
  'finalizes a cooperative target with group TERM and stable exact absence',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'cooperative-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => process.exit(0)); writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      await expect(finalizeOwnedRun(owned, 1_000)).resolves.toEqual({ kind: 'clean' });
      expect(existsSync(root.path)).toBe(false);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 }),
  15_000,
);

test(
  'escalates an ignored group TERM to bounded group KILL and stable exact absence',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'ignored-term-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => undefined); writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      await expect(finalizeOwnedRun(owned, 250)).resolves.toEqual({ kind: 'clean' });
      expect(existsSync(root.path)).toBe(false);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 }),
  15_000,
);

test(
  'retains overflow diagnostics and the owned root after escalated reap failure',
  async () => {
    let rootPath: string | undefined;

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      rootPath = root.path;
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'overflow-escalation-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; const chunk=Buffer.alloc(1024*1024+257,120); process.on('SIGTERM', () => undefined); process.stdout.write(chunk, () => writeFileSync(process.env.MARKER, 'ready')); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      await expect(finalizeOwnedRun(owned, 250)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['stdout exceeded 1048576 byte capture limit'],
      });
      expect(existsSync(root.path)).toBe(true);
      expect(statSync(owned.stdoutPath).size).toBe(1024 * 1024);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 });

    if (rootPath === undefined) {
      throw new Error('overflow escalation root path was not captured');
    }
    expect(existsSync(rootPath)).toBe(false);
  },
  15_000,
);

test(
  'kills a stopped target through the freshly authorized group and reaps it',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'stopped-ready');
      const signals: NodeJS.Signals[] = [];
      let ownershipAssertions = 0;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); process.kill(process.pid, 'SIGSTOP'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);
      expect(members).toHaveLength(1);
      const member = members[0];
      if (member === undefined) {
        throw new Error('fixture stopped target identity was not captured');
      }
      await waitForFixtureProcessState(member, 'T', 2_000);

      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          assertOwnedProcess: (candidate) => {
            ownershipAssertions += 1;
            assertOwnedProcessAuthority(candidate);
          },
          signalGroup: (processGroupId, signal) => {
            signals.push(signal);
            process.kill(-processGroupId, signal);
          },
        }),
      );
      await expect(
        testFinalize(owned, 250),
      ).resolves.toEqual({ kind: 'clean' });
      expect(ownershipAssertions).toBe(2);
      expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
      expect(existsSync(root.path)).toBe(false);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 }),
  15_000,
);

test(
  'finalizes a surviving same-group descendant after its target leader exits',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'descendant-ready');
      const signals: NodeJS.Signals[] = [];
      const descendantSource =
        "process.on('SIGTERM', () => process.exit(0)); setInterval(() => undefined, 1000)";
      const targetSource = [
        "import { spawn } from 'node:child_process'",
        "import { writeFileSync } from 'node:fs'",
        `const descendant = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(descendantSource)}], { stdio: 'inherit' })`,
        "writeFileSync(process.env.MARKER, String(descendant.pid))",
        'descendant.unref()',
        'process.exit(23)',
      ].join('; ');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: ['--input-type=module', '-e', targetSource],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const child = await waitForOwnedOutcome(owned, 2_000);
      expect(child).toEqual({ kind: 'exit', code: 23 });
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);
      expect(members).toHaveLength(1);

      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          signalGroup: (processGroupId, signal) => {
            signals.push(signal);
            process.kill(-processGroupId, signal);
          },
        }),
      );
      const cleanup = await testFinalize(owned, 1_000);
      expect(cleanup).toEqual({ kind: 'clean' });
      expect(resolveExitStatus(child, cleanup)).toBe(23);
      expect(signals).toEqual(['SIGTERM']);
      expect(existsSync(root.path)).toBe(false);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 }),
  15_000,
);

test(
  'fails closed on an unknown anchor lookup before sending any group signal',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];
    const signals: NodeJS.Signals[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'unknown-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          lookupProcess: () => ({ kind: 'unknown', reason: 'injected-unknown' }),
          signalGroup: (_processGroupId, signal) => {
            signals.push(signal);
          },
        }),
      );
      await expect(testFinalize(owned, 250)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['TERM: anchor lookup unknown:injected-unknown'],
      });
      expect(signals).toEqual([]);
      expect(existsSync(root.path)).toBe(true);
      expect(lookupProcess(owned.anchor.pid).kind).toBe('present');
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('fixture unknown-lookup anchor identity was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'fails cleanup when a registered member appears during the stabilization window',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'stabilization-ready');
      const signals: NodeJS.Signals[] = [];
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => process.exit(0)); writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );

      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);
      const registered = members[0];
      if (registered === undefined) {
        throw new Error('fixture stabilization member identity was not captured');
      }
      let fullGroupObservations = 0;

      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          lookupGroup: (processGroupId, sessionId, excludedPids) => {
            if (excludedPids.size === 0) {
              fullGroupObservations += 1;
              if (fullGroupObservations === 3) {
                return { kind: 'present', members: [registered] };
              }
            }
            return lookupGroup(processGroupId, sessionId, undefined, excludedPids);
          },
          signalGroup: (processGroupId, signal) => {
            signals.push(signal);
            process.kill(-processGroupId, signal);
          },
        }),
      );
      await expect(testFinalize(owned, 1_000)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['stabilization: owned group remained present'],
      });
      expect(fullGroupObservations).toBe(3);
      expect(signals).toEqual(['SIGTERM']);
      expect(existsSync(root.path)).toBe(false);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 }),
  15_000,
);

test(
  'leaves an unregistered fixture process alive until its separate owner cleans it',
  async () => {
    let unregisteredIdentity: ProcessIdentity | undefined;

    await withOwnedFixture(async (separateOwner) => {
      const unregisteredMarkerDirectory = separateOwner.createDirectory();
      const unregisteredMarker = separateOwner.absentFile(
        unregisteredMarkerDirectory,
        'unregistered-ready',
      );
      const unregistered = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
        ],
        { detached: true, env: { ...process.env, MARKER: unregisteredMarker }, stdio: 'ignore' },
      );
      separateOwner.captureChild(unregistered);
      await waitForFixtureFile(unregisteredMarker, 2_000);
      const unregisteredAnchor = separateOwner.latestChild().identity;
      unregisteredIdentity = unregisteredAnchor;

      await withOwnedFixture(async (fixture) => {
        const root = fixture.createRoot();
        const markerDirectory = fixture.createDirectory();
        const marker = fixture.absentFile(markerDirectory, 'registered-ready');
        const owned = await spawnGatedProcess(
          {
            root,
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => process.exit(0)); writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
            ],
            env: { MARKER: marker },
          },
          fixtureDependencies(fixture),
        );

        await releaseGatedProcess(owned);
        await waitForFixtureFile(marker, 2_000);
        const members = await captureOwnedGroupMembers(owned.anchor, 2_000);
        await expect(finalizeOwnedRun(owned, 1_000)).resolves.toEqual({ kind: 'clean' });
        await expectStableOwnedAbsence(owned.anchor, members);

        const unregisteredLookup = lookupProcess(unregisteredAnchor.pid);
        expect(unregisteredLookup.kind).toBe('present');
        if (unregisteredLookup.kind === 'present') {
          expect(sameIdentity(unregisteredLookup.identity, unregisteredAnchor)).toBe(true);
        }
      }, { timeoutMs: 15_000 });

      expect(lookupProcess(unregisteredAnchor.pid).kind).toBe('present');
    }, { timeoutMs: 15_000 });

    if (unregisteredIdentity === undefined) {
      throw new Error('separate fixture identity was not captured');
    }
    await expectStableOwnedAbsence(unregisteredIdentity, []);
  },
  15_000,
);

test(
  'rejects a structural OwnedProcess copy before any production group signal',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const ready = fixture.absentFile(markerDirectory, 'forged-ready');
      const term = fixture.absentFile(markerDirectory, 'forged-term');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => writeFileSync(process.env.TERM_MARKER, 'term')); writeFileSync(process.env.READY_MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { READY_MARKER: ready, TERM_MARKER: term },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(ready, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);
      const forged: OwnedProcess = Object.freeze({ ...owned });

      await expect(finalizeOwnedRun(forged, 250)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['unrecognized owned process'],
      });
      expect(existsSync(term)).toBe(false);
      expect(existsSync(root.path)).toBe(true);
      const lookup = lookupProcess(owned.anchor.pid);
      expect(lookup.kind).toBe('present');
      if (lookup.kind === 'present') {
        expect(sameIdentity(lookup.identity, owned.anchor)).toBe(true);
      }
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('forged OwnedProcess anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'keeps fake lookup evidence paired with an explicit fake signal actor',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const ready = fixture.absentFile(markerDirectory, 'fake-actor-ready');
      const term = fixture.absentFile(markerDirectory, 'fake-actor-term');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => writeFileSync(process.env.TERM_MARKER, 'term')); writeFileSync(process.env.READY_MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { READY_MARKER: ready, TERM_MARKER: term },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(ready, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      let clock = 0;
      let processLookups = 0;
      const signals: NodeJS.Signals[] = [];
      const actors = {
        assertOwnedProcess: () => undefined,
        lookupProcess: () => {
          processLookups += 1;
          return processLookups === 1
            ? { kind: 'present' as const, identity: owned.anchor, state: 'S' as const }
            : { kind: 'absent' as const };
        },
        lookupGroup: () => ({ kind: 'absent' as const }),
        now: () => clock,
        wait: async (milliseconds: number) => {
          clock += milliseconds;
        },
        signalGroup: (_processGroupId: number, signal: NodeJS.Signals) => {
          signals.push(signal);
        },
        finishCooperative: async () => undefined,
        reapEscalated: async () => undefined,
        removeRoot: () => ({ kind: 'removed' as const }),
        rootPathIsAbsent: () => true,
      } satisfies FinalizeTestActors;
      const testFinalize = createFinalizeOwnedRunForTests(actors);

      await expect(testFinalize(owned, 1_000)).resolves.toEqual({ kind: 'clean' });
      expect(signals).toEqual(['SIGTERM']);
      expect(existsSync(term)).toBe(false);
      expect(existsSync(root.path)).toBe(true);
      const lookup = lookupProcess(owned.anchor.pid);
      expect(lookup.kind).toBe('present');
      if (lookup.kind === 'present') {
        expect(sameIdentity(lookup.identity, owned.anchor)).toBe(true);
      }
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('fake-actor anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'accepts group absence before the TERM deadline and rejects it at the boundary',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'deadline-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      for (const [observedAt, expected] of [
        [99, { kind: 'clean' }],
        [
          100,
          {
            kind: 'failed',
            code: 70,
            diagnostics: ['TERM wait: absence observed at or after 100ms deadline'],
          },
        ],
      ] as const) {
        let clock = 0;
        let processLookups = 0;
        let groupLookups = 0;
        const testFinalize = createFinalizeOwnedRunForTests(
          finalizeTestActors({
            assertOwnedProcess: () => undefined,
            lookupProcess: () => {
              processLookups += 1;
              return processLookups === 1
                ? { kind: 'present', identity: owned.anchor, state: 'S' }
                : { kind: 'absent' };
            },
            lookupGroup: () => {
              groupLookups += 1;
              if (groupLookups === 1) {
                clock = observedAt;
              }
              return { kind: 'absent' };
            },
            now: () => clock,
            wait: async (milliseconds) => {
              clock += milliseconds;
            },
            signalGroup: () => undefined,
            finishCooperative: async () => undefined,
            reapEscalated: async () => undefined,
            removeRoot: () => ({ kind: 'removed' }),
            rootPathIsAbsent: () => true,
          }),
        );

        await expect(testFinalize(owned, 100)).resolves.toEqual(expected);
      }
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('deadline fixture anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'rejects an exact anchor identity returned at the signal deadline',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'identity-deadline-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      let clock = 0;
      let processLookups = 0;
      const signals: NodeJS.Signals[] = [];
      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          assertOwnedProcess: () => undefined,
          lookupProcess: () => {
            processLookups += 1;
            if (processLookups === 1) {
              clock = 100;
              return { kind: 'present', identity: owned.anchor, state: 'S' };
            }
            return { kind: 'absent' };
          },
          lookupGroup: () => ({ kind: 'absent' }),
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          },
          signalGroup: (_processGroupId, signal) => {
            signals.push(signal);
          },
          finishCooperative: async () => undefined,
          reapEscalated: async () => undefined,
          removeRoot: () => ({ kind: 'removed' }),
          rootPathIsAbsent: () => true,
        }),
      );

      await expect(testFinalize(owned, 100)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['TERM: identity observed at or after 100ms deadline'],
      });
      expect(signals).toEqual([]);
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('identity deadline anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'rejects complete group absence returned at the KILL deadline',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'kill-deadline-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      let clock = 0;
      let processLookups = 0;
      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          assertOwnedProcess: () => undefined,
          lookupProcess: () => {
            processLookups += 1;
            return processLookups <= 2
              ? { kind: 'present', identity: owned.anchor, state: 'S' }
              : { kind: 'absent' };
          },
          lookupGroup: (_processGroupId, _sessionId, excludedPids) => {
            if (excludedPids.size > 0) {
              return { kind: 'present', members };
            }
            clock = 200;
            return { kind: 'absent' };
          },
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          },
          signalGroup: () => undefined,
          finishCooperative: async () => undefined,
          reapEscalated: async () => undefined,
          removeRoot: () => ({ kind: 'removed' }),
          rootPathIsAbsent: () => true,
        }),
      );

      await expect(testFinalize(owned, 100)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['KILL absence: absence observed at or after 100ms deadline'],
      });
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('KILL deadline anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'stops after anchor absence is returned at the KILL deadline',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'kill-anchor-deadline-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      let clock = 0;
      let processLookups = 0;
      let fullGroupLookups = 0;
      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          assertOwnedProcess: () => undefined,
          lookupProcess: () => {
            processLookups += 1;
            if (processLookups <= 2) {
              return { kind: 'present', identity: owned.anchor, state: 'S' };
            }
            clock = 200;
            return { kind: 'absent' };
          },
          lookupGroup: (_processGroupId, _sessionId, excludedPids) => {
            if (excludedPids.size > 0) {
              return { kind: 'present', members };
            }
            fullGroupLookups += 1;
            return { kind: 'absent' };
          },
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          },
          signalGroup: () => undefined,
          finishCooperative: async () => undefined,
          reapEscalated: async () => undefined,
          removeRoot: () => ({ kind: 'removed' }),
          rootPathIsAbsent: () => true,
        }),
      );

      await expect(testFinalize(owned, 100)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['KILL absence: absence observed at or after 100ms deadline'],
      });
      expect(fullGroupLookups).toBe(0);
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('KILL anchor deadline identity was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'accepts five absent stabilization observations completed at 500ms',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'stabilization-late-success-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      let clock = 0;
      let processLookups = 0;
      let fullGroupLookups = 0;
      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          assertOwnedProcess: () => undefined,
          lookupProcess: () => {
            processLookups += 1;
            return processLookups === 1
              ? { kind: 'present', identity: owned.anchor, state: 'S' }
              : { kind: 'absent' };
          },
          lookupGroup: (_processGroupId, _sessionId, excludedPids) => {
            if (excludedPids.size === 0) {
              fullGroupLookups += 1;
              if (fullGroupLookups === 5) {
                clock = 500;
              }
            }
            return { kind: 'absent' };
          },
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          },
          signalGroup: () => undefined,
          finishCooperative: async () => undefined,
          reapEscalated: async () => undefined,
          removeRoot: () => ({ kind: 'removed' }),
          rootPathIsAbsent: () => true,
        }),
      );

      await expect(testFinalize(owned, 100)).resolves.toEqual({ kind: 'clean' });
      expect(fullGroupLookups).toBe(5);
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('late-success stabilization anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'rejects absence returned at the independent stabilization deadline',
  async () => {
    let anchor: ProcessIdentity | undefined;
    let members: readonly ProcessIdentity[] = [];

    await withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'stabilization-deadline-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      anchor = owned.anchor;
      members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      let clock = 0;
      let processLookups = 0;
      let fullGroupLookups = 0;
      const testFinalize = createFinalizeOwnedRunForTests(
        finalizeTestActors({
          assertOwnedProcess: () => undefined,
          lookupProcess: () => {
            processLookups += 1;
            return processLookups === 1
              ? { kind: 'present', identity: owned.anchor, state: 'S' }
              : { kind: 'absent' };
          },
          lookupGroup: (_processGroupId, _sessionId, excludedPids) => {
            if (excludedPids.size === 0) {
              fullGroupLookups += 1;
              if (fullGroupLookups === 3) {
                clock = 1_000;
              }
            }
            return { kind: 'absent' };
          },
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          },
          signalGroup: () => undefined,
          finishCooperative: async () => undefined,
          reapEscalated: async () => undefined,
          removeRoot: () => ({ kind: 'removed' }),
          rootPathIsAbsent: () => true,
        }),
      );

      await expect(testFinalize(owned, 100)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['stabilization: absence observed at or after 1000ms deadline'],
      });
      expect(fullGroupLookups).toBe(3);
    }, { timeoutMs: 15_000 });

    if (anchor === undefined) {
      throw new Error('stabilization deadline anchor was not captured');
    }
    await expectStableOwnedAbsence(anchor, members);
  },
  15_000,
);

test(
  'rejects cooperative group absence returned after the private finish deadline',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let delayed = false;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: ['-e', 'process.exitCode=0'],
          env: {},
        },
        fixtureDependencies(fixture, {
          lookupGroup: (processGroupId, sessionId, excludedPids) => {
            if (!delayed) {
              delayed = true;
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
            }
            return lookupGroup(processGroupId, sessionId, undefined, excludedPids);
          },
        }),
      );
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 2_000)).toEqual({ kind: 'exit', code: 0 });

      await expect(finishGatedProcess(owned, 10)).rejects.toMatchObject({
        exitCode: 70,
        message: 'group absence: absence observed at or after 10ms deadline',
      });
      expect(existsSync(root.path)).toBe(true);
    }),
  15_000,
);

test(
  'rejects cooperative anchor identity returned after the private finish deadline',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let processLookups = 0;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: ['-e', 'process.exitCode=0'],
          env: {},
        },
        fixtureDependencies(fixture, {
          lookupProcess: (pid) => {
            processLookups += 1;
            const lookup = lookupProcess(pid);
            if (processLookups === 3) {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
            }
            return lookup;
          },
          lookupGroup: () => ({ kind: 'absent' }),
        }),
      );
      await releaseGatedProcess(owned);
      expect(await waitForOwnedOutcome(owned, 2_000)).toEqual({ kind: 'exit', code: 0 });

      await expect(finishGatedProcess(owned, 10)).rejects.toMatchObject({
        exitCode: 70,
        message: 'group absence: anchor identity observed at or after 10ms deadline',
      });
      expect(existsSync(root.path)).toBe(true);
    }),
  15_000,
);

test(
  'rejects escalated anchor absence returned after the private reap deadline',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      const markerDirectory = fixture.createDirectory();
      const marker = fixture.absentFile(markerDirectory, 'private-reap-deadline-ready');
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: [
            '--input-type=module',
            '-e',
            "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => undefined); writeFileSync(process.env.MARKER, 'ready'); setInterval(() => undefined, 1000)",
          ],
          env: { MARKER: marker },
        },
        fixtureDependencies(fixture, {
          lookupProcess: (pid) => {
            const lookup = lookupProcess(pid);
            if (lookup.kind === 'absent') {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);
            }
            return lookup;
          },
        }),
      );
      await releaseGatedProcess(owned);
      await waitForFixtureFile(marker, 2_000);
      const members = await captureOwnedGroupMembers(owned.anchor, 2_000);

      await expect(finalizeOwnedRun(owned, 50)).resolves.toEqual({
        kind: 'failed',
        code: 70,
        diagnostics: ['gate absence: absence observed at or after 50ms deadline'],
      });
      expect(existsSync(root.path)).toBe(true);
      await expectStableOwnedAbsence(owned.anchor, members);
    }, { timeoutMs: 15_000 }),
  15_000,
);

test(
  'rejects registered child close observed after the escalation reap deadline despite signalCode',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let reapPhase = false;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: ['-e', 'setInterval(() => undefined, 1000)'],
          env: {},
        },
        fixtureDependencies(fixture, {
          lookupProcess: (pid) => reapPhase ? { kind: 'absent' } : lookupProcess(pid),
        }),
      );
      const stdout = owned.child.stdout;
      const stderr = owned.child.stderr;
      if (stdout === null || stderr === null) {
        throw new Error('fixture gate capture streams were unavailable');
      }
      const stdoutClosed = new Promise<void>((resolve) => stdout.once('close', resolve));
      const stderrClosed = new Promise<void>((resolve) => stderr.once('close', resolve));
      stdout.destroy();
      stderr.destroy();
      await Promise.all([stdoutClosed, stderrClosed]);

      Object.defineProperty(owned.child, 'signalCode', {
        configurable: true,
        enumerable: true,
        value: 'SIGKILL',
        writable: true,
      });
      reapPhase = true;
      const lateClose = new Promise<void>((resolve) => {
        setTimeout(() => {
          owned.child.emit('close', null, 'SIGKILL');
          resolve();
        }, 25);
      });

      try {
        await expect(reapEscalatedOwnedProcess(owned, 10)).rejects.toMatchObject({
          exitCode: 124,
          message: 'escalated gate reap: timed out after 10ms',
        });
      } finally {
        await lateClose;
        Object.defineProperty(owned.child, 'signalCode', {
          configurable: true,
          enumerable: true,
          value: null,
          writable: true,
        });
      }

      expect(existsSync(root.path)).toBe(true);
    }),
  15_000,
);

test(
  'rejects registered child close observed exactly at the escalation reap deadline',
  () =>
    withOwnedFixture(async (fixture) => {
      const root = fixture.createRoot();
      let reapPhase = false;
      const owned = await spawnGatedProcess(
        {
          root,
          command: process.execPath,
          args: ['-e', 'setInterval(() => undefined, 1000)'],
          env: {},
        },
        fixtureDependencies(fixture, {
          lookupProcess: (pid) => reapPhase ? { kind: 'absent' } : lookupProcess(pid),
        }),
      );
      const stdout = owned.child.stdout;
      const stderr = owned.child.stderr;
      if (stdout === null || stderr === null) {
        throw new Error('fixture gate capture streams were unavailable');
      }
      const stdoutClosed = new Promise<void>((resolve) => stdout.once('close', resolve));
      const stderrClosed = new Promise<void>((resolve) => stderr.once('close', resolve));
      stdout.destroy();
      stderr.destroy();
      await Promise.all([stdoutClosed, stderrClosed]);

      reapPhase = true;
      jest.useFakeTimers();
      const clock = jest
        .spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValue(10);
      try {
        setTimeout(() => owned.child.emit('close', null, 'SIGKILL'), 10);
        const reap = reapEscalatedOwnedProcess(owned, 10);
        const expectation = expect(reap).rejects.toMatchObject({
          exitCode: 124,
          message: 'escalated gate reap: timed out after 10ms',
        });

        await jest.advanceTimersByTimeAsync(10);
        await expectation;
      } finally {
        clock.mockRestore();
        jest.useRealTimers();
      }

      expect(existsSync(root.path)).toBe(true);
    }),
  15_000,
);
