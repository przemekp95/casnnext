export type HarnessResources = Readonly<{
  container: string;
  tempRoot: string;
  appPid?: number;
  mysqlPort?: number;
  appPort: 31337;
}>;

export type HarnessCleanupEvidence = Readonly<{
  container: string;
  tempRoot: string;
  appPid?: number;
  verified: boolean;
}>;

export type HarnessEvidence = Readonly<{
  resources: HarnessResources | undefined;
  cleanup: HarnessCleanupEvidence | undefined;
  readiness: Readonly<{
    mysqlFinalServer: boolean;
    applicationUserSelect: boolean;
    applicationHealthy: boolean;
  }>;
  diagnostics: readonly string[];
}>;

export type HarnessInventory = Readonly<{
  docker: readonly string[];
  listeners: readonly string[];
  tempRoots: readonly string[];
  processes: readonly string[];
}>;

export type HarnessAbsenceObservation = 'absent' | 'present' | 'unknown';

export type HarnessAbsenceObservations = Readonly<{
  container: HarnessAbsenceObservation;
  tempRoot: HarnessAbsenceObservation;
  appPid?: HarnessAbsenceObservation;
  mysqlPort?: HarnessAbsenceObservation;
  appPort: HarnessAbsenceObservation;
}>;

export type HarnessAbsenceVerification =
  | Readonly<{ kind: 'verified' }>
  | Readonly<{ kind: 'failed'; diagnostics: readonly string[] }>;

export type DescendantReadinessCase = 'leader-exit' | 'external-term';

export type DescendantReadinessInspection =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'ready'; pid: number }>
  | Readonly<{ kind: 'failed'; diagnostics: readonly string[] }>;

export type DescendantAbsenceVerification =
  | Readonly<{ kind: 'verified' }>
  | Readonly<{ kind: 'failed'; diagnostics: readonly string[] }>;

const resourceLine =
  /^\[disposable-app\] resources container=(casn-quality-[1-9][0-9]*-[0-9a-f]{12}-mysql) temp_dir=(\/tmp\/casn-quality\.[A-Za-z0-9]{6})$/;
const mysqlPortLine = /^\[disposable-app\] mysql_port=([1-9][0-9]*) image=mysql:8\.4$/;
const mysqlReadyLine =
  /^\[disposable-app\] MySQL final server ready phases=([1-9][0-9]*) application_user_select=ok$/;
const applicationHealthyLine =
  /^\[disposable-app\] Application healthy pid=([1-9][0-9]*) url=http:\/\/127\.0\.0\.1:31337$/;
const cleanupLine =
  /^\[disposable-app\] cleanup container=(casn-quality-[1-9][0-9]*-[0-9a-f]{12}-mysql) app_pid=(none|[1-9][0-9]*) temp_dir=(none|\/tmp\/casn-quality\.[A-Za-z0-9]{6}) verified=([01])$/;
const descendantReadinessPrefix = '[harness-child] ignored-descendant ';
const descendantReadinessLine =
  /^\[harness-child\] ignored-descendant case=(leader-exit|external-term) pid=([1-9][0-9]*)$/;

function parsePositiveInteger(value: string, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  if (!/^[1-9][0-9]*$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : undefined;
}

function introduced(before: readonly string[], after: readonly string[]): readonly string[] {
  const baseline = new Set(before);
  return after.filter((entry) => !baseline.has(entry));
}

function observationDiagnostic(
  label: string,
  value: string | number,
  observation: HarnessAbsenceObservation | undefined,
): string | undefined {
  if (observation === 'absent') {
    return undefined;
  }
  if (observation === 'present') {
    return `${label} remained present:${value}`;
  }
  return `${label} absence query was ${observation ?? 'missing'}:${value}`;
}

export function parseHarnessEvidence(output: string): HarnessEvidence {
  let container: string | undefined;
  let tempRoot: string | undefined;
  let appPid: number | undefined;
  let mysqlPort: number | undefined;
  let cleanup: HarnessCleanupEvidence | undefined;
  let mysqlFinalServer = false;
  let applicationUserSelect = false;
  let applicationHealthy = false;
  const diagnostics: string[] = [];

  for (const rawLine of output.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const resource = resourceLine.exec(line);
    if (resource !== null) {
      if (container !== undefined || tempRoot !== undefined) {
        diagnostics.push('duplicate harness resource line');
      } else {
        [, container, tempRoot] = resource;
      }
      continue;
    }

    const port = mysqlPortLine.exec(line);
    if (port !== null) {
      const parsed = parsePositiveInteger(port[1] ?? '', 65_535);
      if (parsed === undefined || mysqlPort !== undefined) {
        diagnostics.push('invalid or duplicate harness MySQL port line');
      } else {
        mysqlPort = parsed;
      }
      continue;
    }

    if (mysqlReadyLine.test(line)) {
      mysqlFinalServer = true;
      applicationUserSelect = true;
      continue;
    }

    const healthy = applicationHealthyLine.exec(line);
    if (healthy !== null) {
      const parsed = parsePositiveInteger(healthy[1] ?? '');
      if (parsed === undefined || appPid !== undefined) {
        diagnostics.push('invalid or duplicate harness application health line');
      } else {
        appPid = parsed;
        applicationHealthy = true;
      }
      continue;
    }

    const cleanupMatch = cleanupLine.exec(line);
    if (cleanupMatch !== null) {
      const [, cleanupContainer, cleanupPid, cleanupTempRoot, verified] = cleanupMatch;
      const parsedCleanupPid = cleanupPid === 'none' ? undefined : parsePositiveInteger(cleanupPid ?? '');
      if (
        cleanup !== undefined ||
        cleanupContainer === undefined ||
        cleanupTempRoot === undefined ||
        verified === undefined ||
        (cleanupPid !== 'none' && parsedCleanupPid === undefined)
      ) {
        diagnostics.push('invalid or duplicate harness cleanup line');
      } else {
        cleanup = {
          container: cleanupContainer,
          tempRoot: cleanupTempRoot,
          ...(parsedCleanupPid === undefined ? {} : { appPid: parsedCleanupPid }),
          verified: verified === '1',
        };
      }
    }
  }

  const resources =
    container === undefined || tempRoot === undefined
      ? undefined
      : {
          container,
          tempRoot,
          ...(appPid === undefined ? {} : { appPid }),
          ...(mysqlPort === undefined ? {} : { mysqlPort }),
          appPort: 31337 as const,
        };

  return {
    resources,
    cleanup,
    readiness: { mysqlFinalServer, applicationUserSelect, applicationHealthy },
    diagnostics,
  };
}

export function diffHarnessInventory(
  before: HarnessInventory,
  after: HarnessInventory,
): HarnessInventory {
  return {
    docker: introduced(before.docker, after.docker),
    listeners: introduced(before.listeners, after.listeners),
    tempRoots: introduced(before.tempRoots, after.tempRoots),
    processes: introduced(before.processes, after.processes),
  };
}

export function verifyHarnessAbsence(
  evidence: HarnessEvidence,
  before: HarnessInventory,
  after: HarnessInventory,
  observations: HarnessAbsenceObservations,
): HarnessAbsenceVerification {
  const diagnostics = [...evidence.diagnostics];
  const resources = evidence.resources;
  if (resources === undefined) {
    diagnostics.push('harness resource line is missing');
  } else {
    for (const diagnostic of [
      observationDiagnostic('reported container', resources.container, observations.container),
      observationDiagnostic('reported temp root', resources.tempRoot, observations.tempRoot),
      observationDiagnostic('reported application port', resources.appPort, observations.appPort),
      resources.appPid === undefined
        ? undefined
        : observationDiagnostic('reported application PID', resources.appPid, observations.appPid),
      resources.mysqlPort === undefined
        ? undefined
        : observationDiagnostic('reported MySQL port', resources.mysqlPort, observations.mysqlPort),
    ]) {
      if (diagnostic !== undefined) {
        diagnostics.push(diagnostic);
      }
    }
  }

  const difference = diffHarnessInventory(before, after);
  diagnostics.push(...difference.docker.map((entry) => `new Docker resource remained:${entry}`));
  diagnostics.push(...difference.listeners.map((entry) => `new listener remained:${entry}`));
  diagnostics.push(...difference.tempRoots.map((entry) => `new temporary root remained:${entry}`));
  diagnostics.push(...difference.processes.map((entry) => `new invocation process remained:${entry}`));

  return diagnostics.length === 0 ? { kind: 'verified' } : { kind: 'failed', diagnostics };
}

export function inspectDescendantReadiness(
  output: string,
  expectedCase: DescendantReadinessCase,
): DescendantReadinessInspection {
  const lines = output.split('\n');
  lines.pop();
  const candidates = lines.filter((line) => line.startsWith(descendantReadinessPrefix));
  if (candidates.length === 0) {
    return { kind: 'pending' };
  }
  const parsed = candidates.map((line) => descendantReadinessLine.exec(line));
  if (parsed.some((match) => match === null)) {
    return { kind: 'failed', diagnostics: ['malformed ignored descendant readiness line'] };
  }
  const exact = parsed.filter(
    (match): match is RegExpExecArray => match !== null,
  );
  if (exact.some((match) => match[1] !== expectedCase)) {
    return { kind: 'failed', diagnostics: ['unexpected ignored descendant readiness case'] };
  }
  if (exact.length !== 1) {
    return { kind: 'failed', diagnostics: ['duplicate ignored descendant readiness lines'] };
  }
  const pid = parsePositiveInteger(exact[0]?.[2] ?? '');
  if (pid === undefined) {
    return { kind: 'failed', diagnostics: ['malformed ignored descendant readiness line'] };
  }
  return { kind: 'ready', pid };
}

export function verifyDescendantAbsence(
  readiness: DescendantReadinessInspection,
  observation: HarnessAbsenceObservation,
): DescendantAbsenceVerification {
  if (readiness.kind === 'failed') {
    return readiness;
  }
  if (readiness.kind === 'pending') {
    return { kind: 'failed', diagnostics: ['ignored descendant readiness line is missing'] };
  }
  if (observation === 'absent') {
    return { kind: 'verified' };
  }
  if (observation === 'present') {
    return {
      kind: 'failed',
      diagnostics: [`reported ignored descendant remained present:${readiness.pid}`],
    };
  }
  return {
    kind: 'failed',
    diagnostics: [`reported ignored descendant absence query was unknown:${readiness.pid}`],
  };
}
