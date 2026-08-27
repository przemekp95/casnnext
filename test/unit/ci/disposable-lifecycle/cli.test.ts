/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import {
  runCli,
  runDefaultRootOnlyScenarioForTests,
  waitForTargetMemberForTests,
  type CliDependencies,
} from '@/scripts/ci/disposable-lifecycle/cli';
import { lookupProcess } from '@/scripts/ci/disposable-lifecycle/proc';
import {
  createOwnedRoot,
  removeOwnedRoot,
  type OwnedRoot,
} from '@/scripts/ci/disposable-lifecycle/owned-root';
import { LifecycleFailure, type ProcessIdentity } from '@/scripts/ci/disposable-lifecycle/types';

type CliResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

type SpawnOptions = Readonly<{
  environment?: Readonly<Record<string, string>>;
  requireOwnedEvidence?: boolean;
  signalAfterOwnedEvidence?: 'SIGTERM';
  signalAfterRootCreation?: 'SIGTERM';
  signalAfterStdout?: Readonly<{
    marker: string;
    signal: 'SIGTERM';
  }>;
}>;

type SerializedProcessIdentity = Readonly<{
  pid: number;
  startTime: string;
  parentPid: number;
  processGroupId: number;
  sessionId: number;
}>;

type OwnedProcessEvidence = Readonly<{
  schemaVersion: 1;
  ownedProcesses: readonly SerializedProcessIdentity[];
}>;

const repositoryRoot = resolve(__dirname, '../../../..');
const tsxBin = join(repositoryRoot, 'node_modules/.bin/tsx');
const cliPath = join(repositoryRoot, 'scripts/ci/disposable-lifecycle/cli.ts');
const shellPath = join(repositoryRoot, 'scripts/ci/with-disposable-app-regression-test.sh');
const outerDeadlineMs = 15_000;
const ownedEvidencePrefix = 'owned-process-evidence:';

type OwnedFixturePath = Readonly<{
  path: string;
  device: bigint;
  inode: bigint;
  type: bigint;
}>;

function captureFixturePath(path: string): OwnedFixturePath {
  const stat = lstatSync(path, { bigint: true });
  return {
    path,
    device: stat.dev,
    inode: stat.ino,
    type: stat.mode & BigInt(0o170000),
  };
}

function sameFixturePath(path: OwnedFixturePath): boolean {
  try {
    const stat = lstatSync(path.path, { bigint: true });
    return (
      stat.dev === path.device &&
      stat.ino === path.inode &&
      (stat.mode & BigInt(0o170000)) === path.type
    );
  } catch {
    return false;
  }
}

function removeOwnedFixtureLayout(paths: readonly OwnedFixturePath[]): void {
  for (const ownedPath of [...paths].reverse()) {
    if (!sameFixturePath(ownedPath)) {
      throw new Error(`shell fixture identity changed before cleanup:${ownedPath.path}`);
    }
    if (ownedPath.type === BigInt(0o040000)) {
      rmdirSync(ownedPath.path);
    } else {
      unlinkSync(ownedPath.path);
    }
    try {
      lstatSync(ownedPath.path);
      throw new Error(`shell fixture path remained after cleanup:${ownedPath.path}`);
    } catch (error: unknown) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }
  }
}

function completeOwnedRootTeardown(root: OwnedRoot, restoreEnvironment: () => void): void {
  let restorationFailure: unknown;
  try {
    restoreEnvironment();
  } catch (error: unknown) {
    restorationFailure = error;
  }

  let cleanupFailure: unknown;
  try {
    const removal = removeOwnedRoot(root);
    if (removal.kind === 'failed') {
      cleanupFailure = new Error(`owned root teardown failed:${removal.reason}`);
    }
  } catch (error: unknown) {
    cleanupFailure = error;
  }

  if (restorationFailure !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError(
      [restorationFailure, cleanupFailure],
      'environment restoration and owned root teardown failed',
    );
  }
  if (restorationFailure !== undefined) {
    throw restorationFailure;
  }
  if (cleanupFailure !== undefined) {
    throw cleanupFailure;
  }
}

function presentFailures(failures: readonly unknown[]): unknown[] {
  return failures.filter((failure) => failure !== undefined);
}

function lifecycleInventory(): readonly string[] {
  return readdirSync('/tmp')
    .filter(
      (basename) =>
        basename.startsWith('casn-quality-regression-') ||
        basename.startsWith('casn-gate-fixture-'),
    )
    .flatMap((basename) => {
      const path = join('/tmp', basename);
      try {
        const stat = lstatSync(path, { bigint: true });
        return [`${path}\t${stat.dev.toString(10)}\t${stat.ino.toString(10)}`];
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
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

function sameStableIdentity(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return (
    left.pid === right.pid &&
    left.startTime === right.startTime &&
    left.processGroupId === right.processGroupId &&
    left.sessionId === right.sessionId
  );
}

function inheritedEnvironment(overrides: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith('CASN_LIFECYCLE_TEST_')) {
      environment[name] = value;
    }
  }
  return { ...environment, ...overrides };
}

function expectedDirectChild(child: ChildProcess, identity: ProcessIdentity): boolean {
  return (
    child.pid !== undefined &&
    child.pid === identity.pid &&
    child.exitCode === null &&
    child.signalCode === null &&
    identity.parentPid === process.pid &&
    identity.pid === identity.processGroupId &&
    identity.pid === identity.sessionId
  );
}

async function waitForClose(child: ChildProcess, timeoutMs: number): Promise<number> {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  if (child.signalCode !== null) {
    throw new Error(`CLI fixture closed from unexpected signal ${child.signalCode}`);
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      new Promise<number>((resolveClose, rejectClose) => {
        child.once('error', rejectClose);
        child.once('close', (code, signal) => {
          if (signal !== null) {
            rejectClose(new Error(`CLI fixture closed from unexpected signal ${signal}`));
            return;
          }
          if (code === null) {
            rejectClose(new Error('CLI fixture closed without an exit status'));
            return;
          }
          resolveClose(code);
        });
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`CLI fixture exceeded ${timeoutMs}ms outer deadline`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function waitForAbsence(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const lookup = lookupProcess(pid);
    if (lookup.kind === 'absent') {
      return;
    }
    if (Date.now() >= deadline) {
      const detail = lookup.kind === 'unknown' ? `unknown:${lookup.reason}` : lookup.kind;
      throw new Error(`CLI fixture PID ${pid} remained ${detail}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

function parseOwnedProcessEvidence(stdout: string): readonly ProcessIdentity[] {
  const lines = stdout.split('\n');
  if (!stdout.endsWith('\n')) {
    lines.pop();
  }
  return lines.flatMap((line) => {
    if (!line.startsWith(ownedEvidencePrefix)) {
      return [];
    }
    const parsed: unknown = JSON.parse(line.slice(ownedEvidencePrefix.length));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('schemaVersion' in parsed) ||
      parsed.schemaVersion !== 1 ||
      !('ownedProcesses' in parsed) ||
      !Array.isArray(parsed.ownedProcesses)
    ) {
      throw new Error('CLI fixture received malformed owned-process evidence');
    }
    const evidence = parsed as OwnedProcessEvidence;
    return evidence.ownedProcesses.map((identity) => {
      if (
        !Number.isSafeInteger(identity.pid) ||
        identity.pid <= 0 ||
        !/^[1-9][0-9]*$/.test(identity.startTime) ||
        !Number.isSafeInteger(identity.parentPid) ||
        identity.parentPid <= 0 ||
        !Number.isSafeInteger(identity.processGroupId) ||
        identity.processGroupId <= 0 ||
        !Number.isSafeInteger(identity.sessionId) ||
        identity.sessionId <= 0
      ) {
        throw new Error('CLI fixture received malformed process identity evidence');
      }
      return {
        pid: identity.pid,
        startTime: BigInt(identity.startTime),
        parentPid: identity.parentPid,
        processGroupId: identity.processGroupId,
        sessionId: identity.sessionId,
      };
    });
  });
}

async function proveExactOwnedEvidenceAbsent(identities: readonly ProcessIdentity[]): Promise<void> {
  for (let observation = 0; observation < 5; observation += 1) {
    for (const identity of identities) {
      const lookup = lookupProcess(identity.pid);
      if (lookup.kind === 'unknown') {
        throw new Error(
          `CLI inner PID ${identity.pid} absence lookup remained unknown:${lookup.reason}`,
        );
      }
      if (lookup.kind === 'present' && sameStableIdentity(lookup.identity, identity)) {
        throw new Error(
          `CLI inner PID ${identity.pid}/${identity.startTime.toString(10)} remained present`,
        );
      }
    }
    if (observation < 4) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
}

async function executeOwnedCli(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): Promise<CliResult> {
  const before = lifecycleInventory();
  const gate = 'IFS= read -r token; [[ "$token" == release ]] || exit 70; exec "$@"';
  const child = spawn('bash', ['-c', gate, 'casn-cli-test-owner', command, ...args], {
    cwd: repositoryRoot,
    detached: true,
    env: inheritedEnvironment(options.environment ?? {}),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let identity: ProcessIdentity | undefined;
  let stdout = '';
  let stderr = '';
  let requestedSignal = false;
  let rootIdentityCaptured = false;
  let rootPoll: NodeJS.Timeout | undefined;
  let evidenceSignalPoll: NodeJS.Timeout | undefined;
  let executionFailure: unknown;
  let result: CliResult | undefined;

  try {
    if (child.pid === undefined) {
      throw new Error('CLI fixture spawn returned no PID');
    }
    const initial = lookupProcess(child.pid);
    if (initial.kind !== 'present' || !expectedDirectChild(child, initial.identity)) {
      const detail = initial.kind === 'unknown' ? `unknown:${initial.reason}` : initial.kind;
      throw new Error(`CLI fixture identity capture failed: ${detail}`);
    }
    identity = Object.freeze({ ...initial.identity });

    const requestOwnedSignal = (signal: 'SIGTERM'): void => {
      if (requestedSignal || identity === undefined) {
        return;
      }
      const fresh = lookupProcess(identity.pid);
      if (
        fresh.kind !== 'present' ||
        !sameIdentity(fresh.identity, identity) ||
        !expectedDirectChild(child, fresh.identity)
      ) {
        executionFailure = new Error('CLI fixture identity changed before requested signal');
        return;
      }
      requestedSignal = true;
      process.kill(identity.pid, signal);
    };
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      const signalRequest = options.signalAfterStdout;
      if (signalRequest !== undefined && stdout.includes(signalRequest.marker)) {
        requestOwnedSignal(signalRequest.signal);
      }
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
    });

    child.stdin?.end('release\n');
    if (options.signalAfterOwnedEvidence !== undefined) {
      evidenceSignalPoll = setInterval(() => {
        if (parseOwnedProcessEvidence(stdout).length > 0) {
          if (!rootIdentityCaptured) {
            rootIdentityCaptured = lifecycleInventory().some(
              (entry) =>
                entry.startsWith('/tmp/casn-quality-regression-') && !before.includes(entry),
            );
          }
          if (rootIdentityCaptured) {
            requestOwnedSignal(options.signalAfterOwnedEvidence ?? 'SIGTERM');
          }
        }
      }, 5);
    }
    if (options.signalAfterRootCreation !== undefined) {
      rootPoll = setInterval(() => {
        const createdRoot = lifecycleInventory().find(
          (entry) => entry.startsWith('/tmp/casn-quality-regression-') && !before.includes(entry),
        );
        if (createdRoot !== undefined) {
          rootIdentityCaptured = true;
          requestOwnedSignal(options.signalAfterRootCreation ?? 'SIGTERM');
        }
      }, 5);
    }
    const status = await waitForClose(child, outerDeadlineMs);
    if (executionFailure !== undefined) {
      throw executionFailure;
    }
    if (
      (options.signalAfterStdout !== undefined ||
        options.signalAfterRootCreation !== undefined ||
        options.signalAfterOwnedEvidence !== undefined) &&
      !requestedSignal
    ) {
      throw new Error('CLI fixture never reached its requested signal boundary');
    }
    if (
      (options.signalAfterRootCreation !== undefined ||
        options.signalAfterOwnedEvidence !== undefined) &&
      !rootIdentityCaptured
    ) {
      throw new Error('CLI fixture did not capture the created root identity before signaling');
    }
    const ownedEvidence = parseOwnedProcessEvidence(stdout);
    if (options.requireOwnedEvidence === true && ownedEvidence.length === 0) {
      throw new Error('CLI fixture received no owned-process evidence');
    }
    await proveExactOwnedEvidenceAbsent(ownedEvidence);
    result = { status, stdout, stderr };
  } catch (error: unknown) {
    executionFailure = error;
  } finally {
    if (rootPoll !== undefined) {
      clearInterval(rootPoll);
    }
    if (evidenceSignalPoll !== undefined) {
      clearInterval(evidenceSignalPoll);
    }
    let cleanupFailure: unknown;
    if (identity !== undefined) {
      const fresh = lookupProcess(identity.pid);
      if (fresh.kind === 'present') {
        if (!sameIdentity(fresh.identity, identity) || !expectedDirectChild(child, fresh.identity)) {
          cleanupFailure = new Error('CLI fixture identity changed before cleanup');
        } else {
          try {
            process.kill(-identity.processGroupId, 'SIGKILL');
          } catch (error: unknown) {
            cleanupFailure = error;
          }
        }
      } else if (fresh.kind === 'unknown') {
        cleanupFailure = new Error(`CLI fixture cleanup lookup unknown:${fresh.reason}`);
      }
      try {
        await waitForAbsence(identity.pid, 2_000);
      } catch (error: unknown) {
        cleanupFailure = cleanupFailure ?? error;
      }
    }

    const after = lifecycleInventory();
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      cleanupFailure = cleanupFailure ?? new Error(
        `CLI fixture inventory changed\nbefore=${JSON.stringify(before)}\nafter=${JSON.stringify(after)}`,
      );
    }
    if (cleanupFailure !== undefined) {
      if (executionFailure !== undefined) {
        throw new AggregateError([executionFailure, cleanupFailure], 'CLI execution and cleanup failed');
      }
      throw cleanupFailure;
    }
  }

  if (executionFailure !== undefined) {
    throw executionFailure;
  }
  if (result === undefined) {
    throw new Error('CLI fixture produced no result');
  }
  return result;
}

async function run(args: readonly string[], environment: Readonly<Record<string, string>> = {}): Promise<CliResult> {
  return executeOwnedCli(tsxBin, [cliPath, ...args], { environment });
}

test.each(['proc', 'root', 'process', 'cleanup', 'all-fast'] as const)(
  'runs the real typed %s scenario successfully',
  async (scenario) => {
    const options =
      scenario === 'process' || scenario === 'cleanup' || scenario === 'all-fast'
        ? { requireOwnedEvidence: true }
        : {};
    await expect(executeOwnedCli(tsxBin, [cliPath, scenario], options)).resolves.toMatchObject({
      status: 0,
      stderr: '',
    });
  },
  20_000,
);

test('reports an unknown scenario with usage status 64', async () => {
  await expect(run(['unknown-case'])).resolves.toMatchObject({
    status: 64,
    stderr: expect.stringContaining('unknown disposable lifecycle scenario: unknown-case'),
  });
});

test('preserves a typed initialization status without creating a root', async () => {
  const before = lifecycleInventory();
  let runnerCalled = false;
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const dependencies: CliDependencies = {
    createRoot: () => {
      throw new LifecycleFailure(97, 'injected initialization failure');
    },
    runFastScenario: async () => {
      runnerCalled = true;
      return 0;
    },
  };

  try {
    await expect(runCli(['proc'], dependencies)).resolves.toBe(97);
    expect(runnerCalled).toBe(false);
    expect(lifecycleInventory()).toEqual(before);
  } finally {
    stderr.mockRestore();
  }
});

test('runs original-root cleanup even when environment restoration fails', () => {
  const before = lifecycleInventory();
  const root = createOwnedRoot();
  let rescued = false;
  let failure: unknown;

  try {
    completeOwnedRootTeardown(root, () => {
      throw new Error('injected environment restoration failure');
    });
  } catch (error: unknown) {
    failure = error;
  } finally {
    if (existsSync(root.path)) {
      rescued = true;
      const rescue = removeOwnedRoot(root);
      if (rescue.kind === 'failed') {
        throw new Error(`teardown regression rescue failed:${rescue.reason}`);
      }
    }
  }

  expect(rescued).toBe(false);
  expect(failure).toEqual(new Error('injected environment restoration failure'));
  expect(lifecycleInventory()).toEqual(before);
});

test(
  'rejects the default scenario test seam outside test mode before process mutation',
  async () => {
    const harness = `
      import { runDefaultFastScenarioForTests } from './scripts/ci/disposable-lifecycle/cli.ts';
      import { createOwnedRoot, removeOwnedRoot } from './scripts/ci/disposable-lifecycle/owned-root.ts';
      import { LifecycleFailure } from './scripts/ci/disposable-lifecycle/types.ts';

      void (async () => {
        const root = createOwnedRoot();
        let status = 70;
        try {
          status = await runDefaultFastScenarioForTests('process', root);
        } catch (error: unknown) {
          process.stderr.write((error instanceof Error ? error.message : 'unknown error') + '\\n');
          status = error instanceof LifecycleFailure ? error.exitCode : 70;
        } finally {
          const removal = removeOwnedRoot(root);
          if (removal.kind === 'failed') {
            process.stderr.write('test seam root cleanup failed:' + removal.reason + '\\n');
            status = 70;
          }
        }
        process.exitCode = status;
      })();
    `;

    await expect(
      executeOwnedCli(tsxBin, ['-e', harness], { environment: { NODE_ENV: 'production' } }),
    ).resolves.toEqual({
      status: 64,
      stdout: '',
      stderr: 'default CLI scenario test boundary requires NODE_ENV=test\n',
    });
  },
  20_000,
);

test(
  'preserves SIGTERM status before root creation after bootstrap readiness',
  async () => {
    const result = await executeOwnedCli(tsxBin, [cliPath, 'proc'], {
      environment: {
        NODE_ENV: 'test',
        CASN_LIFECYCLE_TEST_INIT_DELAY_MS: '500',
      },
      signalAfterStdout: { marker: 'bootstrap-ready', signal: 'SIGTERM' },
    });

    expect(result).toMatchObject({ status: 143, stderr: '' });
  },
  20_000,
);

test(
  'preserves SIGTERM status after root creation when owned cleanup succeeds',
  async () => {
    const result = await executeOwnedCli(tsxBin, [cliPath, 'cleanup'], {
      requireOwnedEvidence: true,
      signalAfterOwnedEvidence: 'SIGTERM',
    });

    expect(result).toMatchObject({ status: 143, stderr: '' });
  },
  20_000,
);

test(
  'records cleanup diagnostics and concurrent SIGTERM while cleanup status 70 wins',
  async () => {
    const harness = `
      import { runCli, runDefaultFastScenarioForTests } from './scripts/ci/disposable-lifecycle/cli.ts';
      import { createOwnedRoot, removeOwnedRoot } from './scripts/ci/disposable-lifecycle/owned-root.ts';
      import type { CliDependencies } from './scripts/ci/disposable-lifecycle/cli.ts';
      import type { OwnedRoot } from './scripts/ci/disposable-lifecycle/owned-root.ts';

      void (async () => {
        let createdRoot: OwnedRoot | undefined;
        const dependencies: CliDependencies = {
          createRoot: () => {
            createdRoot = createOwnedRoot();
            return createdRoot;
          },
          runFastScenario: async (scenario, root) => {
            const previous = process.env.NODE_OPTIONS;
            process.env.NODE_OPTIONS = '--import=data:text/javascript,process.stdout.write(Buffer.alloc(1048577,120))';
            try {
              return await runDefaultFastScenarioForTests(scenario, root);
            } finally {
              if (previous === undefined) {
                delete process.env.NODE_OPTIONS;
              } else {
                process.env.NODE_OPTIONS = previous;
              }
            }
          },
        };
        let status = 70;
        try {
          status = await runCli(['cleanup'], dependencies);
        } finally {
          if (createdRoot !== undefined) {
            const removal = removeOwnedRoot(createdRoot);
            if (removal.kind === 'failed' && removal.reason !== 'root-closed') {
              process.stderr.write('fixture root cleanup failed:' + removal.reason + '\\n');
              status = 70;
            }
          }
        }
        process.exitCode = status;
      })();
    `;

    const result = await executeOwnedCli(tsxBin, ['-e', harness], {
      environment: { NODE_ENV: 'test' },
      requireOwnedEvidence: true,
      signalAfterOwnedEvidence: 'SIGTERM',
    });

    expect(result.status).toBe(70);
    expect(result.stderr).toContain('stdout exceeded 1048576 byte capture limit');
    expect(result.stderr).toContain('"kind":"signal","signal":"SIGTERM","status":143');
  },
  20_000,
);

test(
  'records root-only removal diagnostics and an unavailable concurrent outcome',
  async () => {
    const before = lifecycleInventory();
    let root: OwnedRoot | undefined;
    const diagnostics: string[] = [];
    let stderr: jest.SpiedFunction<typeof process.stderr.write> | undefined;
    let removalCalls = 0;
    let status: number | undefined;
    let operationFailure: unknown;
    let removalFailure: unknown;
    let restorationFailure: unknown;

    try {
      root = createOwnedRoot();
      try {
        stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
          diagnostics.push(String(chunk));
          return true;
        });
        const createdRoot = root;
        const dependencies: CliDependencies = {
          createRoot: () => createdRoot,
          runFastScenario: async (_scenario, ownedRoot) =>
            runDefaultRootOnlyScenarioForTests('proc', ownedRoot, {
              removeRoot: () => {
                removalCalls += 1;
                if (removalCalls !== 1) {
                  throw new Error('root-only removal actor was called more than once');
                }
                return { kind: 'failed', reason: 'filesystem-error' };
              },
            }),
        };
        status = await runCli(['proc'], dependencies);
      } catch (error: unknown) {
        operationFailure = error;
      } finally {
        try {
          const removal = removeOwnedRoot(root);
          if (removal.kind === 'failed') {
            removalFailure = new Error(`root-only fixture cleanup failed:${removal.reason}`);
          }
        } catch (error: unknown) {
          removalFailure = error;
        }
      }
    } catch (error: unknown) {
      operationFailure = error;
    } finally {
      try {
        stderr?.mockRestore();
      } catch (error: unknown) {
        restorationFailure = error;
      }
    }

    const failures = presentFailures([operationFailure, removalFailure, restorationFailure]);
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'root-only operation, removal, or restoration failed');
    }
    expect(status).toBe(70);
    expect(removalCalls).toBe(1);
    expect(diagnostics.join('')).toContain(
      '"diagnostics":["owned root removal failed:filesystem-error"]',
    );
    expect(diagnostics.join('')).toContain('"concurrent":{"kind":"unavailable"}');
    expect(lifecycleInventory()).toEqual(before);
  },
);

test('restores CLI listeners and interruption state when cleanup reporting throws', async () => {
  const beforeInventory = lifecycleInventory();
  let root: OwnedRoot | undefined;
  const signals = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;
  const listenerSnapshots = signals.map((signal) => ({
    signal,
    listeners: process.rawListeners(signal),
  }));
  let stderr: jest.SpiedFunction<typeof process.stderr.write> | undefined;
  let runFailure: unknown;
  let operationFailure: unknown;
  let removalFailure: unknown;
  const postRemovalFailures: unknown[] = [];
  let stateCleared = false;
  let probeRemovalCalls = 0;
  let listenersRestored = false;

  try {
    root = createOwnedRoot();
    try {
      stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => {
        throw new Error('injected cleanup report failure');
      });
      const createdRoot = root;
      const dependencies: CliDependencies = {
        createRoot: () => createdRoot,
        runFastScenario: async (_scenario, ownedRoot) =>
          runDefaultRootOnlyScenarioForTests('proc', ownedRoot, {
            removeRoot: () => ({ kind: 'failed', reason: 'filesystem-error' }),
          }),
      };
      try {
        await runCli(['proc'], dependencies);
      } catch (error: unknown) {
        runFailure = error;
      }
    } catch (error: unknown) {
      operationFailure = error;
    } finally {
      try {
        const removal = removeOwnedRoot(root);
        if (removal.kind === 'failed') {
          removalFailure = new Error(`report-throw fixture cleanup failed:${removal.reason}`);
        }
      } catch (error: unknown) {
        removalFailure = error;
      }
    }
  } catch (error: unknown) {
    operationFailure = error;
  } finally {
    try {
      stderr?.mockRestore();
    } catch (error: unknown) {
      postRemovalFailures.push(error);
    }
    try {
      listenersRestored = listenerSnapshots.every(
        ({ signal, listeners }) =>
          process.rawListeners(signal).length === listeners.length &&
          process.rawListeners(signal).every((listener, index) => listener === listeners[index]),
      );
    } catch (error: unknown) {
      postRemovalFailures.push(error);
    }
    try {
      if (root !== undefined) {
        await runDefaultRootOnlyScenarioForTests('proc', root, {
          removeRoot: () => {
            probeRemovalCalls += 1;
            return { kind: 'failed', reason: 'filesystem-error' };
          },
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'CLI interruption context is unavailable') {
        stateCleared = true;
      } else {
        postRemovalFailures.push(error);
      }
    }
    for (const { signal, listeners } of listenerSnapshots) {
      for (const listener of process.rawListeners(signal)) {
        if (!listeners.includes(listener)) {
          try {
            process.off(signal, listener as () => void);
          } catch (error: unknown) {
            postRemovalFailures.push(error);
          }
        }
      }
    }
  }

  const unexpectedFailures = presentFailures([
    operationFailure,
    removalFailure,
    ...postRemovalFailures,
  ]);
  if (unexpectedFailures.length === 1) {
    throw unexpectedFailures[0];
  }
  if (unexpectedFailures.length > 1) {
    throw new AggregateError(unexpectedFailures, 'report-throw fixture teardown failed');
  }
  expect(runFailure).toEqual(new Error('injected cleanup report failure'));
  expect(listenersRestored).toBe(true);
  expect(stateCleared).toBe(true);
  expect(probeRemovalCalls).toBe(0);
  expect(lifecycleInventory()).toEqual(beforeInventory);
});

test('rejects a process-owning runtime value at the root-only seam before mutation', async () => {
  const inertRoot = Object.freeze({}) as OwnedRoot;
  let actorCalled = false;

  await expect(
    Promise.resolve().then(() =>
      runDefaultRootOnlyScenarioForTests('process' as 'proc', inertRoot, {
        removeRoot: () => {
          actorCalled = true;
          return { kind: 'failed', reason: 'filesystem-error' };
        },
      }),
    ),
  ).rejects.toMatchObject({
    exitCode: 64,
    message: 'root-only CLI scenario test boundary requires proc or root',
  });
  expect(actorCalled).toBe(false);
});

test.each([
  ['before', 2_999, 'success'],
  ['at', 3_000, 'timeout'],
] as const)(
  'treats target readiness observed %s the monotonic deadline',
  async (_boundary, observedAt, expected) => {
    const member: ProcessIdentity = {
      pid: 43,
      startTime: BigInt(101),
      parentPid: 42,
      processGroupId: 42,
      sessionId: 42,
    };
    const times = [0, observedAt];
    let waits = 0;
    const readiness = Promise.resolve().then(() =>
      waitForTargetMemberForTests(
        { anchorPid: 42, processGroupId: 42, sessionId: 42 },
        new AbortController().signal,
        {
          lookupGroup: () => ({ kind: 'present', members: [member] }),
          now: () => times.shift() ?? observedAt,
          wait: async () => {
            waits += 1;
          },
        },
      ),
    );

    if (expected === 'success') {
      await expect(readiness).resolves.toEqual([member]);
    } else {
      await expect(readiness).rejects.toMatchObject({
        exitCode: 124,
        message: 'scenario target did not start within 3000ms',
      });
    }
    expect(waits).toBe(0);
  },
);

test('returns status 70 and restores state when ordinary failure reporting cannot write', async () => {
  const inertRoot = Object.freeze({}) as OwnedRoot;
  const signals = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;
  const listenerSnapshots = signals.map((signal) => ({
    signal,
    listeners: process.rawListeners(signal),
  }));
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => {
    throw new Error('injected ordinary report write failure');
  });
  let status: number | undefined;
  let runFailure: unknown;
  let restorationFailure: unknown;
  const rescueFailures: unknown[] = [];
  let stateCleared = false;
  let actorCalled = false;
  let listenersRestored = false;
  const dependencies: CliDependencies = {
    createRoot: () => inertRoot,
    runFastScenario: async () => {
      throw new LifecycleFailure(91, 'injected scenario failure');
    },
  };

  try {
    status = await runCli(['proc'], dependencies);
  } catch (error: unknown) {
    runFailure = error;
  } finally {
    try {
      stderr.mockRestore();
    } catch (error: unknown) {
      restorationFailure = error;
    }
    try {
      listenersRestored = listenerSnapshots.every(
        ({ signal, listeners }) =>
          process.rawListeners(signal).length === listeners.length &&
          process.rawListeners(signal).every((listener, index) => listener === listeners[index]),
      );
    } catch (error: unknown) {
      rescueFailures.push(error);
    }
    try {
      await runDefaultRootOnlyScenarioForTests('proc', inertRoot, {
        removeRoot: () => {
          actorCalled = true;
          return { kind: 'failed', reason: 'filesystem-error' };
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'CLI interruption context is unavailable') {
        stateCleared = true;
      } else {
        rescueFailures.push(error);
      }
    }
    for (const { signal, listeners } of listenerSnapshots) {
      for (const listener of process.rawListeners(signal)) {
        if (!listeners.includes(listener)) {
          try {
            process.off(signal, listener as () => void);
          } catch (error: unknown) {
            rescueFailures.push(error);
          }
        }
      }
    }
  }

  const failures = presentFailures([restorationFailure, ...rescueFailures]);
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'ordinary reporting fixture restoration failed');
  }
  expect(runFailure).toBeUndefined();
  expect(status).toBe(70);
  expect(listenersRestored).toBe(true);
  expect(stateCleared).toBe(true);
  expect(actorCalled).toBe(false);
});

test(
  'read-only inner evidence rejects a live stable identity after diagnostic PPID changes',
  async () => {
    const gate = 'IFS= read -r token; [[ "$token" == release ]] || exit 70; exec "$@"';
    const leaked = spawn(
      'bash',
      ['-c', gate, 'casn-inner-evidence-owner', process.execPath, '-e', 'setInterval(() => undefined, 1000)'],
      { cwd: repositoryRoot, detached: true, stdio: ['pipe', 'ignore', 'ignore'] },
    );
    let identity: ProcessIdentity | undefined;
    let testFailure: unknown;

    try {
      if (leaked.pid === undefined) {
        throw new Error('inner evidence fixture spawn returned no PID');
      }
      const initial = lookupProcess(leaked.pid);
      if (initial.kind !== 'present' || !expectedDirectChild(leaked, initial.identity)) {
        throw new Error('inner evidence fixture identity capture failed');
      }
      identity = Object.freeze({ ...initial.identity });
      leaked.stdin?.end('release\n');
      const serialized = JSON.stringify({
        schemaVersion: 1,
        ownedProcesses: [
          {
            ...identity,
            startTime: identity.startTime.toString(10),
            parentPid: identity.parentPid + 1,
          },
        ],
      });

      await expect(
        executeOwnedCli(process.execPath, [
          '-e',
          `process.stdout.write(${JSON.stringify(`${ownedEvidencePrefix}${serialized}\n`)})`,
        ]),
      ).rejects.toThrow(
        `CLI inner PID ${identity.pid}/${identity.startTime.toString(10)} remained present`,
      );

      const afterEvidence = lookupProcess(identity.pid);
      expect(afterEvidence.kind).toBe('present');
      if (afterEvidence.kind === 'present') {
        expect(sameIdentity(afterEvidence.identity, identity)).toBe(true);
      }
    } catch (error: unknown) {
      testFailure = error;
    } finally {
      let cleanupFailure: unknown;
      if (identity !== undefined) {
        const fresh = lookupProcess(identity.pid);
        if (
          fresh.kind !== 'present' ||
          !sameIdentity(fresh.identity, identity) ||
          !expectedDirectChild(leaked, fresh.identity)
        ) {
          cleanupFailure = new Error('inner evidence fixture identity changed before cleanup');
        } else {
          process.kill(-identity.processGroupId, 'SIGKILL');
          try {
            await waitForAbsence(identity.pid, 2_000);
          } catch (error: unknown) {
            cleanupFailure = error;
          }
        }
      }
      if (cleanupFailure !== undefined) {
        if (testFailure !== undefined) {
          throw new AggregateError([testFailure, cleanupFailure]);
        }
        throw cleanupFailure;
      }
    }
    if (testFailure !== undefined) {
      throw testFailure;
    }
  },
  20_000,
);

test.each([
  ['pid', 0],
  ['startTime', 0],
  ['parentPid', 0],
  ['processGroupId', 0],
  ['sessionId', 0],
] as const)(
  'rejects non-positive serialized owned-process evidence field %s',
  async (field, value) => {
    const serialized = JSON.stringify({
      schemaVersion: 1,
      ownedProcesses: [
        {
          pid: 1,
          startTime: '1',
          parentPid: 1,
          processGroupId: 1,
          sessionId: 1,
          [field]: value,
        },
      ],
    });

    await expect(
      executeOwnedCli(process.execPath, [
        '-e',
        `process.stdout.write(${JSON.stringify(`${ownedEvidencePrefix}${serialized}\n`)})`,
      ]),
    ).rejects.toThrow('CLI fixture received malformed process identity evidence');
  },
  20_000,
);

test('rejects the initialization delay outside test mode', async () => {
  await expect(
    run(['proc'], {
      NODE_ENV: 'production',
      CASN_LIFECYCLE_TEST_INIT_DELAY_MS: '500',
    }),
  ).resolves.toMatchObject({
    status: 64,
    stderr: expect.stringContaining(
      'CASN_LIFECYCLE_TEST_INIT_DELAY_MS is available only when NODE_ENV=test',
    ),
  });
});

test('keeps the Bash entrypoint behaviorally compatible with the typed proc scenario', async () => {
  await expect(executeOwnedCli('bash', [shellPath, 'proc'])).resolves.toMatchObject({
    status: 0,
    stderr: '',
  });
});

test.each([
  { label: 'absent', environment: {}, expected: 'absent' },
  {
    label: 'explicit',
    environment: { NODE_ENV: 'development' },
    expected: 'development',
  },
] as const)(
  'runs the nonempty gate environment with $label NODE_ENV through the repository-local tsx loader',
  async ({ environment, expected }) => {
    const harness = `
      import { readFileSync } from 'node:fs';
      import { performance } from 'node:perf_hooks';
      import { finalizeOwnedRun, resolveExitStatus } from './scripts/ci/disposable-lifecycle/finalize.ts';
      import { createOwnedRoot, removeOwnedRoot } from './scripts/ci/disposable-lifecycle/owned-root.ts';
      import { releaseGatedProcess, spawnGatedProcess, waitForOwnedOutcome } from './scripts/ci/disposable-lifecycle/owned-process.ts';
      import { lookupGroup, lookupProcess } from './scripts/ci/disposable-lifecycle/proc.ts';
      import type { OwnedRoot } from './scripts/ci/disposable-lifecycle/owned-root.ts';
      import type { OwnedProcess } from './scripts/ci/disposable-lifecycle/owned-process.ts';
      import type { ProcessIdentity } from './scripts/ci/disposable-lifecycle/types.ts';

      const same = (left: ProcessIdentity, right: ProcessIdentity): boolean =>
        left.pid === right.pid && left.startTime === right.startTime &&
        left.parentPid === right.parentPid &&
        left.processGroupId === right.processGroupId && left.sessionId === right.sessionId;

      void (async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        delete process.env.NODE_ENV;
        let root: OwnedRoot | undefined;
        let owned: OwnedProcess | undefined;
        let observed: ProcessIdentity | undefined;
        let finalized = false;
        let status = 70;
        try {
          root = createOwnedRoot();
          owned = await spawnGatedProcess(
            {
              root,
              command: process.execPath,
              args: ['-e', "process.stdout.write('node-env=' + (process.env.NODE_ENV ?? 'absent') + '\\\\n'); setTimeout(() => undefined, 500)"],
              env: ${JSON.stringify(environment)},
            },
            {
              lookupProcess,
              lookupGroup: (processGroupId, sessionId, excludedPids) =>
                lookupGroup(processGroupId, sessionId, undefined, excludedPids),
              signal: (pid, signal) => process.kill(pid, signal),
              observeSpawn: (child) => {
                if (child.pid === undefined) {
                  throw new Error('gate environment fixture spawn returned no PID');
                }
                const lookup = lookupProcess(child.pid);
                if (
                  lookup.kind !== 'present' || lookup.identity.parentPid !== process.pid ||
                  lookup.identity.pid !== lookup.identity.processGroupId ||
                  lookup.identity.pid !== lookup.identity.sessionId
                ) {
                  throw new Error('gate environment fixture identity capture failed');
                }
                observed = Object.freeze({ ...lookup.identity });
              },
              gateEnvironment: ${JSON.stringify({
                ...environment,
                CASN_LIFECYCLE_TEST_GATE_MODE: '1',
              })},
              waitingTimeoutMs: 1000,
              unreleasedExitTimeoutMs: 3000,
            },
          );
          if (observed === undefined || !same(observed, owned.anchor)) {
            throw new Error('gate environment fixture returned a different owner identity');
          }
          await releaseGatedProcess(owned);
          let members: readonly ProcessIdentity[] = [];
          const deadline = Date.now() + 3000;
          while (members.length === 0) {
            const group = lookupGroup(
              owned.anchor.processGroupId,
              owned.anchor.sessionId,
              undefined,
              new Set([owned.anchor.pid]),
            );
            if (group.kind === 'unknown') {
              throw new Error('gate environment fixture group lookup unknown:' + group.reason);
            }
            if (group.kind === 'present') {
              members = group.members;
              break;
            }
            if (Date.now() >= deadline) {
              throw new Error('gate environment fixture target did not start');
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 10));
          }
          process.stdout.write('${ownedEvidencePrefix}' + JSON.stringify({
            schemaVersion: 1,
            ownedProcesses: [owned.anchor, ...members].map((identity) => ({
              ...identity,
              startTime: identity.startTime.toString(10),
            })),
          }) + '\\n');
          const outcome = await waitForOwnedOutcome(owned, 3000);
          const outputDeadline = performance.now() + 1000;
          let targetOutput = '';
          while (true) {
            targetOutput = readFileSync(owned.stdoutPath, 'utf8');
            const observedAt = performance.now();
            if (targetOutput === ${JSON.stringify(`node-env=${expected}\n`)}) {
              if (observedAt >= outputDeadline) {
                throw new Error('spawn boundary marker observed at or after deadline');
              }
              break;
            }
            if (targetOutput !== '' || observedAt >= outputDeadline) {
              break;
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 10));
          }
          if (targetOutput !== ${JSON.stringify(`node-env=${expected}\n`)}) {
            throw new Error(
              'spawn boundary injected ambient NODE_ENV:' + JSON.stringify(targetOutput) +
              ' outcome=' + JSON.stringify(outcome) +
              ' stderr=' + JSON.stringify(readFileSync(owned.stderrPath, 'utf8'))
            );
          }
          const cleanup = await finalizeOwnedRun(owned, 3000);
          finalized = true;
          status = resolveExitStatus(outcome, cleanup);
        } finally {
          if (owned !== undefined && !finalized) {
            const cleanup = await finalizeOwnedRun(owned, 3000);
            if (cleanup.kind === 'failed') {
              process.stderr.write(cleanup.diagnostics.join('\\n') + '\\n');
            }
          } else if (owned === undefined && root !== undefined) {
            const removal = removeOwnedRoot(root);
            if (removal.kind === 'failed') {
              process.stderr.write('gate environment root cleanup failed:' + removal.reason + '\\n');
            }
          }
          if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
          } else {
            process.env.NODE_ENV = originalNodeEnv;
          }
        }
        process.exitCode = status;
      })();
    `;

    await expect(
      executeOwnedCli(tsxBin, ['-e', harness], { requireOwnedEvidence: true }),
    ).resolves.toMatchObject({ status: 0, stderr: '' });
  },
  20_000,
);

test(
  'returns status 69 and the exact message when the copied shell layout has no local tsx',
  async () => {
    const paths: OwnedFixturePath[] = [];
    let testFailure: unknown;
    try {
      const root = mkdtempSync('/tmp/casn-shell-fixture-');
      paths.push(captureFixturePath(root));
      const scripts = join(root, 'scripts');
      mkdirSync(scripts, { mode: 0o700 });
      paths.push(captureFixturePath(scripts));
      const ci = join(scripts, 'ci');
      mkdirSync(ci, { mode: 0o700 });
      paths.push(captureFixturePath(ci));
      const copiedShell = join(ci, 'with-disposable-app-regression-test.sh');
      writeFileSync(copiedShell, readFileSync(shellPath), { mode: 0o700 });
      chmodSync(copiedShell, 0o700);
      paths.push(captureFixturePath(copiedShell));

      const result = await executeOwnedCli('bash', [copiedShell, 'proc']);
      expect(result).toEqual({
        status: 69,
        stdout: '',
        stderr: 'repository-local tsx is unavailable; run npm ci\n',
      });
    } catch (error: unknown) {
      testFailure = error;
    } finally {
      let cleanupFailure: unknown;
      try {
        removeOwnedFixtureLayout(paths);
      } catch (error: unknown) {
        cleanupFailure = error;
      }
      if (cleanupFailure !== undefined) {
        if (testFailure !== undefined) {
          throw new AggregateError([testFailure, cleanupFailure]);
        }
        throw cleanupFailure;
      }
    }
    if (testFailure !== undefined) {
      throw testFailure;
    }
  },
  20_000,
);
