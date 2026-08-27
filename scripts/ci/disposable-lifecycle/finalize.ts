import { lstatSync } from 'node:fs';
import { constants } from 'node:os';
import { performance } from 'node:perf_hooks';

import {
  assertOwnedProcessAuthority,
  finishGatedProcess,
  reapEscalatedOwnedProcess,
  waitForOwnedOutcome,
  type OwnedProcess,
} from './owned-process';
import { removeOwnedRoot, type OwnedRoot, type OwnedRootRemoval } from './owned-root';
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

export type FinalizeTestActors = Readonly<{
  assertOwnedProcess: (owned: OwnedProcess) => void;
  lookupProcess: (pid: number) => ProcessLookup;
  lookupGroup: (
    processGroupId: number,
    sessionId: number,
    excludedPids: ReadonlySet<number>,
  ) => GroupLookup;
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
  signalGroup: (processGroupId: number, signal: NodeJS.Signals) => void;
  finishCooperative: (owned: OwnedProcess, timeoutMs: number) => Promise<void>;
  reapEscalated: (owned: OwnedProcess, timeoutMs: number) => Promise<void>;
  removeRoot: (root: OwnedRoot) => OwnedRootRemoval;
  rootPathIsAbsent: (path: string) => boolean;
}>;

const maximumTimeoutMs = 2_147_483_647;
const stabilizationObservations = 5;
const stabilizationIntervalMs = 100;
const stabilizationTimeoutMs = stabilizationObservations * stabilizationIntervalMs;
const productionActors: FinalizeTestActors = {
  assertOwnedProcess: assertOwnedProcessAuthority,
  lookupProcess,
  lookupGroup: (processGroupId, sessionId, excludedPids) =>
    lookupGroup(processGroupId, sessionId, undefined, excludedPids),
  now: performance.now.bind(performance),
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
  reapEscalated: reapEscalatedOwnedProcess,
  removeRoot: removeOwnedRoot,
  rootPathIsAbsent,
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
  actors: FinalizeTestActors,
  phase: string,
  timeoutMs: number,
): ProcessIdentity {
  const deadline = actors.now() + timeoutMs;
  const lookup = actors.lookupProcess(owned.anchor.pid);
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
  if (actors.now() >= deadline) {
    throw new LifecycleFailure(
      70,
      `${phase}: identity observed at or after ${timeoutMs}ms deadline`,
    );
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
  actors: FinalizeTestActors,
  timeoutMs: number,
): Promise<'only-anchor' | 'members-present'> {
  const deadline = actors.now() + timeoutMs;
  while (true) {
    if (!isLiveAnchor(owned)) {
      throw new LifecycleFailure(70, 'TERM wait: gated anchor handle is not live');
    }
    const group = actors.lookupGroup(
      owned.anchor.processGroupId,
      owned.anchor.sessionId,
      new Set([owned.anchor.pid]),
    );
    if (group.kind === 'unknown') {
      throw new LifecycleFailure(70, `TERM wait: group lookup unknown:${group.reason}`);
    }
    if (group.kind === 'absent') {
      if (actors.now() >= deadline) {
        throw new LifecycleFailure(
          70,
          `TERM wait: absence observed at or after ${timeoutMs}ms deadline`,
        );
      }
      return 'only-anchor';
    }
    if (actors.now() >= deadline) {
      return 'members-present';
    }
    await actors.wait(10);
  }
}

async function waitForCompleteGroupAbsence(
  owned: OwnedProcess,
  actors: FinalizeTestActors,
  timeoutMs: number,
): Promise<void> {
  const deadline = actors.now() + timeoutMs;
  while (true) {
    const anchor = actors.lookupProcess(owned.anchor.pid);
    if (anchor.kind === 'unknown') {
      throw new LifecycleFailure(70, `KILL absence: anchor lookup unknown:${anchor.reason}`);
    }
    if (anchor.kind === 'absent' && actors.now() >= deadline) {
      throw new LifecycleFailure(
        70,
        `KILL absence: absence observed at or after ${timeoutMs}ms deadline`,
      );
    }
    const group = actors.lookupGroup(
      owned.anchor.processGroupId,
      owned.anchor.sessionId,
      new Set(),
    );
    if (group.kind === 'unknown') {
      throw new LifecycleFailure(70, `KILL absence: group lookup unknown:${group.reason}`);
    }
    if (anchor.kind === 'absent' && group.kind === 'absent') {
      if (actors.now() >= deadline) {
        throw new LifecycleFailure(
          70,
          `KILL absence: absence observed at or after ${timeoutMs}ms deadline`,
        );
      }
      return;
    }
    if (actors.now() >= deadline) {
      throw new LifecycleFailure(70, 'KILL absence: owned group remained present');
    }
    await actors.wait(10);
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
  actors: FinalizeTestActors,
): Promise<void> {
  validateTimeout(stabilizationTimeoutMs);
  const deadline = actors.now() + stabilizationTimeoutMs;
  for (let observation = 0; observation < stabilizationObservations; observation += 1) {
    const anchor = actors.lookupProcess(owned.anchor.pid);
    if (anchor.kind === 'unknown') {
      throw new LifecycleFailure(70, `stabilization: anchor lookup unknown:${anchor.reason}`);
    }
    if (anchor.kind !== 'absent') {
      throw new LifecycleFailure(70, 'stabilization: anchor remained present');
    }
    if (actors.now() >= deadline) {
      throw new LifecycleFailure(
        70,
        `stabilization: absence observed at or after ${stabilizationTimeoutMs}ms deadline`,
      );
    }
    const group = actors.lookupGroup(
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
    if (actors.now() >= deadline) {
      throw new LifecycleFailure(
        70,
        `stabilization: absence observed at or after ${stabilizationTimeoutMs}ms deadline`,
      );
    }
    if (!actors.rootPathIsAbsent(owned.root.path)) {
      throw new LifecycleFailure(70, 'stabilization: owned root path remained present');
    }
    if (actors.now() >= deadline) {
      throw new LifecycleFailure(
        70,
        `stabilization: absence observed at or after ${stabilizationTimeoutMs}ms deadline`,
      );
    }
    if (observation + 1 < stabilizationObservations) {
      await actors.wait(stabilizationIntervalMs);
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

async function finalizeWithActors(
  owned: OwnedProcess,
  timeoutMs: number,
  actors: FinalizeTestActors,
): Promise<CleanupResult> {
  try {
    validateTimeout(timeoutMs);
    actors.assertOwnedProcess(owned);
    const termAnchor = exactDetachedAnchor(owned, actors, 'TERM', timeoutMs);
    actors.signalGroup(termAnchor.processGroupId, 'SIGTERM');
    const termResult = await waitForOnlyAnchor(owned, actors, timeoutMs);

    if (termResult === 'only-anchor') {
      await actors.finishCooperative(owned, timeoutMs);
    } else {
      actors.assertOwnedProcess(owned);
      const killAnchor = exactDetachedAnchor(owned, actors, 'KILL', timeoutMs);
      actors.signalGroup(killAnchor.processGroupId, 'SIGKILL');
      await actors.reapEscalated(owned, timeoutMs);
      await waitForCompleteGroupAbsence(owned, actors, timeoutMs);
    }

    const removal = actors.removeRoot(owned.root);
    if (removal.kind === 'failed') {
      throw new LifecycleFailure(70, `owned root removal failed:${removal.reason}`);
    }
    await stabilizeAbsence(owned, actors);
    return { kind: 'clean' };
  } catch (error: unknown) {
    return cleanupFailure(error);
  }
}

export function finalizeOwnedRun(
  owned: OwnedProcess,
  timeoutMs: number,
): Promise<CleanupResult> {
  return finalizeWithActors(owned, timeoutMs, productionActors);
}

export function createFinalizeOwnedRunForTests(
  actors: FinalizeTestActors,
): (owned: OwnedProcess, timeoutMs: number) => Promise<CleanupResult> {
  return (owned, timeoutMs) => finalizeWithActors(owned, timeoutMs, actors);
}
