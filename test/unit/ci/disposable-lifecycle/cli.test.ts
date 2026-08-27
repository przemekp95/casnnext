/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runCli, type CliDependencies } from '@/scripts/ci/disposable-lifecycle/cli';
import { lookupProcess } from '@/scripts/ci/disposable-lifecycle/proc';
import { LifecycleFailure, type ProcessIdentity } from '@/scripts/ci/disposable-lifecycle/types';

type CliResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

type SpawnOptions = Readonly<{
  environment?: Readonly<Record<string, string>>;
  signalAfterRootCreation?: 'SIGTERM';
  signalAfterStdout?: Readonly<{
    marker: string;
    signal: 'SIGTERM';
  }>;
}>;

const repositoryRoot = resolve(__dirname, '../../../..');
const tsxBin = join(repositoryRoot, 'node_modules/.bin/tsx');
const cliPath = join(repositoryRoot, 'scripts/ci/disposable-lifecycle/cli.ts');
const shellPath = join(repositoryRoot, 'scripts/ci/with-disposable-app-regression-test.sh');
const outerDeadlineMs = 15_000;

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
      (options.signalAfterStdout !== undefined || options.signalAfterRootCreation !== undefined) &&
      !requestedSignal
    ) {
      throw new Error('CLI fixture never reached its requested signal boundary');
    }
    if (options.signalAfterRootCreation !== undefined && !rootIdentityCaptured) {
      throw new Error('CLI fixture did not capture the created root identity before signaling');
    }
    result = { status, stdout, stderr };
  } catch (error: unknown) {
    executionFailure = error;
  } finally {
    if (rootPoll !== undefined) {
      clearInterval(rootPoll);
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
    await expect(run([scenario])).resolves.toMatchObject({ status: 0, stderr: '' });
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
      signalAfterRootCreation: 'SIGTERM',
    });

    expect(result).toMatchObject({ status: 143, stderr: '' });
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
