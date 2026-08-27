import { readFileSync, readdirSync, statSync } from 'node:fs';

import type { GroupLookup, ProcessIdentity, ProcessLookup, ProcessState } from './types';

const processStates = new Set<string>(['R', 'S', 'D', 'Z', 'T', 't', 'X', 'x', 'K', 'W', 'P', 'I']);
const decimalInteger = /^(?:0|[1-9][0-9]*)$/;

function parseIdentityNumber(value: string): number | undefined {
  if (!decimalInteger.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseStartTime(value: string): bigint | undefined {
  if (!decimalInteger.test(value)) {
    return undefined;
  }

  return BigInt(value);
}

function isProcessState(value: string): value is ProcessState {
  return processStates.has(value);
}

function isProcessId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseStatLine(pid: number, line: string): ProcessLookup {
  if (!isProcessId(pid)) {
    return { kind: 'unknown', reason: 'malformed-stat' };
  }

  const delimiterIndex = line.lastIndexOf(') ');
  if (delimiterIndex === -1) {
    return { kind: 'unknown', reason: 'malformed-stat' };
  }

  const prefix = line.slice(0, delimiterIndex);
  const openingIndex = prefix.indexOf(' (');
  if (openingIndex === -1 || prefix.slice(0, openingIndex) !== String(pid)) {
    return { kind: 'unknown', reason: 'malformed-stat' };
  }

  const fields = line.slice(delimiterIndex + 2).split(' ');
  const [state, parentPid, processGroupId, sessionId, , , , , , , , , , , , , , , , startTime] = fields;

  if (
    fields.length < 20 ||
    state === undefined ||
    !isProcessState(state) ||
    parentPid === undefined ||
    processGroupId === undefined ||
    sessionId === undefined ||
    startTime === undefined
  ) {
    return { kind: 'unknown', reason: 'malformed-stat' };
  }

  const parsedParentPid = parseIdentityNumber(parentPid);
  const parsedProcessGroupId = parseIdentityNumber(processGroupId);
  const parsedSessionId = parseIdentityNumber(sessionId);
  const parsedStartTime = parseStartTime(startTime);

  if (
    parsedParentPid === undefined ||
    parsedProcessGroupId === undefined ||
    parsedSessionId === undefined ||
    parsedStartTime === undefined
  ) {
    return { kind: 'unknown', reason: 'malformed-stat' };
  }

  const identity: ProcessIdentity = {
    pid,
    startTime: parsedStartTime,
    parentPid: parsedParentPid,
    processGroupId: parsedProcessGroupId,
    sessionId: parsedSessionId,
  };

  return { kind: 'present', identity, state };
}

export interface ProcAccess {
  readStat(pid: number): string;
  inspectPidEntry(pid: number): 'present' | 'absent' | 'unknown';
  listPids(): readonly number[];
}

function inspectFilesystemPidEntry(pid: number): 'present' | 'absent' | 'unknown' {
  try {
    return statSync(`/proc/${pid}`).isDirectory() ? 'present' : 'unknown';
  } catch (error: unknown) {
    return isErrnoWithCode(error, 'ENOENT') ? 'absent' : 'unknown';
  }
}

function isErrnoWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

const filesystemProcAccess: ProcAccess = {
  readStat(pid) {
    return readFileSync(`/proc/${pid}/stat`, 'utf8');
  },
  inspectPidEntry: inspectFilesystemPidEntry,
  listPids() {
    return readdirSync('/proc', { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) {
        return [];
      }

      const pid = parseIdentityNumber(entry.name);
      return pid === undefined || !isProcessId(pid) ? [] : [pid];
    });
  },
};

export function lookupProcess(pid: number, access: ProcAccess = filesystemProcAccess): ProcessLookup {
  if (!isProcessId(pid)) {
    return { kind: 'unknown', reason: 'malformed-stat' };
  }

  try {
    return parseStatLine(pid, access.readStat(pid));
  } catch {
    const firstObservation = access.inspectPidEntry(pid);
    const secondObservation = access.inspectPidEntry(pid);

    if (firstObservation === 'absent' && secondObservation === 'absent') {
      return { kind: 'absent' };
    }

    if (firstObservation === 'unknown' || secondObservation === 'unknown') {
      return { kind: 'unknown', reason: 'pid-entry-unknown' };
    }

    return { kind: 'unknown', reason: 'stat-read-failed' };
  }
}

export function lookupGroup(
  processGroupId: number,
  sessionId: number,
  access: ProcAccess = filesystemProcAccess,
  excludedPids: ReadonlySet<number> = new Set<number>(),
): GroupLookup {
  let pids: readonly number[];

  try {
    pids = access.listPids();
  } catch {
    return { kind: 'unknown', reason: 'pid-list-failed' };
  }

  const members: ProcessIdentity[] = [];
  for (const pid of pids) {
    if (!isProcessId(pid)) {
      return { kind: 'unknown', reason: 'pid-list-malformed' };
    }

    const lookup = lookupProcess(pid, access);
    if (lookup.kind === 'unknown') {
      return lookup;
    }

    if (
      lookup.kind === 'present' &&
      lookup.identity.processGroupId === processGroupId &&
      lookup.identity.sessionId === sessionId &&
      !excludedPids.has(pid)
    ) {
      members.push(lookup.identity);
    }
  }

  return members.length === 0 ? { kind: 'absent' } : { kind: 'present', members };
}
