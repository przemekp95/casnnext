/** @jest-environment node */
jest.mock('node:child_process', () => ({
  ...jest.requireActual<typeof import('node:child_process')>('node:child_process'),
  spawnSync: jest.fn(() => {
    throw new Error('evidence export invoked child_process.spawnSync');
  }),
}));

import { spawnSync as mockedSpawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  diffHarnessInventory,
  inspectDescendantReadiness,
  parseHarnessEvidence,
  verifyDescendantAbsence,
  verifyHarnessAbsence,
  type HarnessInventory,
} from '@/scripts/ci/disposable-lifecycle/harness-evidence';
import {
  runHarnessReadOnlyQueryForTests,
  type HarnessReadOnlyQueryActor,
} from '@/scripts/ci/disposable-lifecycle/harness-scenarios';

type CapturedPath = Readonly<{
  path: string;
  device: bigint;
  inode: bigint;
  type: bigint;
}>;

const fileTypeMask = 0o170000n;

function capturePath(path: string): CapturedPath {
  const stat = lstatSync(path, { bigint: true });
  return {
    path,
    device: stat.dev,
    inode: stat.ino,
    type: stat.mode & fileTypeMask,
  };
}

function requireCapturedPath(captured: CapturedPath): void {
  const current = lstatSync(captured.path, { bigint: true });
  if (
    current.dev !== captured.device ||
    current.ino !== captured.inode ||
    (current.mode & fileTypeMask) !== captured.type ||
    current.isSymbolicLink()
  ) {
    throw new Error(`harness evidence fixture identity changed:${captured.path}`);
  }
}

test('treats forged harness resources as diagnostic evidence without mutating their targets', () => {
  const victimPath = '/tmp/casn-quality.FORGED';
  const sentinelPath = join(victimPath, 'sentinel');
  let victim: CapturedPath | undefined;
  let sentinel: CapturedPath | undefined;
  let operationFailure: unknown;
  let cleanupFailure: unknown;
  let parsed: ReturnType<typeof parseHarnessEvidence> | undefined;
  let difference: ReturnType<typeof diffHarnessInventory> | undefined;
  let verification: ReturnType<typeof verifyHarnessAbsence> | undefined;
  let descendantReadiness: ReturnType<typeof inspectDescendantReadiness> | undefined;
  let descendantAbsence: ReturnType<typeof verifyDescendantAbsence> | undefined;
  let observedSentinel: string | undefined;

  try {
    mkdirSync(victimPath, { mode: 0o700 });
    victim = capturePath(victimPath);
    writeFileSync(sentinelPath, 'keep', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    sentinel = capturePath(sentinelPath);

    try {
      const before: HarnessInventory = {
        docker: ['old-id\tcasn-quality-old'],
        listeners: ['LISTEN 0 511 127.0.0.1:31337'],
        tempRoots: ['/tmp/casn-quality.OLD\t1\t2'],
        processes: ['101\t1\t101\t101\tbash accepted-baseline'],
      };
      const after: HarnessInventory = {
        docker: [...before.docker, 'new-id\tcasn-quality-new'],
        listeners: [...before.listeners, 'LISTEN 0 511 127.0.0.1:33061'],
        tempRoots: [...before.tempRoots, '/tmp/casn-quality.NEW\t3\t4'],
        processes: [...before.processes, '202\t1\t202\t202\tbash new-invocation'],
      };

      parsed = parseHarnessEvidence(
        '[disposable-app] resources container=casn-quality-999-aaaaaaaaaaaa-mysql temp_dir=/tmp/casn-quality.FORGED\n',
      );
      difference = diffHarnessInventory(before, after);
      verification = verifyHarnessAbsence(parsed, before, after, {
        container: 'absent',
        tempRoot: 'present',
        appPort: 'absent',
      });
      descendantReadiness = inspectDescendantReadiness(
        `[harness-child] ignored-descendant case=leader-exit pid=${process.pid}\n`,
        'leader-exit',
      );
      descendantAbsence = verifyDescendantAbsence(descendantReadiness, 'present');
      observedSentinel = readFileSync(sentinelPath, 'utf8');
    } catch (error: unknown) {
      operationFailure = error;
    } finally {
      try {
        if (sentinel !== undefined) {
          requireCapturedPath(sentinel);
          unlinkSync(sentinel.path);
        }
        if (victim !== undefined) {
          requireCapturedPath(victim);
          rmdirSync(victim.path);
        }
      } catch (error: unknown) {
        cleanupFailure = error;
      }
    }
  } catch (error: unknown) {
    operationFailure = operationFailure ?? error;
  }

  const failures = [operationFailure, cleanupFailure].filter(
    (failure): failure is NonNullable<typeof failure> => failure !== undefined,
  );
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'harness evidence operation and fixture cleanup failed');
  }

  expect(parsed).toEqual({
    resources: {
      container: 'casn-quality-999-aaaaaaaaaaaa-mysql',
      tempRoot: '/tmp/casn-quality.FORGED',
      appPort: 31337,
    },
    cleanup: undefined,
    readiness: {
      mysqlFinalServer: false,
      applicationUserSelect: false,
      applicationHealthy: false,
    },
    diagnostics: [],
  });
  expect(difference).toEqual({
    docker: ['new-id\tcasn-quality-new'],
    listeners: ['LISTEN 0 511 127.0.0.1:33061'],
    tempRoots: ['/tmp/casn-quality.NEW\t3\t4'],
    processes: ['202\t1\t202\t202\tbash new-invocation'],
  });
  expect(verification).toEqual({
    kind: 'failed',
    diagnostics: [
      'reported temp root remained present:/tmp/casn-quality.FORGED',
      'new Docker resource remained:new-id\tcasn-quality-new',
      'new listener remained:LISTEN 0 511 127.0.0.1:33061',
      'new temporary root remained:/tmp/casn-quality.NEW\t3\t4',
      'new invocation process remained:202\t1\t202\t202\tbash new-invocation',
    ],
  });
  expect(observedSentinel).toBe('keep');
  expect(descendantReadiness).toEqual({ kind: 'ready', pid: process.pid });
  expect(descendantAbsence).toEqual({
    kind: 'failed',
    diagnostics: [`reported ignored descendant remained present:${process.pid}`],
  });
  expect(mockedSpawnSync).not.toHaveBeenCalled();
});

test('parses one fixed descendant readiness label and fails closed on malformed or duplicate evidence', () => {
  expect(
    inspectDescendantReadiness(
      '[harness-child] ignored-descendant case=external-term pid=321\n',
      'external-term',
    ),
  ).toEqual({ kind: 'ready', pid: 321 });
  expect(
    inspectDescendantReadiness(
      '[harness-child] ignored-descendant case=leader-exit pid=321\n' +
        '[harness-child] ignored-descendant case=leader-exit pid=322\n',
      'leader-exit',
    ),
  ).toEqual({ kind: 'failed', diagnostics: ['duplicate ignored descendant readiness lines'] });
  expect(
    inspectDescendantReadiness(
      '[harness-child] ignored-descendant case=leader-exit pid=not-a-pid\n',
      'leader-exit',
    ),
  ).toEqual({ kind: 'failed', diagnostics: ['malformed ignored descendant readiness line'] });
  expect(
    inspectDescendantReadiness(
      '[harness-child] ignored-descendant case=external-term pid=321\n',
      'leader-exit',
    ),
  ).toEqual({ kind: 'failed', diagnostics: ['unexpected ignored descendant readiness case'] });
  expect(verifyDescendantAbsence({ kind: 'ready', pid: 321 }, 'absent')).toEqual({
    kind: 'verified',
  });
  expect(verifyDescendantAbsence({ kind: 'ready', pid: 321 }, 'unknown')).toEqual({
    kind: 'failed',
    diagnostics: ['reported ignored descendant absence query was unknown:321'],
  });
  expect(mockedSpawnSync).not.toHaveBeenCalled();
});

test('fails closed with timeout-specific diagnostics for every synchronous read-only query boundary', () => {
  const actor: HarnessReadOnlyQueryActor = jest.fn(() => ({
    stdout: '',
    stderr: '',
    status: null,
    signal: 'SIGTERM',
    error: { message: 'spawnSync timed out', code: 'ETIMEDOUT' },
  }));

  expect(() =>
    runHarnessReadOnlyQueryForTests(
      { kind: 'resolve-command', name: 'docker' },
      actor,
    ),
  ).toThrow('required harness query command timed out after 10000ms:docker');
  expect(() =>
    runHarnessReadOnlyQueryForTests(
      {
        kind: 'query',
        command: process.execPath,
        args: ['--version'],
        label: 'inventory',
      },
      actor,
    ),
  ).toThrow('inventory query timed out after 10000ms');
  expect(actor).toHaveBeenCalledTimes(2);
  expect(mockedSpawnSync).not.toHaveBeenCalled();
});
