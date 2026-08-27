import { spawnSync } from 'node:child_process';
import {
  accessSync,
  closeSync,
  constants,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { finalizeOwnedRun, resolveExitStatus } from './finalize';
import {
  inspectDescendantReadiness,
  parseHarnessEvidence,
  verifyDescendantAbsence,
  verifyHarnessAbsence,
  type DescendantReadinessCase,
  type HarnessAbsenceObservation,
  type HarnessAbsenceObservations,
  type HarnessEvidence,
  type HarnessInventory,
} from './harness-evidence';
import {
  createOwnedFile,
  createOwnedRoot,
  removeOwnedRoot,
  type OwnedRoot,
} from './owned-root';
import {
  releaseGatedProcess,
  spawnGatedProcess,
  waitForOwnedOutcome,
  type OwnedProcess,
} from './owned-process';
import { lookupProcess } from './proc';
import { LifecycleFailure, type ChildOutcome, type ProcessIdentity } from './types';

export type HarnessScenario =
  | 'harness-success'
  | 'harness-status'
  | 'harness-term'
  | 'harness-descendant'
  | 'harness-proof-failure'
  | 'all-harness';

type ToolPaths = Readonly<{
  docker: string;
  ss: string;
  ps: string;
  bash: string;
}>;

type HarnessReadOnlyQueryResult = Readonly<{
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Readonly<{ message: string; code?: string }>;
}>;

export type HarnessReadOnlyQueryActor = (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd?: string; timeoutMs: number }>,
) => HarnessReadOnlyQueryResult;

export type HarnessReadOnlyQueryTestInput =
  | Readonly<{ kind: 'resolve-command'; name: string }>
  | Readonly<{
      kind: 'query';
      command: string;
      args: readonly string[];
      label: string;
    }>;

type CompletedHarnessCase = Readonly<{
  outcome: ChildOutcome;
  evidence: HarnessEvidence;
  stdout: string;
  stderr: string;
  durationMs: number;
}>;

type HarnessCaseControl = Readonly<{
  descendantCase?: DescendantReadinessCase;
  label?: string;
  killRequired?: boolean;
  signalAfterDescendantReadiness?: boolean;
  signalAfterMarker?: string;
  prepareRoot?: (root: OwnedRoot) => Readonly<Record<string, string>>;
  allowedAbsenceDiagnostics?: readonly string[];
}>;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const harnessPath = join(repositoryRoot, 'scripts/ci/with-disposable-app.sh');
const harnessTimeoutMs = 600_000;
const cleanupTimeoutMs = 30_000;
const queryMaximumBytes = 4 * 1024 * 1024;
const queryTimeoutMs = 10_000;
const successfulChildMarker =
  '[harness-child] success database_url=ok live_urls=equal health=ok';
const statusChildMarker =
  '[harness-child] status database_url=ok live_urls=equal health=ok exit=23';
const termChildMarker =
  '[harness-child] term database_url=ok live_urls=equal health=ok waiting=1';
const leaderExitDescendantMarker =
  '[harness-child] descendant database_url=ok live_urls=equal health=ok leader_exit=1 ignored_ready=1';
const termDescendantMarker =
  '[harness-child] descendant database_url=ok live_urls=equal health=ok external_term=1 ignored_ready=1';
const dockerProofChildMarker =
  '[harness-child] proof-docker database_url=ok live_urls=equal health=ok exit=0';

function spawnErrorCode(error: Error | undefined): string | undefined {
  if (error === undefined || !('code' in error) || typeof error.code !== 'string') {
    return undefined;
  }
  return error.code;
}

function requireActive(interruption: AbortSignal): void {
  if (interruption.aborted) {
    throw new LifecycleFailure(143, 'harness scenario interrupted');
  }
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

const productionReadOnlyQueryActor: HarnessReadOnlyQueryActor = (
  command,
  args,
  options,
) => {
  const result = spawnSync(command, [...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    encoding: 'utf8',
    maxBuffer: queryMaximumBytes,
    timeout: options.timeoutMs,
  });
  const code = spawnErrorCode(result.error);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    signal: result.signal,
    ...(result.error === undefined
      ? {}
      : {
          error: {
            message: result.error.message,
            ...(code === undefined ? {} : { code }),
          },
        }),
  };
};

function commandPath(
  name: string,
  actor: HarnessReadOnlyQueryActor = productionReadOnlyQueryActor,
): string {
  const result = actor(
    '/bin/sh',
    ['-c', 'command -v "$1"', 'casn-command-path', name],
    { timeoutMs: queryTimeoutMs },
  );
  if (result.error?.code === 'ETIMEDOUT') {
    throw new LifecycleFailure(
      124,
      `required harness query command timed out after ${queryTimeoutMs}ms:${name}`,
    );
  }
  if (result.error !== undefined || result.status !== 0) {
    throw new LifecycleFailure(69, `required harness query command is unavailable:${name}`);
  }
  const path = result.stdout.trim();
  if (!path.startsWith('/')) {
    throw new LifecycleFailure(69, `required harness query command is not absolute:${name}`);
  }
  try {
    accessSync(path, constants.X_OK);
    return realpathSync(path);
  } catch {
    throw new LifecycleFailure(69, `required harness query command is not executable:${name}`);
  }
}

function captureToolPaths(): ToolPaths {
  return {
    docker: commandPath('docker'),
    ss: commandPath('ss'),
    ps: commandPath('ps'),
    bash: commandPath('bash'),
  };
}

function readOnlyQuery(
  command: string,
  args: readonly string[],
  label: string,
  actor: HarnessReadOnlyQueryActor = productionReadOnlyQueryActor,
): string {
  const result = actor(command, args, { cwd: repositoryRoot, timeoutMs: queryTimeoutMs });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new LifecycleFailure(124, `${label} query timed out after ${queryTimeoutMs}ms`);
  }
  if (result.error !== undefined) {
    throw new LifecycleFailure(70, `${label} query failed:${result.error.message}`);
  }
  if (result.status !== 0) {
    const diagnostic = result.stderr.trim() || `status ${result.status ?? 'unknown'}`;
    throw new LifecycleFailure(70, `${label} query failed:${diagnostic}`);
  }
  return result.stdout;
}

export function runHarnessReadOnlyQueryForTests(
  input: HarnessReadOnlyQueryTestInput,
  actor: HarnessReadOnlyQueryActor,
): string {
  if (process.env.NODE_ENV !== 'test') {
    throw new LifecycleFailure(64, 'harness read-only query test boundary requires NODE_ENV=test');
  }
  if (input.kind === 'resolve-command') {
    return commandPath(input.name, actor);
  }
  return readOnlyQuery(input.command, input.args, input.label, actor);
}

function nonemptySortedLines(output: string): readonly string[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .sort();
}

function captureTempRoots(): readonly string[] {
  return readdirSync('/tmp')
    .filter((basename) => basename.startsWith('casn-quality.'))
    .map((basename) => {
      const path = join('/tmp', basename);
      const stat = lstatSync(path, { bigint: true });
      return `${path}\t${stat.dev.toString(10)}\t${stat.ino.toString(10)}`;
    })
    .sort();
}

function captureHarnessProcesses(ps: string): readonly string[] {
  return nonemptySortedLines(readOnlyQuery(ps, ['-eo', 'pid=,ppid=,pgid=,sid=,args='], 'process'))
    .filter(
      (line) =>
        line.includes('/scripts/ci/with-disposable-app.sh') ||
        line.includes('/scripts/ci/disposable-process-supervisor.sh'),
    );
}

function captureHarnessInventory(tools: ToolPaths): HarnessInventory {
  return {
    docker: nonemptySortedLines(
      readOnlyQuery(
        tools.docker,
        ['ps', '-a', '--filter', 'name=casn-quality-', '--format', '{{.ID}}\t{{.Names}}'],
        'Docker inventory',
      ),
    ),
    listeners: nonemptySortedLines(
      readOnlyQuery(tools.ss, ['-H', '-ltnp', '( sport = :31337 )'], 'port 31337'),
    ),
    tempRoots: captureTempRoots(),
    processes: captureHarnessProcesses(tools.ps),
  };
}

function pathAbsence(path: string): HarnessAbsenceObservation {
  try {
    lstatSync(path);
    return 'present';
  } catch (error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
      ? 'absent'
      : 'unknown';
  }
}

function processAbsence(pid: number): HarnessAbsenceObservation {
  const lookup = lookupProcess(pid);
  return lookup.kind;
}

function portAbsence(ss: string, port: number): HarnessAbsenceObservation {
  const output = readOnlyQuery(ss, ['-H', '-ltnp', `( sport = :${port} )`], `port ${port}`);
  return output.trim().length === 0 ? 'absent' : 'present';
}

function containerAbsence(
  inventory: HarnessInventory,
  container: string,
): HarnessAbsenceObservation {
  return inventory.docker.some((entry) => entry.split('\t')[1] === container)
    ? 'present'
    : 'absent';
}

function absenceObservations(
  evidence: HarnessEvidence,
  after: HarnessInventory,
  tools: ToolPaths,
): HarnessAbsenceObservations {
  const resources = evidence.resources;
  if (resources === undefined) {
    return { container: 'unknown', tempRoot: 'unknown', appPort: 'unknown' };
  }
  return {
    container: containerAbsence(after, resources.container),
    tempRoot: pathAbsence(resources.tempRoot),
    ...(resources.appPid === undefined ? {} : { appPid: processAbsence(resources.appPid) }),
    ...(resources.mysqlPort === undefined
      ? {}
      : { mysqlPort: portAbsence(tools.ss, resources.mysqlPort) }),
    appPort: portAbsence(tools.ss, resources.appPort),
  };
}

function readCapture(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error: unknown) {
    throw new LifecycleFailure(
      70,
      `harness capture read failed:${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

function childOutcomeDiagnostic(outcome: ChildOutcome): string {
  if (outcome.kind === 'exit') {
    return `exit:${outcome.code}`;
  }
  if (outcome.kind === 'signal') {
    return `signal:${outcome.signal}`;
  }
  if (outcome.kind === 'timeout') {
    return `timeout:${outcome.phase}`;
  }
  return `spawn-error:${outcome.message.replaceAll(/\s+/g, ' ').slice(0, 240)}`;
}

function redactHarnessOutput(output: string): string {
  return output
    .replaceAll(/mysql:\/\/[^\s'"`]+/g, 'mysql://[redacted]')
    .replaceAll(/(MYSQL_(?:ROOT_)?PASSWORD=)[^\s'"`]+/g, '$1[redacted]');
}

function emitHarnessObservation(
  completed: CompletedHarnessCase,
  control: HarnessCaseControl,
): void {
  const { cleanup, diagnostics, readiness } = completed.evidence;
  const killRequired = control.killRequired === true;
  const killObserved = completed.stderr.includes(
    '[disposable-app] active command required bounded KILL escalation group=',
  );
  process.stdout.write(
    `[harness-observation] case=${control.label ?? 'unlabeled'} ` +
      `outcome=${childOutcomeDiagnostic(completed.outcome)} ` +
      `mysql_final=${Number(readiness.mysqlFinalServer)} ` +
      `application_user_select=${Number(readiness.applicationUserSelect)} ` +
      `application_healthy=${Number(readiness.applicationHealthy)} ` +
      `cleanup=${cleanup === undefined ? 'missing' : Number(cleanup.verified)} ` +
      `parser_diagnostics=${diagnostics.length} ` +
      `kill_required=${Number(killRequired)} ` +
      `kill_required_observed=${Number(killRequired && killObserved)} ` +
      `duration_ms=${completed.durationMs}\n`,
  );
  if (completed.outcome.kind === 'exit' && completed.outcome.code === 0) {
    return;
  }
  process.stderr.write('[harness-capture] stdout-begin\n');
  process.stderr.write(redactHarnessOutput(completed.stdout));
  process.stderr.write('[harness-capture] stdout-end stderr-begin\n');
  process.stderr.write(redactHarnessOutput(completed.stderr));
  process.stderr.write('[harness-capture] stderr-end\n');
}

function requireCleanupMatchesResources(evidence: HarnessEvidence): void {
  const resources = evidence.resources;
  const cleanup = evidence.cleanup;
  if (resources === undefined || cleanup === undefined) {
    throw new LifecycleFailure(70, 'harness resource or cleanup evidence is missing');
  }
  if (
    cleanup.container !== resources.container ||
    cleanup.tempRoot !== resources.tempRoot ||
    cleanup.appPid !== resources.appPid
  ) {
    throw new LifecycleFailure(70, 'harness cleanup evidence does not match reported resources');
  }
}

function requireExpectedBehavior(
  completed: CompletedHarnessCase,
  expectedStatus: number,
  childMarker: string,
): void {
  if (completed.outcome.kind !== 'exit' || completed.outcome.code !== expectedStatus) {
    throw new LifecycleFailure(
      70,
      `harness case did not preserve child status ${expectedStatus}:${childOutcomeDiagnostic(completed.outcome)}`,
    );
  }
  requireCleanupMatchesResources(completed.evidence);
  if (completed.evidence.cleanup?.verified !== true) {
    throw new LifecycleFailure(70, 'successful harness cleanup did not report verified=1');
  }
  if (
    !completed.evidence.readiness.mysqlFinalServer ||
    !completed.evidence.readiness.applicationUserSelect ||
    !completed.evidence.readiness.applicationHealthy
  ) {
    throw new LifecycleFailure(70, 'successful harness readiness evidence is incomplete');
  }
  const readinessOffset = completed.stdout.indexOf(
    '[disposable-app] MySQL final server ready phases=',
  );
  const buildOffset = completed.stdout.search(/\n> [^\n]+ build\n/);
  if (readinessOffset < 0 || buildOffset < 0 || readinessOffset >= buildOffset) {
    throw new LifecycleFailure(70, 'MySQL final readiness was not observed before application build');
  }
  if (!completed.stdout.includes(`${childMarker}\n`)) {
    throw new LifecycleFailure(70, 'harness child behavior marker is missing');
  }
}

function healthyChildSource(marker: string, exitStatus?: number): string {
  const completion =
    exitStatus === undefined
      ? 'setInterval(() => undefined, 1000);'
      : `process.exit(${exitStatus});`;
  return `
  const expectedBaseUrl = 'http://127.0.0.1:31337';
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) process.exit(81);
  const parsed = new URL(databaseUrl);
  if (
    parsed.protocol !== 'mysql:' || parsed.username !== 'casn' ||
    parsed.hostname !== '127.0.0.1' || !/^[1-9][0-9]*$/.test(parsed.port) ||
    parsed.pathname !== '/casn'
  ) process.exit(82);
  if (process.env.LIVE_BASE_URL !== expectedBaseUrl) process.exit(83);
  if (process.env.CYPRESS_baseUrl !== expectedBaseUrl) process.exit(84);
  if (process.env.LIVE_BASE_URL !== process.env.CYPRESS_baseUrl) process.exit(85);
  const response = await fetch(expectedBaseUrl + '/api/health');
  if (!response.ok) process.exit(86);
  process.stdout.write(${JSON.stringify(`${marker}\n`)});
  ${completion}
`;
}

function ignoredDescendantChildSource(
  marker: string,
  descendantCase: DescendantReadinessCase,
  waitForExternalTerm: boolean,
): string {
  const descendantSource = `
    process.on('SIGTERM', () => undefined);
    process.send?.({ type: 'ignored-descendant-ready' });
    setInterval(() => undefined, 1000);
  `;
  const completion = waitForExternalTerm
    ? 'setInterval(() => undefined, 1000);'
    : 'process.exit(0);';
  return `
    import { spawn } from 'node:child_process';
    import { performance } from 'node:perf_hooks';

    const expectedBaseUrl = 'http://127.0.0.1:31337';
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined) process.exit(81);
    const parsed = new URL(databaseUrl);
    if (
      parsed.protocol !== 'mysql:' || parsed.username !== 'casn' ||
      parsed.hostname !== '127.0.0.1' || !/^[1-9][0-9]*$/.test(parsed.port) ||
      parsed.pathname !== '/casn'
    ) process.exit(82);
    if (process.env.LIVE_BASE_URL !== expectedBaseUrl) process.exit(83);
    if (process.env.CYPRESS_baseUrl !== expectedBaseUrl) process.exit(84);
    if (process.env.LIVE_BASE_URL !== process.env.CYPRESS_baseUrl) process.exit(85);
    const response = await fetch(expectedBaseUrl + '/api/health');
    if (!response.ok) process.exit(86);

    const descendant = spawn(
      process.execPath,
      ['--input-type=module', '-e', ${JSON.stringify(descendantSource)}],
      { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
    );
    await new Promise((resolveReady, rejectReady) => {
      const deadline = performance.now() + 3000;
      let settled = false;
      const finish = (failure) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        if (failure === undefined) resolveReady(undefined);
        else rejectReady(failure);
      };
      const poll = setInterval(() => {
        if (performance.now() >= deadline) {
          finish(new Error('ignored descendant readiness deadline exceeded'));
        }
      }, 10);
      descendant.once('error', (error) => finish(error));
      descendant.once('exit', () => finish(new Error('ignored descendant exited before readiness')));
      descendant.on('message', (message) => {
        if (message?.type !== 'ignored-descendant-ready') return;
        const observedAt = performance.now();
        if (observedAt >= deadline) {
          finish(new Error('ignored descendant readiness observed at or after deadline'));
        } else {
          finish(undefined);
        }
      });
    });
    const descendantPid = descendant.pid;
    if (!Number.isSafeInteger(descendantPid) || descendantPid <= 0) process.exit(87);
    process.stdout.write(${JSON.stringify(`${marker}\n`)});
    process.stdout.write(
      ${JSON.stringify(`[harness-child] ignored-descendant case=${descendantCase} pid=`)} +
      descendantPid + '\\n',
    );
    ${completion}
  `;
}

function requireIgnoredDescendantCleanup(completed: CompletedHarnessCase): void {
  if (!completed.stderr.includes('[disposable-app] active command required bounded KILL escalation group=')) {
    throw new LifecycleFailure(70, 'ignored descendant did not require bounded KILL cleanup');
  }
}

function writeBuffer(fd: number, contents: string): void {
  const buffer = Buffer.from(contents);
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(fd, buffer, offset, buffer.length - offset);
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function createFakeQueryTool(
  root: OwnedRoot,
  name: 'docker' | 'ss',
  realCommand: string,
): void {
  const targetCondition =
    name === 'docker'
      ? `[[ "$#" -eq 5 && "$1" == 'container' && "$2" == 'ls' && "$3" == '-a' && "$4" == '--format' && "$5" == '{{.Names}}' ]]`
      : `[[ "$#" -eq 3 && "$1" == '-H' && "$2" == '-ltn' && "$3" == 'sport = :31337' ]]`;
  const source = `#!/usr/bin/env bash
set -euo pipefail
if ${targetCondition}; then
  printf 'injected ${name} absence query failure\\n' >&2
  exit 73
fi
exec ${shellQuote(realCommand)} "$@"
`;
  const created = createOwnedFile(root, name, 0o700);
  if (created.kind === 'failed') {
    throw new LifecycleFailure(70, `fake ${name} creation failed:${created.reason}`);
  }
  let operationFailure: unknown;
  let closeFailure: unknown;
  try {
    writeBuffer(created.file.fd, source);
  } catch (error: unknown) {
    operationFailure = error;
  } finally {
    try {
      closeSync(created.file.fd);
    } catch (error: unknown) {
      closeFailure = error;
    }
  }
  const failures = [operationFailure, closeFailure].filter(
    (failure): failure is NonNullable<typeof failure> => failure !== undefined,
  );
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, `fake ${name} write and close failed`);
  }
}

function fakeToolEnvironment(root: OwnedRoot): Readonly<Record<string, string>> {
  return { PATH: `${root.path}:${process.env.PATH ?? '/usr/bin:/bin'}` };
}

function requireProofFailure(
  completed: CompletedHarnessCase,
  tool: 'docker' | 'ss',
): void {
  if (completed.outcome.kind !== 'exit' || completed.outcome.code !== 1) {
    throw new LifecycleFailure(
      70,
      `${tool} proof failure returned an unexpected outcome:${childOutcomeDiagnostic(completed.outcome)}`,
    );
  }
  if (completed.evidence.cleanup?.verified !== false) {
    throw new LifecycleFailure(70, `${tool} proof failure did not report cleanup verified=0`);
  }
  if (/^\[disposable-app\] cleanup .* verified=1$/m.test(completed.stdout)) {
    throw new LifecycleFailure(70, `${tool} proof failure incorrectly reported verified=1`);
  }
  if (!completed.stderr.includes(`injected ${tool} absence query failure`)) {
    throw new LifecycleFailure(70, `${tool} proof failure diagnostic is missing`);
  }
  if (tool === 'docker') {
    requireCleanupMatchesResources(completed.evidence);
    if (
      !completed.evidence.readiness.mysqlFinalServer ||
      !completed.evidence.readiness.applicationUserSelect ||
      !completed.evidence.readiness.applicationHealthy ||
      !completed.stdout.includes(`${dockerProofChildMarker}\n`)
    ) {
      throw new LifecycleFailure(70, 'Docker proof failure did not reach child behavior');
    }
  } else if (
    completed.evidence.resources !== undefined ||
    completed.evidence.readiness.mysqlFinalServer ||
    completed.evidence.readiness.applicationUserSelect ||
    completed.evidence.readiness.applicationHealthy
  ) {
    throw new LifecycleFailure(70, 'ss proof failure mutated resources before its query failed');
  }
}

async function waitForCaptureMarker(
  owned: OwnedProcess,
  marker: string,
  interruption: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (true) {
    requireActive(interruption);
    const output = readCapture(owned.stdoutPath);
    const observedAt = performance.now();
    if (output.includes(`${marker}\n`)) {
      if (observedAt >= deadline) {
        throw new LifecycleFailure(70, 'harness readiness observed at or after its deadline');
      }
      return;
    }
    if (observedAt >= deadline) {
      throw new LifecycleFailure(124, `harness readiness exceeded ${timeoutMs}ms`);
    }
    const outcome = await waitForOwnedOutcome(owned, 10);
    if (outcome.kind !== 'timeout') {
      throw new LifecycleFailure(
        70,
        `harness exited before readiness:${childOutcomeDiagnostic(outcome)}`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

async function waitForDescendantReadiness(
  owned: OwnedProcess,
  descendantCase: DescendantReadinessCase,
  interruption: AbortSignal,
  timeoutMs: number,
): Promise<number> {
  const deadline = performance.now() + timeoutMs;
  while (true) {
    requireActive(interruption);
    const readiness = inspectDescendantReadiness(
      readCapture(owned.stdoutPath),
      descendantCase,
    );
    const observedAt = performance.now();
    if (readiness.kind === 'ready') {
      if (observedAt >= deadline) {
        throw new LifecycleFailure(
          70,
          'ignored descendant readiness observed at or after its deadline',
        );
      }
      return readiness.pid;
    }
    if (readiness.kind === 'failed') {
      throw new LifecycleFailure(70, readiness.diagnostics.join('; '));
    }
    if (observedAt >= deadline) {
      throw new LifecycleFailure(
        124,
        `ignored descendant readiness exceeded ${timeoutMs}ms`,
      );
    }
    const outcome = await waitForOwnedOutcome(owned, 10);
    if (outcome.kind !== 'timeout') {
      throw new LifecycleFailure(
        70,
        `harness exited before ignored descendant readiness:${childOutcomeDiagnostic(outcome)}`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

function signalDriverOwnedAnchor(owned: OwnedProcess): void {
  const deadline = performance.now() + 1_000;
  const lookup = lookupProcess(owned.anchor.pid);
  const observedAt = performance.now();
  if (lookup.kind === 'unknown') {
    throw new LifecycleFailure(70, `TERM anchor lookup unknown:${lookup.reason}`);
  }
  if (
    lookup.kind !== 'present' ||
    !sameIdentity(lookup.identity, owned.anchor) ||
    owned.child.exitCode !== null ||
    owned.child.signalCode !== null ||
    lookup.identity.parentPid !== process.pid ||
    lookup.identity.pid !== lookup.identity.processGroupId ||
    lookup.identity.pid !== lookup.identity.sessionId
  ) {
    throw new LifecycleFailure(70, 'TERM detached anchor identity or topology changed');
  }
  if (observedAt >= deadline) {
    throw new LifecycleFailure(70, 'TERM anchor identity observed at or after 1000ms deadline');
  }
  process.kill(-lookup.identity.processGroupId, 'SIGTERM');
}

async function runHarnessCase(
  root: OwnedRoot,
  interruption: AbortSignal,
  tools: ToolPaths,
  childSource: string,
  control: HarnessCaseControl = {},
): Promise<CompletedHarnessCase> {
  const startedAt = performance.now();
  let owned: OwnedProcess | undefined;
  let finalized = false;
  let operationFailure: unknown;
  let cleanupFailure: unknown;
  let completed: CompletedHarnessCase | undefined;

  try {
    requireActive(interruption);
    const before = captureHarnessInventory(tools);
    const env = control.prepareRoot?.(root) ?? {};
    owned = await spawnGatedProcess({
      root,
      command: tools.bash,
      args: [
        harnessPath,
        process.execPath,
        '--input-type=module',
        '-e',
        childSource,
      ],
      env,
    });
    await releaseGatedProcess(owned);
    if (control.signalAfterDescendantReadiness === true) {
      if (control.descendantCase === undefined) {
        throw new LifecycleFailure(70, 'descendant signal control is missing its fixed case');
      }
      await waitForDescendantReadiness(
        owned,
        control.descendantCase,
        interruption,
        harnessTimeoutMs,
      );
      requireActive(interruption);
      signalDriverOwnedAnchor(owned);
    }
    if (control.signalAfterMarker !== undefined) {
      await waitForCaptureMarker(
        owned,
        control.signalAfterMarker,
        interruption,
        harnessTimeoutMs,
      );
      requireActive(interruption);
      signalDriverOwnedAnchor(owned);
    }
    const outcome = await waitForOwnedOutcome(owned, harnessTimeoutMs);
    const stdout = readCapture(owned.stdoutPath);
    const stderr = readCapture(owned.stderrPath);
    if (control.descendantCase !== undefined) {
      const readiness = inspectDescendantReadiness(stdout, control.descendantCase);
      const observation =
        readiness.kind === 'ready' ? lookupProcess(readiness.pid).kind : 'unknown';
      const absence = verifyDescendantAbsence(readiness, observation);
      if (absence.kind === 'failed') {
        throw new LifecycleFailure(70, absence.diagnostics.join('; '));
      }
    }
    const evidence = parseHarnessEvidence(`${stdout}\n${stderr}`);
    const after = captureHarnessInventory(tools);
    completed = {
      outcome,
      evidence,
      stdout,
      stderr,
      durationMs: Math.round(performance.now() - startedAt),
    };
    emitHarnessObservation(completed, control);
    const verification = verifyHarnessAbsence(
      evidence,
      before,
      after,
      absenceObservations(evidence, after, tools),
    );
    if (verification.kind === 'failed') {
      const allowed = new Set(control.allowedAbsenceDiagnostics ?? []);
      const unexpected = verification.diagnostics.filter((diagnostic) => !allowed.has(diagnostic));
      const missing = [...allowed].filter(
        (diagnostic) => !verification.diagnostics.includes(diagnostic),
      );
      if (unexpected.length > 0 || missing.length > 0) {
        throw new LifecycleFailure(70, [...unexpected, ...missing].join('; '));
      }
    }
  } catch (error: unknown) {
    operationFailure = error;
  } finally {
    if (owned === undefined) {
      try {
        const removal = removeOwnedRoot(root);
        if (removal.kind === 'failed') {
          cleanupFailure = new LifecycleFailure(
            70,
            `harness driver root removal failed:${removal.reason}`,
          );
        }
      } catch (error: unknown) {
        cleanupFailure = error;
      }
    } else {
      try {
        const cleanup = await finalizeOwnedRun(owned, cleanupTimeoutMs);
        finalized = cleanup.kind === 'clean';
        if (cleanup.kind === 'failed') {
          cleanupFailure = new LifecycleFailure(70, cleanup.diagnostics.join('; '));
        }
      } catch (error: unknown) {
        cleanupFailure = error;
      }
    }
  }

  const failures = [operationFailure, cleanupFailure].filter(
    (failure): failure is NonNullable<typeof failure> => failure !== undefined,
  );
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'harness operation and driver cleanup failed');
  }
  if (!finalized || completed === undefined) {
    throw new LifecycleFailure(70, 'harness case produced no finalized result');
  }
  return completed;
}

async function runFreshHarnessCase(
  interruption: AbortSignal,
  tools: ToolPaths,
  childSource: string,
  control: HarnessCaseControl = {},
): Promise<CompletedHarnessCase> {
  try {
    const root = createOwnedRoot();
    return await runHarnessCase(
      root,
      interruption,
      tools,
      childSource,
      control,
    );
  } catch (error: unknown) {
    throw error;
  }
}

type IndividualHarnessScenario = Exclude<HarnessScenario, 'all-harness'>;

async function runIndividualHarnessScenario(
  scenario: IndividualHarnessScenario,
  root: OwnedRoot,
  interruption: AbortSignal,
  tools: ToolPaths,
): Promise<number> {
  if (scenario === 'harness-success') {
    const completed = await runHarnessCase(
      root,
      interruption,
      tools,
      healthyChildSource(successfulChildMarker, 0),
      { label: 'success' },
    );
    requireExpectedBehavior(completed, 0, successfulChildMarker);
    process.stdout.write('harness-result scenario=harness-success verified=1 status=0\n');
    return resolveExitStatus(completed.outcome, { kind: 'clean' });
  }
  if (scenario === 'harness-status') {
    const assertionCase = await runHarnessCase(
      root,
      interruption,
      tools,
      healthyChildSource(statusChildMarker, 23),
      { label: 'status-assertion' },
    );
    requireExpectedBehavior(assertionCase, 23, statusChildMarker);
    const controlledCase = await runFreshHarnessCase(
      interruption,
      tools,
      healthyChildSource(statusChildMarker, 23),
      { label: 'status-control' },
    );
    requireExpectedBehavior(controlledCase, 23, statusChildMarker);
    process.stdout.write(
      'harness-result scenario=harness-status verified=1 child_status=23 assertion_status=0\n',
    );
    return 0;
  }
  if (scenario === 'harness-term') {
    const completed = await runHarnessCase(
      root,
      interruption,
      tools,
      healthyChildSource(termChildMarker),
      { label: 'external-term', signalAfterMarker: termChildMarker },
    );
    requireExpectedBehavior(completed, 143, termChildMarker);
    process.stdout.write('harness-result scenario=harness-term verified=1 status=143\n');
    return resolveExitStatus(completed.outcome, { kind: 'clean' });
  }
  if (scenario === 'harness-descendant') {
    const leaderExitCase = await runHarnessCase(
      root,
      interruption,
      tools,
      ignoredDescendantChildSource(
        leaderExitDescendantMarker,
        'leader-exit',
        false,
      ),
      {
        descendantCase: 'leader-exit',
        label: 'descendant-leader-exit',
        killRequired: true,
      },
    );
    requireExpectedBehavior(leaderExitCase, 0, leaderExitDescendantMarker);
    requireIgnoredDescendantCleanup(leaderExitCase);
    const externalTermCase = await runFreshHarnessCase(
      interruption,
      tools,
      ignoredDescendantChildSource(
        termDescendantMarker,
        'external-term',
        true,
      ),
      {
        descendantCase: 'external-term',
        label: 'descendant-external-term',
        killRequired: true,
        signalAfterDescendantReadiness: true,
      },
    );
    requireExpectedBehavior(externalTermCase, 143, termDescendantMarker);
    requireIgnoredDescendantCleanup(externalTermCase);
    process.stdout.write(
      'harness-result scenario=harness-descendant verified=1 leader_status=0 term_status=143 assertion_status=0\n',
    );
    return 0;
  }
  if (scenario === 'harness-proof-failure') {
    const dockerCase = await runHarnessCase(
      root,
      interruption,
      tools,
      healthyChildSource(dockerProofChildMarker, 0),
      {
        label: 'proof-docker-query',
        prepareRoot: (ownedRoot) => {
          createFakeQueryTool(ownedRoot, 'docker', tools.docker);
          return fakeToolEnvironment(ownedRoot);
        },
      },
    );
    requireProofFailure(dockerCase, 'docker');
    const ssCase = await runFreshHarnessCase(
      interruption,
      tools,
      healthyChildSource(dockerProofChildMarker, 0),
      {
        label: 'proof-ss-query',
        prepareRoot: (ownedRoot) => {
          createFakeQueryTool(ownedRoot, 'ss', tools.ss);
          return fakeToolEnvironment(ownedRoot);
        },
        allowedAbsenceDiagnostics: ['harness resource line is missing'],
      },
    );
    requireProofFailure(ssCase, 'ss');
    process.stdout.write(
      'harness-result scenario=harness-proof-failure assertion_passed=1 docker_status=1 ss_status=1\n',
    );
    return 0;
  }
  const unreachable: never = scenario;
  throw new LifecycleFailure(64, `unknown harness scenario:${String(unreachable)}`);
}

async function runFreshIndividualHarnessScenario(
  scenario: IndividualHarnessScenario,
  interruption: AbortSignal,
  tools: ToolPaths,
): Promise<number> {
  try {
    const root = createOwnedRoot();
    return await runIndividualHarnessScenario(scenario, root, interruption, tools);
  } catch (error: unknown) {
    throw error;
  }
}

function requireAggregateStatus(
  scenario: IndividualHarnessScenario,
  observed: number,
  expected: number,
): void {
  if (observed !== expected) {
    throw new LifecycleFailure(
      70,
      `all-harness scenario ${scenario} returned ${observed}; expected ${expected}`,
    );
  }
  process.stdout.write(
    `[all-harness] scenario=${scenario} observed_status=${observed} expected_status=${expected} assertion_passed=1\n`,
  );
}

export async function runHarnessScenario(
  scenario: HarnessScenario,
  root: OwnedRoot,
  interruption: AbortSignal,
): Promise<number> {
  const tools = captureToolPaths();
  if (scenario !== 'all-harness') {
    return runIndividualHarnessScenario(scenario, root, interruption, tools);
  }

  const successStatus = await runIndividualHarnessScenario(
    'harness-success',
    root,
    interruption,
    tools,
  );
  requireAggregateStatus('harness-success', successStatus, 0);

  const remaining = [
    ['harness-status', 0],
    ['harness-term', 143],
    ['harness-descendant', 0],
    ['harness-proof-failure', 0],
  ] as const;
  for (const [individualScenario, expectedStatus] of remaining) {
    const observedStatus = await runFreshIndividualHarnessScenario(
      individualScenario,
      interruption,
      tools,
    );
    requireAggregateStatus(individualScenario, observedStatus, expectedStatus);
  }

  process.stdout.write(
    'harness-result scenario=all-harness assertion_passed=1 status=0 cases=5 invocations=8\n',
  );
  return 0;
}
