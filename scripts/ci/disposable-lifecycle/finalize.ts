import { lstatSync } from 'node:fs';
import { constants } from 'node:os';

import { finishGatedProcess, waitForOwnedOutcome, type OwnedProcess } from './owned-process';
import { removeOwnedRoot } from './owned-root';
import { lookupGroup, lookupProcess } from './proc';
import {
  LifecycleFailure,
  type ChildOutcome,
  type GroupLookup,
  type ProcessIdentity,
  type ProcessLookup,
} from './types';

export type CleanupResult =
  | Readonly<{ kind: 'clean' }>
  | Readonly<{ kind: 'failed'; code: 70; diagnostics: readonly string[] }>;

export function resolveExitStatus(child: ChildOutcome, cleanup: CleanupResult): number {
  if (cleanup.kind === 'failed') {
    return cleanup.code;
  }

  if (child.kind === 'exit') {
    return child.code;
  }
  if (child.kind === 'spawn-error') {
    return 71;
  }
  if (child.kind === 'timeout') {
    return 124;
  }

  const signalNumber: number | undefined = constants.signals[child.signal];
  if (signalNumber === undefined) {
    throw new LifecycleFailure(70, `unknown child signal: ${child.signal}`);
  }
  return 128 + signalNumber;
}

type FinalizeDependencies = Readonly<{
  lookupProcess: (pid: number) => ProcessLookup;
  lookupGroup: (
    processGroupId: number,
    sessionId: number,
    excludedPids: ReadonlySet<number>,
  ) => GroupLookup;
  signalGroup: (processGroupId: number, signal: NodeJS.Signals) => void;
}>;

type ChildCloseWait = Readonly<{
  promise: Promise<void>;
  cancel: () => void;
}>;

const maximumTimeoutMs = 2_147_483_647;
const stabilizationObservations = 5;
const stabilizationIntervalMs = 100;
const defaultDependencies: FinalizeDependencies = {
  lookupProcess,
  lookupGroup: (processGroupId, sessionId, excludedPids) =>
    lookupGroup(processGroupId, sessionId, undefined, excludedPids),
  signalGroup: (processGroupId, signal) => {
    process.kill(-processGroupId, signal);
  },
};

function sameIdentity(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return (
    left.pid === right.pid &&
    left.startTime === right.startTime &&
    left.parentPid === right.parentPid &&
    left.processGroupId === right.processGroupId &&
    left.sessionId === right.sessionId
  );
}

function isLiveAnchor(owned: OwnedProcess): boolean {
  return (
    owned.child.pid === owned.anchor.pid &&
    owned.child.exitCode === null &&
    owned.child.signalCode === null
  );
}

function exactDetachedAnchor(
  owned: OwnedProcess,
  dependencies: FinalizeDependencies,
  phase: string,
): ProcessIdentity {
  const lookup = dependencies.lookupProcess(owned.anchor.pid);
  if (lookup.kind === 'unknown') {
    throw new LifecycleFailure(70, `${phase}: anchor lookup unknown:${lookup.reason}`);
  }
  if (
    lookup.kind !== 'present' ||
    !sameIdentity(lookup.identity, owned.anchor) ||
    !isLiveAnchor(owned) ||
    lookup.identity.parentPid !== process.pid ||
    lookup.identity.pid !== lookup.identity.processGroupId ||
    lookup.identity.pid !== lookup.identity.sessionId
  ) {
    throw new LifecycleFailure(70, `${phase}: detached anchor identity or topology changed`);
  }
  return lookup.identity;
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > maximumTimeoutMs) {
    throw new LifecycleFailure(
      64,
      `timeoutMs must be an integer from 1 through ${maximumTimeoutMs}ms`,
    );
  }
}

async function waitForOnlyAnchor(
  owned: OwnedProcess,
  dependencies: FinalizeDependencies,
  timeoutMs: number,
): Promise<'only-anchor' | 'members-present'> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (!isLiveAnchor(owned)) {
      throw new LifecycleFailure(70, 'TERM wait: gated anchor handle is not live');
    }
    const group = dependencies.lookupGroup(
      owned.anchor.processGroupId,
      owned.anchor.sessionId,
      new Set([owned.anchor.pid]),
    );
    if (group.kind === 'unknown') {
      throw new LifecycleFailure(70, `TERM wait: group lookup unknown:${group.reason}`);
    }
    if (group.kind === 'absent') {
      return 'only-anchor';
    }
    if (Date.now() >= deadline) {
      return 'members-present';
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function beginChildCloseWait(owned: OwnedProcess, timeoutMs: number): ChildCloseWait {
  if (!isLiveAnchor(owned)) {
    throw new LifecycleFailure(70, 'KILL reap: gated anchor handle is not live');
  }

  let cancel = (): void => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const clear = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      clearTimeout(timer);
      owned.child.off('close', onClose);
      return true;
    };
    const onClose = (): void => {
      if (clear()) {
        resolve();
      }
    };
    cancel = () => {
      if (clear()) {
        resolve();
      }
    };
    const timer = setTimeout(() => {
      if (clear()) {
        reject(new LifecycleFailure(70, `KILL reap: timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    owned.child.once('close', onClose);
  });
  return { promise, cancel };
}

async function waitForCompleteGroupAbsence(
  owned: OwnedProcess,
  dependencies: FinalizeDependencies,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const anchor = dependencies.lookupProcess(owned.anchor.pid);
    if (anchor.kind === 'unknown') {
      throw new LifecycleFailure(70, `KILL absence: anchor lookup unknown:${anchor.reason}`);
    }
    const group = dependencies.lookupGroup(
      owned.anchor.processGroupId,
      owned.anchor.sessionId,
      new Set(),
    );
    if (group.kind === 'unknown') {
      throw new LifecycleFailure(70, `KILL absence: group lookup unknown:${group.reason}`);
    }
    if (anchor.kind === 'absent' && group.kind === 'absent') {
      return;
    }
    if (Date.now() >= deadline) {
      throw new LifecycleFailure(70, 'KILL absence: owned group remained present');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function rootPathIsAbsent(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return true;
    }
    throw new LifecycleFailure(70, 'stabilization: root path lookup unknown');
  }
}

async function stabilizeAbsence(
  owned: OwnedProcess,
  dependencies: FinalizeDependencies,
): Promise<void> {
  for (let observation = 0; observation < stabilizationObservations; observation += 1) {
    const anchor = dependencies.lookupProcess(owned.anchor.pid);
    if (anchor.kind === 'unknown') {
      throw new LifecycleFailure(70, `stabilization: anchor lookup unknown:${anchor.reason}`);
    }
    if (anchor.kind !== 'absent') {
      throw new LifecycleFailure(70, 'stabilization: anchor remained present');
    }
    const group = dependencies.lookupGroup(
      owned.anchor.processGroupId,
      owned.anchor.sessionId,
      new Set(),
    );
    if (group.kind === 'unknown') {
      throw new LifecycleFailure(70, `stabilization: group lookup unknown:${group.reason}`);
    }
    if (group.kind !== 'absent') {
      throw new LifecycleFailure(70, 'stabilization: owned group remained present');
    }
    if (!rootPathIsAbsent(owned.root.path)) {
      throw new LifecycleFailure(70, 'stabilization: owned root path remained present');
    }
    if (observation + 1 < stabilizationObservations) {
      await new Promise((resolve) => setTimeout(resolve, stabilizationIntervalMs));
    }
  }
}

function cleanupFailure(error: unknown): CleanupResult {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : 'unknown cleanup failure';
  return { kind: 'failed', code: 70, diagnostics: [message] };
}

export async function finalizeOwnedRun(
  owned: OwnedProcess,
  timeoutMs: number,
  overrides: Partial<FinalizeDependencies> = {},
): Promise<CleanupResult> {
  try {
    validateTimeout(timeoutMs);
    const dependencies: FinalizeDependencies = { ...defaultDependencies, ...overrides };
    const termAnchor = exactDetachedAnchor(owned, dependencies, 'TERM');
    dependencies.signalGroup(termAnchor.processGroupId, 'SIGTERM');
    const termResult = await waitForOnlyAnchor(owned, dependencies, timeoutMs);

    if (termResult === 'only-anchor') {
      await waitForOwnedOutcome(owned, timeoutMs);
      await finishGatedProcess(owned, timeoutMs);
    } else {
      const childClose = beginChildCloseWait(owned, timeoutMs);
      try {
        const killAnchor = exactDetachedAnchor(owned, dependencies, 'KILL');
        dependencies.signalGroup(killAnchor.processGroupId, 'SIGKILL');
      } catch (error: unknown) {
        childClose.cancel();
        throw error;
      }
      await childClose.promise;
      await waitForCompleteGroupAbsence(owned, dependencies, timeoutMs);
    }

    const removal = removeOwnedRoot(owned.root);
    if (removal.kind === 'failed') {
      throw new LifecycleFailure(70, `owned root removal failed:${removal.reason}`);
    }
    await stabilizeAbsence(owned, dependencies);
    return { kind: 'clean' };
  } catch (error: unknown) {
    return cleanupFailure(error);
  }
}
