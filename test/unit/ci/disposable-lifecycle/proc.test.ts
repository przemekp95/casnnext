/** @jest-environment node */
import { readFileSync } from 'node:fs';

import { lookupGroup, lookupProcess, parseStatLine } from '@/scripts/ci/disposable-lifecycle/proc';

const access = {
  readStat: jest.fn<string, [pid: number]>(),
  inspectPidEntry: jest.fn<'present' | 'absent' | 'unknown', [pid: number]>(),
  listPids: jest.fn<readonly number[], []>(),
};

function statLine(pid: number, processGroupId: number, sessionId: number): string {
  return `${pid} (worker) S 1 ${processGroupId} ${sessionId} 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 123456`;
}

beforeEach(() => {
  jest.resetAllMocks();
});

test('parses the final comm delimiter and literal identity fields', () => {
  const line = '7100 (worker ) name) S 1 7100 7100 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 123456';

  expect(parseStatLine(7100, line)).toEqual({
    kind: 'present',
    identity: {
      pid: 7100,
      startTime: 123456n,
      parentPid: 1,
      processGroupId: 7100,
      sessionId: 7100,
    },
    state: 'S',
  });
});

test.each(['', '7100 bad', '7100 (x) invalid 1 2 3'])(
  'treats malformed present stat as unknown: %j',
  (line) =>
    expect(parseStatLine(7100, line)).toEqual({
      kind: 'unknown',
      reason: 'malformed-stat',
    }),
);

test.each([0, -1, 1.5, Number.NaN])('rejects an impossible caller-supplied PID: %p', (pid) => {
  expect(parseStatLine(pid, statLine(pid, 7100, 7100))).toEqual({
    kind: 'unknown',
    reason: 'malformed-stat',
  });
});

test('returns unknown when a present stat cannot be read', () => {
  access.readStat.mockImplementation(() => {
    throw new Error('EACCES');
  });
  access.inspectPidEntry.mockReturnValue('present');

  expect(lookupProcess(42, access)).toEqual({ kind: 'unknown', reason: 'stat-read-failed' });
});

test('returns absent when a failed stat read confirms the PID is gone', () => {
  access.readStat.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  access.inspectPidEntry.mockReturnValue('absent');

  expect(lookupProcess(42, access)).toEqual({ kind: 'absent' });
});

test('returns absent for a real PID entry beyond the kernel allocation range under Jest', () => {
  const pidBeyondKernelRange = Number(readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim()) + 1;

  expect(lookupProcess(pidBeyondKernelRange)).toEqual({ kind: 'absent' });
});

test('returns unknown when PID entry state cannot be inspected after a failed stat read', () => {
  access.readStat.mockImplementation(() => {
    throw new Error('EIO');
  });
  access.inspectPidEntry.mockReturnValue('unknown');

  expect(lookupProcess(42, access)).toEqual({ kind: 'unknown', reason: 'pid-entry-unknown' });
});

test('returns unknown when a still-present numeric PID has an unreadable stat', () => {
  access.listPids.mockReturnValue([42]);
  access.readStat.mockImplementation(() => {
    throw new Error('EACCES');
  });
  access.inspectPidEntry.mockReturnValue('present');

  expect(lookupGroup(7100, 7100, access, new Set())).toEqual({
    kind: 'unknown',
    reason: 'stat-read-failed',
  });
});

test('returns unknown when a still-present numeric PID has a malformed stat', () => {
  access.listPids.mockReturnValue([42]);
  access.readStat.mockReturnValue('42 (worker) invalid 1 2 3');

  expect(lookupGroup(7100, 7100, access, new Set())).toEqual({
    kind: 'unknown',
    reason: 'malformed-stat',
  });
});

test('omits a verified excluded anchor from otherwise matching membership', () => {
  access.listPids.mockReturnValue([7, 8]);
  access.readStat.mockImplementation((pid) => statLine(pid, 7100, 7100));

  expect(lookupGroup(7100, 7100, access, new Set([7]))).toEqual({
    kind: 'present',
    members: [
      {
        pid: 8,
        startTime: 123456n,
        parentPid: 1,
        processGroupId: 7100,
        sessionId: 7100,
      },
    ],
  });
});

test('checks an excluded anchor for unreadable stat before returning membership', () => {
  access.listPids.mockReturnValue([7, 8]);
  access.readStat.mockImplementation((pid) => {
    if (pid === 7) {
      throw new Error('EACCES');
    }

    return statLine(pid, 7100, 7100);
  });
  access.inspectPidEntry.mockReturnValue('present');

  expect(lookupGroup(7100, 7100, access, new Set([7]))).toEqual({
    kind: 'unknown',
    reason: 'stat-read-failed',
  });
});
