import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOwnedFile, type OwnedRoot } from './owned-root';
import { lookupGroup, lookupProcess } from './proc';
import {
  type GroupLookup,
  LifecycleFailure,
  type ChildOutcome,
  type ProcessIdentity,
  type ProcessLookup,
} from './types';

export type OwnedProcess = Readonly<{
  child: ChildProcess;
  anchor: ProcessIdentity;
  root: OwnedRoot;
  stdoutPath: string;
  stderrPath: string;
}>;

type GateParentMessage = Readonly<{
  type: 'release';
  command: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
}> | Readonly<{ type: 'finish' }>;

type GateChildMessage =
  | Readonly<{ type: 'waiting' }>
  | Readonly<{ type: 'started'; pid: number }>
  | Readonly<{ type: 'outcome'; outcome: ChildOutcome }>;

export type SpawnGatedProcessInput = Readonly<{
  root: OwnedRoot;
  command: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
}>;

export type OwnedProcessDependencies = Readonly<{
  lookupProcess: (pid: number) => ProcessLookup;
  lookupGroup: (
    processGroupId: number,
    sessionId: number,
    excludedPids: ReadonlySet<number>,
  ) => GroupLookup;
  signal: (pid: number, signal: NodeJS.Signals) => void;
  observeSpawn: (child: ChildProcess) => void;
  gateEnvironment: Readonly<Record<string, string>>;
  waitingTimeoutMs: number;
  unreleasedExitTimeoutMs: number;
}>;

type OwnedProcessState = {
  readonly child: ChildProcess;
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly diagnostics: string[];
  readonly stdoutClosed: Promise<void>;
  readonly stderrClosed: Promise<void>;
  readonly dependencies: OwnedProcessDependencies;
  waiting: boolean;
  outcome: ChildOutcome | undefined;
  childClosed: boolean;
  released: boolean;
  finished: boolean;
  authorityRevoked: boolean;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const gateChildPath = resolve(dirname(fileURLToPath(import.meta.url)), 'gate-child.ts');
const gateTestInvocationToken = '--casn-disposable-lifecycle-test-gate';
const logLimitBytes = 1024 * 1024;
const messageTimeoutMs = 1_000;
const maximumTimeoutMs = 2_147_483_647;
const processStates = new WeakMap<OwnedProcess, OwnedProcessState>();
const defaultDependencies: OwnedProcessDependencies = {
  lookupProcess,
  lookupGroup: (processGroupId, sessionId, excludedPids) =>
    lookupGroup(processGroupId, sessionId, undefined, excludedPids),
  signal: (pid, signal) => {
    process.kill(pid, signal);
  },
  observeSpawn: () => undefined,
  gateEnvironment: {},
  waitingTimeoutMs: 1_000,
  unreleasedExitTimeoutMs: 3_000,
};
const signalNames = new Set<string>([
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGIOT',
  'SIGBUS',
  'SIGFPE',
  'SIGKILL',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGPIPE',
  'SIGALRM',
  'SIGTERM',
  'SIGCHLD',
  'SIGSTKFLT',
  'SIGCONT',
  'SIGSTOP',
  'SIGTSTP',
  'SIGTTIN',
  'SIGTTOU',
  'SIGURG',
  'SIGXCPU',
  'SIGXFSZ',
  'SIGVTALRM',
  'SIGPROF',
  'SIGWINCH',
  'SIGIO',
  'SIGPOLL',
  'SIGPWR',
  'SIGSYS',
]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isSignal(value: unknown): value is NodeJS.Signals {
  return typeof value === 'string' && signalNames.has(value);
}

function validateTimeout(name: string, timeoutMs: number): void {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > maximumTimeoutMs
  ) {
    throw new LifecycleFailure(
      64,
      `${name} must be an integer from 1 through ${maximumTimeoutMs}ms`,
    );
  }
}

function isChildOutcome(value: unknown): value is ChildOutcome {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false;
  }
  if (value.kind === 'exit') {
    return typeof value.code === 'number' && Number.isInteger(value.code);
  }
  if (value.kind === 'signal') {
    return isSignal(value.signal);
  }
  if (value.kind === 'spawn-error') {
    return typeof value.message === 'string';
  }
  return value.kind === 'timeout' && typeof value.phase === 'string';
}

function isGateChildMessage(value: unknown): value is GateChildMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }
  if (value.type === 'waiting') {
    return true;
  }
  if (value.type === 'started') {
    return typeof value.pid === 'number' && Number.isSafeInteger(value.pid) && value.pid > 0;
  }
  return value.type === 'outcome' && isChildOutcome(value.outcome);
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

function isLive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function isExpectedDetachedAnchor(child: ChildProcess, identity: ProcessIdentity): boolean {
  return (
    child.pid !== undefined &&
    identity.pid === child.pid &&
    isLive(child) &&
    identity.parentPid === process.pid &&
    identity.pid === identity.processGroupId &&
    identity.pid === identity.sessionId
  );
}

function inheritedEnvironment(overrides: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return { ...environment, ...overrides };
}

function writeBuffer(fd: number, buffer: Buffer): void {
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(fd, buffer, offset, buffer.length - offset);
  }
}

function captureStream(
  stream: NodeJS.ReadableStream | null,
  fd: number,
  label: 'stdout' | 'stderr',
  diagnostics: string[],
): Promise<void> {
  if (stream === null) {
    closeSync(fd);
    diagnostics.push(`${label} pipe unavailable`);
    return Promise.resolve();
  }

  return new Promise((resolveCapture) => {
    let capturedBytes = 0;
    let overflowRecorded = false;
    let writeFailed = false;
    stream.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, logLimitBytes - capturedBytes);
      if (!writeFailed && remaining > 0) {
        const captured = buffer.subarray(0, remaining);
        try {
          writeBuffer(fd, captured);
          capturedBytes += captured.length;
        } catch (error: unknown) {
          writeFailed = true;
          diagnostics.push(`${label} capture failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
      if (buffer.length > remaining && !overflowRecorded) {
        overflowRecorded = true;
        diagnostics.push(`${label} exceeded ${logLimitBytes} byte capture limit`);
      }
    });
    stream.once('error', (error: Error) => {
      diagnostics.push(`${label} stream failed: ${error.message}`);
    });
    stream.once('close', () => {
      try {
        closeSync(fd);
      } catch (error: unknown) {
        diagnostics.push(`${label} writer close failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
      resolveCapture();
    });
  });
}

async function waitForCondition(
  state: OwnedProcessState,
  child: ChildProcess,
  timeoutMs: number,
  condition: () => boolean,
  phase: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (!isLive(child) || state.childClosed) {
      throw new LifecycleFailure(70, `${phase}: gated anchor exited before completion`);
    }
    if (Date.now() >= deadline) {
      throw new LifecycleFailure(124, `${phase}: timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

async function waitForProcessAbsence(
  state: OwnedProcessState,
  pid: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lookup = state.dependencies.lookupProcess(pid);
  while (lookup.kind !== 'absent') {
    if (!state.childClosed) {
      throw new LifecycleFailure(70, 'gate absence: child handle was not reaped');
    }
    if (Date.now() >= deadline) {
      const detail = lookup.kind === 'unknown' ? `unknown:${lookup.reason}` : lookup.kind;
      throw new LifecycleFailure(70, `gated anchor absence proof failed: ${detail}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    lookup = state.dependencies.lookupProcess(pid);
  }
}

async function waitForChildClose(
  state: OwnedProcessState,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isLive(state.child) && !state.childClosed) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return true;
}

async function waitForLogStreams(state: OwnedProcessState, timeoutMs: number): Promise<void> {
  if (isLive(state.child) && !state.childClosed) {
    throw new LifecycleFailure(70, 'log close: gated anchor handle is still live');
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.all([state.stdoutClosed, state.stderrClosed]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new LifecycleFailure(124, `log close: timed out after ${timeoutMs}ms`)),
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

async function failBeforeRegistration(
  state: OwnedProcessState,
  child: ChildProcess,
  failure: LifecycleFailure,
  owned: OwnedProcess | undefined,
): Promise<never> {
  if (owned === undefined) {
    if (await waitForChildClose(state, state.dependencies.unreleasedExitTimeoutMs)) {
      await waitForLogStreams(state, state.dependencies.unreleasedExitTimeoutMs);
      throw new LifecycleFailure(
        failure.exitCode,
        `${failure.message}; unopened gate self-expired and was reaped`,
      );
    }
    throw new LifecycleFailure(
      70,
      `${failure.message}; retained cleanup failure: unopened gate did not self-expire`,
    );
  }

  const fresh = state.dependencies.lookupProcess(owned.anchor.pid);
  if (
    fresh.kind === 'present' &&
    sameIdentity(fresh.identity, owned.anchor) &&
    isExpectedDetachedAnchor(child, fresh.identity)
  ) {
    try {
      state.dependencies.signal(owned.anchor.pid, 'SIGKILL');
    } catch (error: unknown) {
      throw new LifecycleFailure(
        70,
        `${failure.message}; retained cleanup failure: ${error instanceof Error ? error.message : 'signal failed'}`,
      );
    }
    if (!(await waitForChildClose(state, state.dependencies.unreleasedExitTimeoutMs))) {
      throw new LifecycleFailure(
        70,
        `${failure.message}; retained cleanup failure: exact anchor did not exit`,
      );
    }
    await waitForLogStreams(state, state.dependencies.unreleasedExitTimeoutMs);
    await waitForProcessAbsence(state, owned.anchor.pid, state.dependencies.unreleasedExitTimeoutMs);
    throw failure;
  }

  const authorityFailure =
    fresh.kind === 'present'
      ? 'anchor identity changed'
      : fresh.kind === 'unknown'
        ? `anchor lookup unknown: ${fresh.reason}`
        : 'anchor became absent';
  if (await waitForChildClose(state, state.dependencies.unreleasedExitTimeoutMs)) {
    await waitForLogStreams(state, state.dependencies.unreleasedExitTimeoutMs);
    throw new LifecycleFailure(70, `${failure.message}; cleanup failed: ${authorityFailure}`);
  }
  throw new LifecycleFailure(
    70,
    `${failure.message}; retained cleanup failure: ${authorityFailure}`,
  );
}

async function failUnreleasedRelease(
  state: OwnedProcessState,
  failure: LifecycleFailure,
): Promise<never> {
  state.authorityRevoked = true;
  if (!(await waitForChildClose(state, state.dependencies.unreleasedExitTimeoutMs))) {
    throw new LifecycleFailure(
      70,
      `${failure.message}; retained cleanup failure: unreleased gate did not self-expire`,
    );
  }
  try {
    await waitForLogStreams(state, state.dependencies.unreleasedExitTimeoutMs);
  } catch (error: unknown) {
    throw new LifecycleFailure(
      70,
      `${failure.message}; retained cleanup failure: ${error instanceof Error ? error.message : 'log close failed'}`,
    );
  }
  throw new LifecycleFailure(
    failure.exitCode,
    `${failure.message}; unreleased gate self-expired and was reaped`,
  );
}

async function sendGateMessage(
  state: OwnedProcessState,
  child: ChildProcess,
  message: GateParentMessage,
  allowClose: boolean,
): Promise<void> {
  if (!isLive(child) || !child.connected) {
    throw new LifecycleFailure(70, `${message.type}: gated anchor is not live`);
  }

  const result: { settled: boolean; errorMessage: string | undefined } = {
    settled: false,
    errorMessage: undefined,
  };
  try {
    child.send(message, (error) => {
      result.errorMessage = error?.message;
      result.settled = true;
    });
  } catch (error: unknown) {
    throw new LifecycleFailure(
      70,
      `${message.type}: ${error instanceof Error ? error.message : 'IPC send failed'}`,
    );
  }

  const deadline = Date.now() + messageTimeoutMs;
  while (!result.settled) {
    if ((!isLive(child) || state.childClosed) && !allowClose) {
      throw new LifecycleFailure(70, `${message.type}: gated anchor exited during IPC send`);
    }
    if (Date.now() >= deadline) {
      throw new LifecycleFailure(124, `${message.type}: IPC send timed out`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  if (result.errorMessage !== undefined) {
    throw new LifecycleFailure(70, `${message.type}: ${result.errorMessage}`);
  }
}

function stateFor(owned: OwnedProcess): OwnedProcessState {
  const state = processStates.get(owned);
  if (state === undefined) {
    throw new LifecycleFailure(70, 'unrecognized owned process');
  }
  return state;
}

export async function spawnGatedProcess(
  input: SpawnGatedProcessInput,
  dependencies: OwnedProcessDependencies = defaultDependencies,
): Promise<OwnedProcess> {
  validateTimeout('waitingTimeoutMs', dependencies.waitingTimeoutMs);
  validateTimeout('unreleasedExitTimeoutMs', dependencies.unreleasedExitTimeoutMs);
  const stdout = createOwnedFile(input.root, 'stdout.log', 0o600);
  if (stdout.kind === 'failed') {
    throw new LifecycleFailure(70, `stdout capture creation failed: ${stdout.reason}`);
  }
  const stderr = createOwnedFile(input.root, 'stderr.log', 0o600);
  if (stderr.kind === 'failed') {
    closeSync(stdout.file.fd);
    throw new LifecycleFailure(70, `stderr capture creation failed: ${stderr.reason}`);
  }

  let child: ChildProcess;
  try {
    if (Object.keys(dependencies.gateEnvironment).length === 0) {
      child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), gateChildPath], {
        cwd: repositoryRoot,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
    } else {
      child = spawn(process.execPath, [
        '--import',
        import.meta.resolve('tsx'),
        gateChildPath,
        gateTestInvocationToken,
      ], {
        cwd: repositoryRoot,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: inheritedEnvironment(dependencies.gateEnvironment),
      });
    }
  } catch (error: unknown) {
    closeSync(stdout.file.fd);
    closeSync(stderr.file.fd);
    throw new LifecycleFailure(71, error instanceof Error ? error.message : 'gate spawn failed');
  }

  const diagnostics: string[] = [];
  const state: OwnedProcessState = {
    child,
    command: input.command,
    args: [...input.args],
    env: inheritedEnvironment(input.env),
    diagnostics,
    stdoutClosed: captureStream(child.stdout, stdout.file.fd, 'stdout', diagnostics),
    stderrClosed: captureStream(child.stderr, stderr.file.fd, 'stderr', diagnostics),
    dependencies,
    waiting: false,
    outcome: undefined,
    childClosed: false,
    released: false,
    finished: false,
    authorityRevoked: false,
  };

  child.on('message', (message: unknown) => {
    if (!isGateChildMessage(message)) {
      diagnostics.push('gate child sent a malformed IPC message');
      return;
    }
    if (message.type === 'waiting') {
      state.waiting = true;
    } else if (message.type === 'outcome') {
      state.outcome = message.outcome;
    }
  });
  child.once('error', (error: Error) => {
    diagnostics.push(`gate child failed: ${error.message}`);
  });
  child.once('close', () => {
    state.childClosed = true;
  });

  try {
    dependencies.observeSpawn(child);
  } catch (error: unknown) {
    return failBeforeRegistration(
      state,
      child,
      new LifecycleFailure(
        71,
        `spawn observation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      ),
      undefined,
    );
  }

  if (child.pid === undefined) {
    return failBeforeRegistration(
      state,
      child,
      new LifecycleFailure(71, 'gate spawn returned no PID'),
      undefined,
    );
  }
  const lookup = dependencies.lookupProcess(child.pid);
  if (lookup.kind !== 'present') {
    const detail = lookup.kind === 'unknown' ? `unknown:${lookup.reason}` : lookup.kind;
    return failBeforeRegistration(
      state,
      child,
      new LifecycleFailure(70, `gate identity lookup failed: ${detail}`),
      undefined,
    );
  }
  const anchor: ProcessIdentity = Object.freeze({ ...lookup.identity });
  if (anchor.pid !== child.pid) {
    return failBeforeRegistration(
      state,
      child,
      new LifecycleFailure(70, 'gate identity did not match the exact returned child PID'),
      undefined,
    );
  }
  if (!isExpectedDetachedAnchor(child, anchor)) {
    return failBeforeRegistration(
      state,
      child,
      new LifecycleFailure(70, 'gate process did not become the expected detached anchor'),
      undefined,
    );
  }
  const owned: OwnedProcess = Object.freeze({
    child,
    anchor,
    root: input.root,
    stdoutPath: stdout.file.path,
    stderrPath: stderr.file.path,
  });
  processStates.set(owned, state);

  try {
    await waitForCondition(
      state,
      child,
      dependencies.waitingTimeoutMs,
      () => state.waiting,
      'gate waiting',
    );
  } catch (error: unknown) {
    const failure =
      error instanceof LifecycleFailure
        ? error
        : new LifecycleFailure(70, error instanceof Error ? error.message : 'gate waiting failed');
    return failBeforeRegistration(state, child, failure, owned);
  }
  return owned;
}

export async function releaseGatedProcess(owned: OwnedProcess): Promise<void> {
  const state = stateFor(owned);
  if (state.released) {
    throw new LifecycleFailure(70, 'gated process was already released');
  }
  if (state.authorityRevoked) {
    return failUnreleasedRelease(
      state,
      new LifecycleFailure(70, 'gated anchor signal authority was already revoked'),
    );
  }
  const lookup = state.dependencies.lookupProcess(owned.anchor.pid);
  if (
    lookup.kind !== 'present' ||
    !sameIdentity(lookup.identity, owned.anchor) ||
    !isExpectedDetachedAnchor(owned.child, lookup.identity)
  ) {
    return failUnreleasedRelease(
      state,
      new LifecycleFailure(70, 'gated anchor identity changed before release'),
    );
  }

  try {
    await sendGateMessage(
      state,
      owned.child,
      { type: 'release', command: state.command, args: state.args, env: state.env },
      false,
    );
  } catch (error: unknown) {
    const failure =
      error instanceof LifecycleFailure
        ? error
        : new LifecycleFailure(70, error instanceof Error ? error.message : 'release failed');
    return failUnreleasedRelease(state, failure);
  }
  state.released = true;
}

export async function waitForOwnedOutcome(
  owned: OwnedProcess,
  timeoutMs: number,
): Promise<ChildOutcome> {
  validateTimeout('timeoutMs', timeoutMs);
  const state = stateFor(owned);
  const deadline = Date.now() + timeoutMs;
  while (state.outcome === undefined) {
    if (!isLive(owned.child) || state.childClosed) {
      return { kind: 'spawn-error', message: 'gated anchor exited before target outcome' };
    }
    if (Date.now() >= deadline) {
      return { kind: 'timeout', phase: 'outcome' };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return state.outcome;
}

export async function finishGatedProcess(owned: OwnedProcess, timeoutMs: number): Promise<void> {
  validateTimeout('timeoutMs', timeoutMs);
  const state = stateFor(owned);
  if (state.outcome === undefined) {
    throw new LifecycleFailure(70, 'cannot finish before target outcome');
  }
  if (state.finished) {
    throw new LifecycleFailure(70, 'gated process was already finished');
  }

  const groupDeadline = Date.now() + timeoutMs;
  let group = state.dependencies.lookupGroup(
    owned.anchor.processGroupId,
    owned.anchor.sessionId,
    new Set([owned.anchor.pid]),
  );
  while (group.kind !== 'absent') {
    if (!isLive(owned.child) || state.childClosed) {
      throw new LifecycleFailure(70, 'group absence: gated anchor exited before completion');
    }
    if (Date.now() >= groupDeadline) {
      const detail =
        group.kind === 'present'
          ? `present:${group.members.map((member) => `${member.pid}/${member.startTime.toString(10)}`).join(',')}`
          : `unknown:${group.reason}`;
      throw new LifecycleFailure(70, `cannot finish while owned group is ${detail}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    group = state.dependencies.lookupGroup(
      owned.anchor.processGroupId,
      owned.anchor.sessionId,
      new Set([owned.anchor.pid]),
    );
  }
  const anchor = state.dependencies.lookupProcess(owned.anchor.pid);
  if (anchor.kind !== 'present' || !sameIdentity(anchor.identity, owned.anchor)) {
    throw new LifecycleFailure(70, 'gated anchor identity changed before finish');
  }

  state.finished = true;
  await sendGateMessage(state, owned.child, { type: 'finish' }, true);
  if (!(await waitForChildClose(state, timeoutMs))) {
    throw new LifecycleFailure(124, `gate finish: timed out after ${timeoutMs}ms`);
  }
  await waitForLogStreams(state, timeoutMs);

  await waitForProcessAbsence(state, owned.anchor.pid, timeoutMs);
  if (state.diagnostics.length > 0) {
    throw new LifecycleFailure(70, state.diagnostics.join('; '));
  }
}
