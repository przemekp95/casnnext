import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { finalizeOwnedRun, resolveExitStatus, type CleanupResult } from './finalize';
import {
  runHarnessScenario as runHarnessBlackBoxScenario,
  type HarnessScenario,
} from './harness-scenarios';
import {
  createOwnedRoot,
  publishEvidence,
  removeOwnedRoot,
  verifyOwnedRoot,
  type OwnedRoot,
} from './owned-root';
import {
  releaseGatedProcess,
  spawnGatedProcess,
  waitForOwnedOutcome,
  type OwnedProcess,
} from './owned-process';
import { lookupGroup, lookupProcess } from './proc';
import {
  LifecycleFailure,
  type ChildOutcome,
  type GroupLookup,
  type ProcessIdentity,
} from './types';

export type FastScenario = 'proc' | 'root' | 'process' | 'cleanup' | 'all-fast';
export type DisposableLifecycleScenario = FastScenario | HarnessScenario;

export type CliDependencies = Readonly<{
  createRoot: typeof createOwnedRoot;
  runFastScenario: (
    scenario: FastScenario,
    root: OwnedRoot,
  ) => Promise<number>;
  runHarnessScenario?: (
    scenario: HarnessScenario,
    root: OwnedRoot,
  ) => Promise<number>;
}>;

export type RootOnlyScenarioTestActors = Readonly<{
  removeRoot: typeof removeOwnedRoot;
}>;

export type TargetReadinessTestActors = Readonly<{
  lookupGroup: (
    processGroupId: number,
    sessionId: number,
    excludedPids: ReadonlySet<number>,
  ) => GroupLookup;
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}>;

type TargetReadinessIdentity = Readonly<{
  anchorPid: number;
  processGroupId: number;
  sessionId: number;
}>;

type CliSignal = 'SIGHUP' | 'SIGINT' | 'SIGTERM';

const fastScenarioNames = new Set<string>(['proc', 'root', 'process', 'cleanup', 'all-fast']);
const harnessScenarioNames = new Set<string>([
  'harness-success',
  'harness-status',
  'harness-term',
  'harness-descendant',
  'harness-proof-failure',
  'all-harness',
]);
const signalStatuses: Readonly<Record<CliSignal, number>> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};
const scenarioTimeoutMs = 3_000;
const activeInterruptions = new WeakMap<OwnedRoot, AbortSignal>();
const cleanupFailures = new WeakMap<
  OwnedRoot,
  Readonly<{
    cleanup: Extract<CleanupResult, Readonly<{ kind: 'failed' }>>;
    childOutcome: ChildOutcome | undefined;
  }>
>();
const ownedProcessEvidencePrefix = 'owned-process-evidence:';
const productionRootOnlyActors: RootOnlyScenarioTestActors = {
  removeRoot: removeOwnedRoot,
};
const productionTargetReadinessActors: TargetReadinessTestActors = {
  lookupGroup: (processGroupId, sessionId, excludedPids) =>
    lookupGroup(processGroupId, sessionId, undefined, excludedPids),
  now: performance.now.bind(performance),
  wait: async (milliseconds) => {
    await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
  },
};

class ScenarioInterrupted extends Error {}

function isFastScenario(value: string | undefined): value is FastScenario {
  return value !== undefined && fastScenarioNames.has(value);
}

function isHarnessScenario(value: string | undefined): value is HarnessScenario {
  return value !== undefined && harnessScenarioNames.has(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown disposable lifecycle failure';
}

function failureStatus(error: unknown): number {
  return error instanceof LifecycleFailure ? error.exitCode : 70;
}

function reportFailure(error: unknown): number {
  const status = failureStatus(error);
  try {
    process.stderr.write(`${errorMessage(error)}\n`);
  } catch {
    return 70;
  }
  return status;
}

function validateDelayEnvironment(): number {
  const value = process.env.CASN_LIFECYCLE_TEST_INIT_DELAY_MS;
  if (value === undefined) {
    return 0;
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new LifecycleFailure(
      64,
      'CASN_LIFECYCLE_TEST_INIT_DELAY_MS is available only when NODE_ENV=test',
    );
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new LifecycleFailure(64, 'CASN_LIFECYCLE_TEST_INIT_DELAY_MS must be a decimal integer');
  }
  const delay = Number(value);
  if (!Number.isSafeInteger(delay) || delay > 2_147_483_647) {
    throw new LifecycleFailure(64, 'CASN_LIFECYCLE_TEST_INIT_DELAY_MS is outside the timer range');
  }
  return delay;
}

async function waitForDelay(milliseconds: number, interruption: AbortSignal): Promise<void> {
  if (milliseconds === 0) {
    return;
  }
  process.stdout.write('bootstrap-ready\n');
  await new Promise<void>((resolveDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    interruption.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolveDelay();
      },
      { once: true },
    );
  });
}

function requireActive(interruption: AbortSignal): void {
  if (interruption.aborted) {
    throw new ScenarioInterrupted('disposable lifecycle scenario was interrupted');
  }
}

function verifyProcScenario(): void {
  const lookup = lookupProcess(process.pid);
  if (lookup.kind !== 'present' || lookup.identity.pid !== process.pid) {
    const detail = lookup.kind === 'unknown' ? `unknown:${lookup.reason}` : lookup.kind;
    throw new LifecycleFailure(70, `current process identity lookup failed: ${detail}`);
  }
}

function verifyRootScenario(root: OwnedRoot): void {
  const verification = verifyOwnedRoot(root);
  if (verification.kind === 'failed') {
    throw new LifecycleFailure(70, `owned root verification failed:${verification.reason}`);
  }
  const publication = publishEvidence(root, 'scenario.json', {
    invocationId: `cli-${process.pid}`,
    outcome: 'pass',
    ownedProcesses: [],
    diagnostics: [],
  });
  if (publication.kind === 'failed') {
    throw new LifecycleFailure(70, `scenario evidence publication failed:${publication.reason}`);
  }
}

async function waitForTargetMember(
  target: TargetReadinessIdentity,
  interruption: AbortSignal,
  actors: TargetReadinessTestActors = productionTargetReadinessActors,
): Promise<readonly ProcessIdentity[]> {
  const deadline = actors.now() + scenarioTimeoutMs;
  while (true) {
    requireActive(interruption);
    const group = actors.lookupGroup(
      target.processGroupId,
      target.sessionId,
      new Set([target.anchorPid]),
    );
    const observedAt = actors.now();
    if (group.kind === 'unknown') {
      throw new LifecycleFailure(70, `scenario group lookup unknown:${group.reason}`);
    }
    if (group.kind === 'present') {
      if (observedAt >= deadline) {
        throw new LifecycleFailure(
          124,
          `scenario target did not start within ${scenarioTimeoutMs}ms`,
        );
      }
      return group.members;
    }
    if (observedAt >= deadline) {
      throw new LifecycleFailure(124, `scenario target did not start within ${scenarioTimeoutMs}ms`);
    }
    await actors.wait(10);
  }
}

async function startScenarioProcess(root: OwnedRoot, cooperative: boolean): Promise<OwnedProcess> {
  const source = cooperative
    ? "process.on('SIGTERM', () => process.exit(0)); setInterval(() => undefined, 1000)"
    : 'setTimeout(() => undefined, 500)';
  const owned = await spawnGatedProcess({
    root,
    command: process.execPath,
    args: ['-e', source],
    env: {},
  });
  await releaseGatedProcess(owned);
  return owned;
}

function emitOwnedProcessEvidence(identities: readonly ProcessIdentity[]): void {
  process.stdout.write(
    `${ownedProcessEvidencePrefix}${JSON.stringify({
      schemaVersion: 1,
      ownedProcesses: identities.map((identity) => ({
        ...identity,
        startTime: identity.startTime.toString(10),
      })),
    })}\n`,
  );
}

function reportCleanupFailure(
  root: OwnedRoot,
  requestedSignal: CliSignal | undefined,
): void {
  const failure = cleanupFailures.get(root);
  if (failure === undefined) {
    return;
  }
  cleanupFailures.delete(root);
  const concurrent =
    requestedSignal === undefined
      ? failure.childOutcome
      : {
          kind: 'signal' as const,
          signal: requestedSignal,
          status: signalStatuses[requestedSignal],
        };
  process.stderr.write(
    `cleanup-failure:${JSON.stringify({
      status: failure.cleanup.code,
      cleanup: failure.cleanup,
      concurrent: concurrent ?? { kind: 'unavailable' },
    })}\n`,
  );
}

async function runDefaultFastScenario(
  scenario: FastScenario,
  root: OwnedRoot,
  rootOnlyActors: RootOnlyScenarioTestActors = productionRootOnlyActors,
): Promise<number> {
  const interruption = activeInterruptions.get(root);
  if (interruption === undefined) {
    throw new LifecycleFailure(70, 'CLI interruption context is unavailable');
  }

  let owned: OwnedProcess | undefined;
  let childOutcome: ChildOutcome | undefined;
  let status = 0;
  let finalization: Promise<number> | undefined;
  const converge = (): Promise<number> => {
    if (finalization !== undefined) {
      return finalization;
    }
    finalization = (async () => {
      if (owned === undefined) {
        const removal = rootOnlyActors.removeRoot(root);
        if (removal.kind === 'failed') {
          cleanupFailures.set(root, {
            cleanup: {
              kind: 'failed',
              code: 70,
              diagnostics: [`owned root removal failed:${removal.reason}`],
            },
            childOutcome,
          });
          return 70;
        }
        return status;
      }
      const cleanup = await finalizeOwnedRun(owned, scenarioTimeoutMs);
      if (cleanup.kind === 'failed') {
        cleanupFailures.set(root, { cleanup, childOutcome });
        return cleanup.code;
      }
      if (childOutcome !== undefined) {
        return resolveExitStatus(childOutcome, cleanup);
      }
      return status;
    })();
    return finalization;
  };

  try {
    requireActive(interruption);
    if (scenario === 'proc' || scenario === 'all-fast') {
      verifyProcScenario();
    }
    if (scenario === 'root' || scenario === 'all-fast') {
      verifyRootScenario(root);
    }
    if (scenario === 'process') {
      owned = await startScenarioProcess(root, false);
      const members = await waitForTargetMember(
        {
          anchorPid: owned.anchor.pid,
          processGroupId: owned.anchor.processGroupId,
          sessionId: owned.anchor.sessionId,
        },
        interruption,
      );
      emitOwnedProcessEvidence([owned.anchor, ...members]);
      childOutcome = await waitForOwnedOutcome(owned, scenarioTimeoutMs);
    }
    if (scenario === 'cleanup' || scenario === 'all-fast') {
      owned = await startScenarioProcess(root, true);
      const members = await waitForTargetMember(
        {
          anchorPid: owned.anchor.pid,
          processGroupId: owned.anchor.processGroupId,
          sessionId: owned.anchor.sessionId,
        },
        interruption,
      );
      emitOwnedProcessEvidence([owned.anchor, ...members]);
    }
  } catch (error: unknown) {
    status = error instanceof ScenarioInterrupted ? 0 : reportFailure(error);
  } finally {
    return converge();
  }
}

export function runDefaultFastScenarioForTests(
  scenario: FastScenario,
  root: OwnedRoot,
): Promise<number> {
  if (process.env.NODE_ENV !== 'test') {
    throw new LifecycleFailure(64, 'default CLI scenario test boundary requires NODE_ENV=test');
  }
  return runDefaultFastScenario(scenario, root);
}

export function runDefaultRootOnlyScenarioForTests(
  scenario: 'proc' | 'root',
  root: OwnedRoot,
  actors: RootOnlyScenarioTestActors,
): Promise<number> {
  if (process.env.NODE_ENV !== 'test') {
    throw new LifecycleFailure(64, 'root-only CLI scenario test boundary requires NODE_ENV=test');
  }
  if (scenario !== 'proc' && scenario !== 'root') {
    throw new LifecycleFailure(64, 'root-only CLI scenario test boundary requires proc or root');
  }
  return runDefaultFastScenario(scenario, root, actors);
}

export function waitForTargetMemberForTests(
  target: TargetReadinessIdentity,
  interruption: AbortSignal,
  actors: TargetReadinessTestActors,
): Promise<readonly ProcessIdentity[]> {
  if (process.env.NODE_ENV !== 'test') {
    throw new LifecycleFailure(64, 'target readiness test boundary requires NODE_ENV=test');
  }
  return waitForTargetMember(target, interruption, actors);
}

const defaultDependencies: CliDependencies = {
  createRoot: createOwnedRoot,
  runFastScenario: runDefaultFastScenario,
  runHarnessScenario: (scenario, root) => {
    const interruption = activeInterruptions.get(root);
    if (interruption === undefined) {
      throw new LifecycleFailure(70, 'CLI interruption context is unavailable');
    }
    return runHarnessBlackBoxScenario(scenario, root, interruption);
  },
};

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  const controller = new AbortController();
  let requestedSignal: CliSignal | undefined;
  let requestedSignalStatus: number | undefined;
  let scenarioRun: Promise<number> | undefined;
  let convergence: Promise<number> | undefined;
  const converge = (incomingStatus: number): Promise<number> => {
    if (convergence !== undefined) {
      return convergence;
    }
    convergence = (async () => {
      if (scenarioRun === undefined) {
        return incomingStatus;
      }
      const scenarioStatus = await scenarioRun;
      if (root !== undefined) {
        reportCleanupFailure(root, requestedSignal);
      }
      if (scenarioStatus === 70) {
        return scenarioStatus;
      }
      return requestedSignalStatus ?? incomingStatus;
    })();
    return convergence;
  };
  let resolveSignal: (status: number) => void = () => undefined;
  const signalStatus = new Promise<number>((resolve) => {
    resolveSignal = resolve;
  });
  const listeners = (Object.keys(signalStatuses) as CliSignal[]).map((signal) => {
    const listener = (): void => {
      if (requestedSignalStatus !== undefined) {
        return;
      }
      requestedSignalStatus = signalStatuses[signal];
      requestedSignal = signal;
      controller.abort(signal);
      resolveSignal(requestedSignalStatus);
    };
    process.on(signal, listener);
    return { signal, listener };
  });

  let root: OwnedRoot | undefined;
  let status = 70;
  try {
    const [scenario, ...extraArgs] = args;
    if ((!isFastScenario(scenario) && !isHarnessScenario(scenario)) || extraArgs.length > 0) {
      throw new LifecycleFailure(
        64,
        `unknown disposable lifecycle scenario: ${scenario ?? ''}`,
      );
    }
    if (isHarnessScenario(scenario) && dependencies.runHarnessScenario === undefined) {
      throw new LifecycleFailure(70, `harness scenario is not implemented: ${scenario}`);
    }
    const delayMs = validateDelayEnvironment();
    await waitForDelay(delayMs, controller.signal);
    if (requestedSignalStatus !== undefined) {
      status = requestedSignalStatus;
    } else {
      root = dependencies.createRoot();
      activeInterruptions.set(root, controller.signal);
      scenarioRun = (
        isFastScenario(scenario)
          ? dependencies.runFastScenario(scenario, root)
          : dependencies.runHarnessScenario?.(scenario, root) ??
            Promise.reject(
              new LifecycleFailure(70, `harness scenario is not implemented: ${scenario}`),
            )
      ).catch(reportFailure);
      const first = await Promise.race([
        scenarioRun.then((scenarioStatus) => ({ kind: 'scenario' as const, status: scenarioStatus })),
        signalStatus.then((signal) => ({ kind: 'signal' as const, status: signal })),
      ]);
      status = first.status;
    }
  } catch (error: unknown) {
    status = reportFailure(error);
  } finally {
    try {
      status = await converge(status);
    } finally {
      if (root !== undefined) {
        activeInterruptions.delete(root);
      }
      for (const { signal, listener } of listeners) {
        process.off(signal, listener);
      }
    }
  }
  return status;
}

async function main(): Promise<void> {
  const status = await runCli(process.argv.slice(2), defaultDependencies);
  process.exitCode = status;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main();
}
