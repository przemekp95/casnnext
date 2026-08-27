/** @jest-environment node */
import type { ChildProcess } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
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
  path: string;
  device: bigint;
  inode: bigint;
  readonly allowedBasenames: Set<string>;
};

type FixtureChild = Readonly<{
  child: ChildProcess;
  identity: ProcessIdentity;
}>;

function sameIdentity(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return (
    left.pid === right.pid &&
    left.startTime === right.startTime &&
    left.parentPid === right.parentPid &&
    left.processGroupId === right.processGroupId &&
    left.sessionId === right.sessionId
  );
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

  createRoot(): OwnedRoot {
    const root = createOwnedRoot();
    this.roots.push(root);
    return root;
  }

  createDirectory(): string {
    const path = mkdtempSync('/tmp/casn-gate-fixture-');
    const stat = lstatSync(path, { bigint: true });
    this.directories.push({ path, device: stat.dev, inode: stat.ino, allowedBasenames: new Set() });
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
    if (child.pid === undefined) {
      throw new Error('fixture child has no PID');
    }
    const lookup = lookupProcess(child.pid);
    if (lookup.kind !== 'present') {
      throw new Error(`fixture could not capture child identity: ${lookup.kind}`);
    }
    this.children.push({ child, identity: lookup.identity });
  }

  latestChild(): FixtureChild {
    const child = this.children.at(-1);
    if (child === undefined) {
      throw new Error('fixture has no captured child');
    }
    return child;
  }

  async cleanup(): Promise<void> {
    for (const captured of [...this.children].reverse()) {
      const lookup = lookupProcess(captured.identity.pid);
      if (lookup.kind === 'present' && sameIdentity(lookup.identity, captured.identity)) {
        try {
          process.kill(-captured.identity.processGroupId, 'SIGKILL');
        } catch (error: unknown) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
            throw error;
          }
        }
      }
      await waitForFixtureChildClose(captured.child, 2_000);
      await waitForFixtureProcessAbsence(captured.identity.pid, 2_000);
    }

    for (const root of [...this.roots].reverse()) {
      if (existsSync(root.path)) {
        const removal = removeOwnedRoot(root);
        if (removal.kind === 'failed') {
          throw new Error(`fixture root cleanup failed: ${removal.reason}`);
        }
      }
    }

    for (const directory of [...this.directories].reverse()) {
      if (!existsSync(directory.path)) {
        continue;
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
    observeSpawn: (child) => fixture.captureChild(child),
    gateEnvironment:
      options.gateEnvironment === undefined
        ? {}
        : { CASN_LIFECYCLE_TEST_GATE_MODE: '1', ...options.gateEnvironment },
    waitingTimeoutMs: options.waitingTimeoutMs ?? 1_000,
    unreleasedExitTimeoutMs: options.unreleasedExitTimeoutMs ?? 3_000,
  };
}

async function withOwnedFixture<T>(run: (fixture: OwnedFixture) => Promise<T>): Promise<T> {
  const fixture = new OwnedFixture();
  let runFailure: unknown;
  try {
    return await run(fixture);
  } catch (error: unknown) {
    runFailure = error;
    throw error;
  } finally {
    try {
      await fixture.cleanup();
    } catch (cleanupFailure: unknown) {
      if (runFailure !== undefined) {
        const runMessage = runFailure instanceof Error ? runFailure.message : 'unknown test failure';
        const cleanupMessage = cleanupFailure instanceof Error ? cleanupFailure.message : 'unknown cleanup failure';
        throw new AggregateError(
          [runFailure, cleanupFailure],
          `test failed (${runMessage}) and fixture cleanup failed (${cleanupMessage})`,
        );
      }
      throw cleanupFailure;
    }
  }
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
  'keeps the target closed and sends no signal when anchor identity changes before release',
  () =>
    withOwnedFixture(async (fixture) => {
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
        message: expect.stringContaining('identity changed before release'),
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(signals).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }),
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
