export type ProcessState = 'R' | 'S' | 'D' | 'Z' | 'T' | 't' | 'X' | 'x' | 'K' | 'W' | 'P' | 'I';

export type ProcessIdentity = Readonly<{
  pid: number;
  startTime: bigint;
  parentPid: number;
  processGroupId: number;
  sessionId: number;
}>;

export type ProcessLookup =
  | Readonly<{ kind: 'present'; identity: ProcessIdentity; state: ProcessState }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unknown'; reason: string }>;

export type GroupLookup =
  | Readonly<{ kind: 'present'; members: readonly ProcessIdentity[] }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unknown'; reason: string }>;

export class LifecycleFailure extends Error {
  constructor(
    public readonly exitCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LifecycleFailure';
  }
}
