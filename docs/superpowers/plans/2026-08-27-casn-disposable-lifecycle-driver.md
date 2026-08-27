# CASN Disposable Lifecycle Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rejected Bash lifecycle-regression subsystem with a small, strict Node/TypeScript driver that tests the unchanged disposable application harness without creating new cleanup authority or technical debt.

**Architecture:** A parent-owned Node launcher captures a detached child identity before releasing an IPC gate. Strict TypeScript modules separate `/proc` lookup, anchored temporary-root evidence, process ownership/finalization, and black-box harness assertions; a thin Bash file preserves the existing command boundary. Fast deterministic and real-process tests carry race and corruption coverage, while Docker/build scenarios run once on the final exact tree.

**Tech Stack:** Node 22, TypeScript 5.6, `tsx` 4.20, Jest 30, Bash, Linux `/proc`, Docker, MySQL 8.4.

**Spec:** `docs/superpowers/specs/2026-08-27-casn-disposable-lifecycle-driver-design.md`

## Global Constraints

- Work only in the existing isolated branch/worktree; never stash or alter another dirty worktree.
- Use forward commits. Do not reset, amend, squash, or remove rejected commits `5795b48` and `204535a` from history.
- Keep `scripts/ci/with-disposable-app.sh` byte-identical to commit `87e518d`; verify SHA-256 `10253ea47aa9d3b0f93d6de1482c13207a1eaef3a3c85e5e0e8eea1516aa71b4`.
- Do not change application/runtime, API, database, migration, deployment, rollback, Directus, public HTTP, or production behavior.
- Never use port 3000, mutate `casn-directus`, contact a remote/production database, push, create a PR, publish, merge, or deploy.
- Never signal or delete from logs, argv, cwd, process names, environment scans, Docker enumeration, or stale evidence.
- A process signal requires a parent-captured identity and a fresh PID/start-time/PPID/PGID/SID match immediately before the signal.
- `/proc` results are exactly `present`, `absent`, or `unknown`; `unknown` never establishes authority, readiness, cleanup, or absence.
- The unopened gate has its own hard self-expiry; if identity lookup is unknown, the parent sends no signal and requires self-expiry or reports a retained cleanup failure.
- Every wait has a local deadline and liveness condition. Cleanup failure overrides a would-be pass.
- Driver temporary deletion requires the original non-symlink directory's device, inode, owner, and mode; replacement fails closed.
- The unchanged shell harness remains sole owner of its MySQL container, application process, internal supervisor, and `casn-quality.*` root.
- Do not add npm dependencies, `any`, TypeScript suppressions, inline ESLint directives, skipped suites, broad ESLint overrides, CommonJS `require()`, or warning downgrades.
- Preserve PID `2329714` and every pre-existing Docker resource untouched.
- Tests prove behavior; source grep is permitted only as a final policy/inventory gate, never as the primary behavioral test.
- Every test fixture has a separate owner and a `try/finally` teardown which runs on RED, assertion failure, timeout, and signal; system-under-test failure never suppresses fixture cleanup.

---

## File map

| File | Responsibility |
| --- | --- |
| `scripts/ci/disposable-lifecycle/types.ts` | Shared discriminated unions and immutable value types only. |
| `scripts/ci/disposable-lifecycle/proc.ts` | Linux stat parsing and tri-state process/group lookup. |
| `scripts/ci/disposable-lifecycle/owned-root.ts` | Anchored driver root and atomic diagnostic evidence. |
| `scripts/ci/disposable-lifecycle/gate-child.ts` | IPC-gated detached anchor which cannot launch before parent release. |
| `scripts/ci/disposable-lifecycle/owned-process.ts` | Parent capture, release, signal authority, and child outcome. |
| `scripts/ci/disposable-lifecycle/finalize.ts` | Bounded cleanup, stabilization, and exit-status precedence. |
| `scripts/ci/disposable-lifecycle/harness-evidence.ts` | Non-destructive parsing and post-run absence assertions. |
| `scripts/ci/disposable-lifecycle/harness-scenarios.ts` | Expensive unchanged-harness scenarios. |
| `scripts/ci/disposable-lifecycle/cli.ts` | Scenario selection and reporting only. |
| `scripts/ci/with-disposable-app-regression-test.sh` | Thin local/CI entrypoint only. |
| `test/unit/ci/disposable-lifecycle/*.test.ts` | Deterministic parser/root/status/evidence contracts. |
| `test/integration/ci/disposable-lifecycle.test.ts` | Real Docker-free process lifecycle contracts. |
| `tsconfig.disposable-lifecycle.json` | Strict no-emit driver/test type boundary. |

### Task 1: Strict tri-state `/proc` adapter

**Files:**
- Create: `scripts/ci/disposable-lifecycle/types.ts`
- Create: `scripts/ci/disposable-lifecycle/proc.ts`
- Create: `test/unit/ci/disposable-lifecycle/proc.test.ts`
- Create: `tsconfig.disposable-lifecycle.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `ProcessIdentity`, `ProcessState`, `ProcessLookup`, `GroupLookup`, `ProcAccess`, `parseStatLine`, `lookupProcess`, and `lookupGroup`.
- Consumes: no earlier task interface.

- [ ] **Step 1: Add strict configuration and failing literal parser contracts**

Create `tsconfig.disposable-lifecycle.json` with this exact boundary:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "types": ["node", "jest"]
  },
  "include": [
    "scripts/ci/disposable-lifecycle/**/*.ts",
    "test/unit/ci/disposable-lifecycle/**/*.ts",
    "test/integration/ci/disposable-lifecycle.test.ts"
  ]
}
```

Add `disposable-lifecycle:type-check` as:

```json
"disposable-lifecycle:type-check": "tsc -p tsconfig.disposable-lifecycle.json"
```

Write tests with a hand-authored stat record whose command contains spaces and
parentheses:

```ts
/** @jest-environment node */
import { parseStatLine } from '@/scripts/ci/disposable-lifecycle/proc';

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

test.each(['', '7100 bad', '7100 (x) invalid 1 2 3']) (
  'treats malformed present stat as unknown: %j',
  (line) => expect(parseStatLine(7100, line)).toEqual({
    kind: 'unknown',
    reason: 'malformed-stat',
  }),
);
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx jest --runInBand --runTestsByPath test/unit/ci/disposable-lifecycle/proc.test.ts
npm run disposable-lifecycle:type-check
```

Expected: both fail because `proc.ts`, exported types, and the strict project do not yet exist.

- [ ] **Step 3: Define the exact types and minimal parser**

Use these public types in `types.ts`:

```ts
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
```

`parseStatLine` must locate `lastIndexOf(') ')`, validate PID prefix, state, and
at least twenty post-comm fields, and parse every identity integer without
coercing invalid text.

- [ ] **Step 4: Add RED lookup tests for absent versus unknown**

Define an injected synchronous port in the test:

```ts
const access = {
  readStat: jest.fn<(pid: number) => string>(),
  inspectPidEntry: jest.fn<(pid: number) => 'present' | 'absent' | 'unknown'>(),
  listPids: jest.fn<() => readonly number[]>(),
};
```

Assert these literal cases:

```ts
access.readStat.mockImplementation(() => { throw new Error('EACCES'); });
access.inspectPidEntry.mockReturnValue('present');
expect(lookupProcess(42, access)).toEqual({ kind: 'unknown', reason: 'stat-read-failed' });

access.inspectPidEntry.mockReturnValue('absent');
expect(lookupProcess(42, access)).toEqual({ kind: 'absent' });

access.inspectPidEntry.mockReturnValue('unknown');
expect(lookupProcess(42, access)).toEqual({ kind: 'unknown', reason: 'pid-entry-unknown' });
```

Also require `lookupGroup(processGroupId, sessionId, access, excludedPids)` to
return `unknown` if any still-present numeric PID
has unreadable or malformed stat, even when no parsed member matches the target
PGID/SID. An explicitly excluded, freshly verified anchor PID is omitted from
the returned membership but not from parse-error detection.

- [ ] **Step 5: Run the new tests to verify the lookup RED**

Run the focused Jest command. Expected: parser cases pass and lookup cases fail because the port and tri-state lookup are missing.

- [ ] **Step 6: Implement `ProcAccess`, lookup, and group scan**

Use this interface:

```ts
export interface ProcAccess {
  readStat(pid: number): string;
  inspectPidEntry(pid: number): 'present' | 'absent' | 'unknown';
  listPids(): readonly number[];
}
```

The filesystem implementation reads `/proc/<pid>/stat`. After a read failure,
inspect the `/proc/<pid>` directory itself twice; only two confirmed `ENOENT`
observations return `absent`. `EACCES`, `EIO`, an unreadable directory, a
present PID directory with missing `stat`, or disagreement between observations
returns `unknown`. `lookupGroup` visits the numeric PID list, propagates any
unknown observation, and returns identities only for the exact PGID/SID
literals.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```bash
npx jest --runInBand --runTestsByPath test/unit/ci/disposable-lifecycle/proc.test.ts
npm run disposable-lifecycle:type-check
npx eslint scripts/ci/disposable-lifecycle/types.ts scripts/ci/disposable-lifecycle/proc.ts test/unit/ci/disposable-lifecycle/proc.test.ts --max-warnings 0
git diff --check
```

Commit:

```bash
git add package.json tsconfig.disposable-lifecycle.json scripts/ci/disposable-lifecycle/types.ts scripts/ci/disposable-lifecycle/proc.ts test/unit/ci/disposable-lifecycle/proc.test.ts
git commit -m "test(lifecycle): add strict proc identity adapter"
```

### Task 2: Anchored driver root and diagnostic evidence

**Files:**
- Create: `scripts/ci/disposable-lifecycle/owned-root.ts`
- Create: `test/unit/ci/disposable-lifecycle/owned-root.test.ts`

**Interfaces:**
- Consumes: no process authority; Node filesystem primitives only.
- Produces: `OwnedRoot`, `createOwnedRoot`, `publishEvidence`, `verifyOwnedRoot`, and `removeOwnedRoot`.

- [ ] **Step 1: Write RED ownership tests**

Use a real driver root plus a separately created test-owned victim directory.
Capture a victim sentinel outside the owned root. Assert:

```ts
const root = createOwnedRoot();
expect(root.path).toMatch(/^\/tmp\/casn-quality-regression-/);
expect(verifyOwnedRoot(root)).toEqual({ kind: 'valid' });

renameSync(root.path, `${root.path}.moved`);
symlinkSync(`${root.path}.moved`, root.path, 'dir');
expect(removeOwnedRoot(root)).toEqual({ kind: 'failed', reason: 'root-replaced' });
expect(readFileSync(`${root.path}.moved/sentinel`, 'utf8')).toBe('keep');
```

Add separate tests for device/inode mismatch, dangling symlink, permission
failure, evidence destination collision, duplicate publication, and a stale
evidence document that is reported but never acted upon.

- [ ] **Step 2: Run RED**

Run the focused Jest file. Expected: FAIL because `owned-root.ts` is absent.

- [ ] **Step 3: Implement anchored root creation**

Use this immutable record:

```ts
export type OwnedRoot = Readonly<{
  path: string;
  basename: string;
  fd: number;
  parentFd: number;
  parentDevice: bigint;
  parentInode: bigint;
  device: bigint;
  inode: bigint;
  uid: bigint;
  mode: bigint;
}>;
```

Create with `mkdtempSync('/tmp/casn-quality-regression-')`, open the directory,
and capture `fstatSync(fd, { bigint: true })`. Before traversal/removal, compare
`lstatSync(path, { bigint: true })`, reject symlinks, and require exact device,
inode, uid, and permission mode.
Maintain an explicit set of driver-created child names and their captured
device/inode/type identity. Reverify and unlink each exact known file through
`/proc/self/fd/<root.fd>/<validated-basename>`; never perform recursive removal
by `root.path`. Reject replacements and unknown directory entries. Once empty,
atomically rename `root.path` to a fresh random tombstone beneath the separately
opened and identity-checked `/tmp` parent, re-check the tombstone against the
still-open root descriptor, and only then issue a non-recursive `rmdir` for that
empty tombstone. If the renamed inode is not the owned inode, restore it when
possible and fail without deleting it. Close descriptors only after verified
removal or after returning a typed failure which leaves diagnostics. Tests race
path replacement at every injected boundary and require that no replacement or
victim content is deleted.

- [ ] **Step 4: Implement no-clobber evidence publication**

Evidence has this schema:

```ts
export type EvidenceProcessIdentity = Readonly<{
  pid: number;
  startTime: string;
  parentPid: number;
  processGroupId: number;
  sessionId: number;
}>;

export type LifecycleEvidence = Readonly<{
  schemaVersion: 1;
  invocationId: string;
  outcome: 'pass' | 'fail';
  ownedProcesses: readonly EvidenceProcessIdentity[];
  diagnostics: readonly string[];
}>;
```

Convert `ProcessIdentity.startTime` with `.toString(10)` before JSON encoding;
no raw `bigint` reaches `JSON.stringify`.

Write JSON to a mode-0600 `wx` temporary file, `fsyncSync`, publish with
`linkSync(temp, final)`, and unlink the temporary file, using validated names
beneath `/proc/self/fd/<root.fd>/` for every operation. Register each created
file's identity before publication/removal. Any existing file, symlink,
malformed target, identity change, or link failure returns a typed failure. No
function reads evidence into cleanup authority.

- [ ] **Step 5: Verify GREEN and commit**

Run focused Jest, strict typecheck, focused ESLint, and `git diff --check`.

Commit:

```bash
git add scripts/ci/disposable-lifecycle/owned-root.ts test/unit/ci/disposable-lifecycle/owned-root.test.ts
git commit -m "test(lifecycle): anchor diagnostic root ownership"
```

### Task 3: Parent-owned IPC gate and stable process anchor

**Files:**
- Create: `scripts/ci/disposable-lifecycle/gate-child.ts`
- Create: `scripts/ci/disposable-lifecycle/owned-process.ts`
- Create: `test/integration/ci/disposable-lifecycle.test.ts`

**Interfaces:**
- Consumes: `ProcessIdentity`, `ProcessLookup`, `lookupProcess`, and `OwnedRoot`
  for bounded stdout/stderr files beneath the anchored root.
- Produces: `OwnedProcess`, `spawnGatedProcess`, `releaseGatedProcess`,
  `waitForOwnedOutcome`, and `finishGatedProcess`.

- [ ] **Step 1: Write a RED real-process gate test**

Create a Node-environment integration test which requests a command that writes
a marker. Implement a test-only `withOwnedFixture` helper first; it records the
root and direct child handle outside the system-under-test registry and always
revalidates/cleans them in `finally`. Before release, wait 250 ms and require the
marker to be absent. Then release and require literal content inside that
fixture boundary:

```ts
const root = createOwnedRoot();
const owned = await spawnGatedProcess({
  root,
  command: process.execPath,
  args: [
    '--input-type=module',
    '-e',
    "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MARKER, 'released')",
  ],
  env: { MARKER: marker },
});
expect(existsSync(marker)).toBe(false);
await new Promise((resolve) => setTimeout(resolve, 250));
expect(existsSync(marker)).toBe(false);
await releaseGatedProcess(owned);
expect(await waitForOwnedOutcome(owned, 5_000)).toEqual({ kind: 'exit', code: 0 });
expect(readFileSync(marker, 'utf8')).toBe('released');
await finishGatedProcess(owned, 5_000);
expect(removeOwnedRoot(root)).toEqual({ kind: 'removed' });
```

- [ ] **Step 2: Run RED**

Run the integration file. Expected: FAIL because the gated process API is absent.

- [ ] **Step 3: Implement the IPC message contract and parent capture**

Add these exact shared types to `types.ts`:

```ts
export type ChildOutcome =
  | Readonly<{ kind: 'exit'; code: number }>
  | Readonly<{ kind: 'signal'; signal: NodeJS.Signals }>
  | Readonly<{ kind: 'spawn-error'; message: string }>
  | Readonly<{ kind: 'timeout'; phase: string }>;
```

Use these exact process and message types in `owned-process.ts`:

```ts
import type { ChildProcess } from 'node:child_process';

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
```

`spawnGatedProcess` receives an `OwnedRoot`; stdout and stderr each have a hard
1 MiB capture limit in mode-0600 files beneath that root. After the limit, the
stream is drained to a discard sink to avoid child deadlock, an overflow
diagnostic is recorded, and finalization returns failure. The `OwnedProcess`
implementation may keep private message/outcome
promises, but they may grant authority only through the public captured
`anchor`. Await both log streams' `close` events before publishing final
evidence or removing the root. Spawn the gate child with:

```ts
spawn(process.execPath, ['--import', import.meta.resolve('tsx'), gateChildPath], {
  cwd: repositoryRoot,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
```

Before sending `release`, require: child handle not exited, lookup `present`,
PPID equals `process.pid`, and PID equals PGID and SID. Capture that identity in
`OwnedProcess`. A missing or unknown lookup closes the gate and returns failure.

- [ ] **Step 4: Add RED pre-registration failure and PID-reuse tests**

Inject a gate-child stall before `waiting`. Require the parent to retain exact
authority only after a successful first full lookup of the returned PID and
clean it within a local deadline. Mutate the
lookup to return the same PID with a different start time and require cleanup to
fail without sending a signal. Add an unknown-lookup case: the parent sends no
signal, the unopened gate reaches its own hard deadline, no target marker is
created, and the parent reaps the child. Add a test-only gate hang beyond that
self-expiry and require a visible retained cleanup failure rather than an
unauthorized signal; only afterward may the separate fixture owner revalidate
and remove its exact test child.

- [ ] **Step 5: Implement bounded pre-release cleanup and outcome handling**

Before release, the gate child starts a hard referenced timer which exits without
launching a target; release cancels that timer. It then installs TERM/INT/HUP
handlers which keep the anchor alive while the target uses default dispositions.
It reports the target outcome and waits for `finish`; every parent wait has an
explicit millisecond deadline and child liveness check. `finishGatedProcess` is
permitted only after target outcome and group-absence proof excluding the
anchor; it sends `finish`, reaps the exact anchor, and proves the captured PID
absent. The escalation path does not call `finish` because whole-group KILL
intentionally includes the anchor.

- [ ] **Step 6: Verify GREEN and commit**

Run the integration file three times, strict typecheck, focused ESLint, and
`git diff --check`.

Commit:

```bash
git add scripts/ci/disposable-lifecycle/types.ts scripts/ci/disposable-lifecycle/gate-child.ts scripts/ci/disposable-lifecycle/owned-process.ts test/integration/ci/disposable-lifecycle.test.ts
git commit -m "test(lifecycle): gate parent-owned process launches"
```

### Task 4: Bounded finalization and status precedence

**Files:**
- Create: `scripts/ci/disposable-lifecycle/finalize.ts`
- Create: `test/unit/ci/disposable-lifecycle/finalize.test.ts`
- Modify: `test/integration/ci/disposable-lifecycle.test.ts`

**Interfaces:**
- Consumes: `OwnedProcess`, `lookupProcess`, `lookupGroup`, `OwnedRoot`.
- Produces: `finalizeOwnedRun`, `resolveExitStatus`, `CleanupResult`.

Use these exact result types:

```ts
export type CleanupResult =
  | Readonly<{ kind: 'clean' }>
  | Readonly<{ kind: 'failed'; code: 70; diagnostics: readonly string[] }>;
```

- [ ] **Step 1: Write RED status-table tests**

Use a literal table independent of implementation:

```ts
test.each([
  [{ kind: 'exit', code: 0 }, { kind: 'clean' }, 0],
  [{ kind: 'exit', code: 23 }, { kind: 'clean' }, 23],
  [{ kind: 'signal', signal: 'SIGTERM' }, { kind: 'clean' }, 143],
  [{ kind: 'spawn-error', message: 'fixture' }, { kind: 'clean' }, 71],
  [{ kind: 'timeout', phase: 'outcome' }, { kind: 'clean' }, 124],
  [{ kind: 'exit', code: 0 }, { kind: 'failed', code: 70, diagnostics: ['cleanup'] }, 70],
  [{ kind: 'exit', code: 23 }, { kind: 'failed', code: 70, diagnostics: ['cleanup'] }, 70],
])('resolves child and cleanup outcomes', (child, cleanup, expected) => {
  expect(resolveExitStatus(child, cleanup)).toBe(expected);
});
```

- [ ] **Step 2: Run RED, then implement the pure status function**

Expected RED: missing `finalize.ts`. Implement only the table behavior and rerun
until GREEN.

Map a signal to `128 + os.constants.signals[signal]`; an unknown signal name is
a typed status failure rather than a guessed code. `spawn-error` maps to 71 and
driver timeout maps to 124. Cleanup failure remains 70 and overrides every
child outcome.

- [ ] **Step 3: Add RED real-process cleanup scenarios**

Extend the integration file with:

- cooperative TERM;
- ignored TERM requiring bounded KILL;
- stopped target;
- target leader exit with a surviving same-group descendant;
- lookup `unknown` before signal;
- registered survivor during stabilization;
- unregistered fixture process which remains alive until its separate owner
  cleans it.

Each case has a hard 15-second test deadline and asserts exact identities are
absent for five consecutive 100-ms observations.

- [ ] **Step 4: Implement finalization**

`finalizeOwnedRun` must:

1. re-read and exactly match the detached anchor;
2. send group TERM only while that anchor is present and unchanged;
3. poll group state with a local deadline;
4. revalidate the anchor before optional group KILL;
5. reject every `unknown` lookup;
6. on cooperative cleanup, prove only the anchor remains, send `finish`, and
   reap it with a deadline;
7. on escalation, KILL the whole group after the final identity check, send no
   later signal, reap the anchor handle, and prove the complete group absent;
8. remove only the verified `OwnedRoot`;
9. repeat stabilization five times;
10. return cleanup failure over any would-be pass.

- [ ] **Step 5: Verify GREEN and commit**

Run the unit file and the integration file five times, then typecheck, lint, and
`git diff --check`.

Commit:

```bash
git add scripts/ci/disposable-lifecycle/finalize.ts test/unit/ci/disposable-lifecycle/finalize.test.ts test/integration/ci/disposable-lifecycle.test.ts
git commit -m "test(lifecycle): finalize owned groups fail closed"
```

### Task 5: Typed CLI and thin shell entrypoint

**Files:**
- Create: `scripts/ci/disposable-lifecycle/cli.ts`
- Create: `test/unit/ci/disposable-lifecycle/cli.test.ts`
- Modify: `scripts/ci/with-disposable-app-regression-test.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–4 modules.
- Produces: CLI scenarios `proc`, `root`, `process`, `cleanup`, and `all-fast`; preserves `bash scripts/ci/with-disposable-app-regression-test.sh <scenario>`.

`cli.ts` exposes an injected boundary without a catch-all bag of callbacks:

```ts
export type CliDependencies = Readonly<{
  createRoot: typeof createOwnedRoot;
  runFastScenario: (
    scenario: 'proc' | 'root' | 'process' | 'cleanup' | 'all-fast',
    root: OwnedRoot,
  ) => Promise<number>;
}>;

export function runCli(
  args: readonly string[],
  dependencies: CliDependencies,
): Promise<number>;
```

- [ ] **Step 1: Write RED CLI behavior tests**

Invoke the future CLI through the repository-local `tsx` executable. Require:

```ts
expect(run(['proc']).status).toBe(0);
expect(run(['all-fast']).status).toBe(0);
expect(run(['unknown-case'])).toMatchObject({
  status: 64,
  stderr: expect.stringContaining('unknown disposable lifecycle scenario: unknown-case'),
});
```

Also call an exported `runCli(args, dependencies)` with a root factory that
throws `new LifecycleFailure(97, 'injected initialization failure')` and assert
status 97 with no root created. Spawn the real CLI with
`CASN_LIFECYCLE_TEST_INIT_DELAY_MS=500`, send SIGTERM after its `bootstrap-ready`
message, and require status 143 with no `casn-quality-regression-*` root. This
test-only delay is accepted only when `NODE_ENV=test`; production CLI execution
rejects the variable.

Wrap every spawned CLI/root in a test-owner `try/finally`. The fixture owner
captures the direct child identity before the mutation, enforces its own outer
deadline, and revalidates exact identity before cleanup even when an assertion
fails.

The test executes behavior; it does not inspect source text.

- [ ] **Step 2: Run RED**

Expected: missing `cli.ts` and current shell runner does not implement the typed scenario contract.

- [ ] **Step 3: Implement the CLI and replace the shell body**

The complete shell responsibility is:

```bash
#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly tsx_bin="$repository_root/node_modules/.bin/tsx"
[[ -x "$tsx_bin" ]] || {
  printf 'repository-local tsx is unavailable; run npm ci\n' >&2
  exit 69
}
cd "$repository_root"
exec "$tsx_bin" "$repository_root/scripts/ci/disposable-lifecycle/cli.ts" "$@"
```

Add scripts:

```json
"disposable-lifecycle:test:unit": "jest --runInBand test/unit/ci/disposable-lifecycle",
"disposable-lifecycle:test:process": "jest --runInBand --runTestsByPath test/integration/ci/disposable-lifecycle.test.ts",
"disposable-lifecycle:test:fast": "npm run disposable-lifecycle:type-check && npm run disposable-lifecycle:test:unit && npm run disposable-lifecycle:test:process && bash scripts/ci/with-disposable-app-regression-test.sh all-fast"
```

- [ ] **Step 4: Verify GREEN and commit**

Run fast tests, `bash -n`, ShellCheck warning threshold, strict lint, and diff
checks.

Commit:

```bash
git add package.json scripts/ci/disposable-lifecycle/cli.ts scripts/ci/with-disposable-app-regression-test.sh test/unit/ci/disposable-lifecycle/cli.test.ts
git commit -m "test(lifecycle): expose typed regression CLI"
```

### Task 6: Non-destructive black-box harness scenarios

**Files:**
- Create: `scripts/ci/disposable-lifecycle/harness-evidence.ts`
- Create: `scripts/ci/disposable-lifecycle/harness-scenarios.ts`
- Create: `test/unit/ci/disposable-lifecycle/harness-evidence.test.ts`
- Modify: `scripts/ci/disposable-lifecycle/cli.ts`

**Interfaces:**
- Consumes: gated process/finalization and unchanged `scripts/ci/with-disposable-app.sh`.
- Produces: CLI scenarios `harness-success`, `harness-status`, `harness-term`, `harness-descendant`, `harness-proof-failure`, and `all-harness`.

- [ ] **Step 1: Write RED forged-log and inventory tests**

Create a synthetic victim outside `OwnedRoot` and feed this anchored-looking
line to the evidence parser:

```text
[disposable-app] resources container=casn-quality-999-aaaaaaaaaaaa-mysql temp_dir=/tmp/casn-quality.FORGED
```

Assert parsing returns a diagnostic record, then call every exported evidence
function and require the victim sentinel and fake Docker call count to remain
unchanged. Add before/after inventory fixtures proving only newly introduced
names/listeners are reported and none are removed.

- [ ] **Step 2: Run RED**

Expected: missing evidence module and black-box scenarios.

- [ ] **Step 3: Implement evidence-only parsing**

Use:

```ts
export type HarnessResources = Readonly<{
  container: string;
  tempRoot: string;
  appPid?: number;
  mysqlPort?: number;
  appPort: 31337;
}>;
```

The parser validates the existing anchored line and returns values only for
post-run Docker/socket/path/process absence queries and diagnostics. The module
exports no delete or signal function and never calls Docker mutation commands.

- [ ] **Step 4: Add RED black-box scenarios one at a time**

For each scenario, first add the CLI case and run it against the current missing
implementation to record RED:

1. child checks `DATABASE_URL`, equal live URLs, and `/api/health`, then exits 0;
2. healthy child exits 23, the scenario verifies that literal child outcome and
   returns 0 as a passed assertion; a separate controlled invocation verifies
   the unchanged harness itself returns 23;
3. external TERM returns 143 with bounded cleanup;
4. leader exits while an ignored-signal descendant remains, and harness cleanup
   removes it;
5. external TERM with ignored descendant;
6. fake Docker absence query and fake `ss` absence query each force nonzero and
   may not claim `verified=1`.

Fake binaries live only under `OwnedRoot`, forward all non-targeted calls to
absolute `command -v docker`/`command -v ss` values captured before PATH change,
and perform no removal themselves.

- [ ] **Step 5: Implement the minimal scenario matrix**

Run every harness case through `spawnGatedProcess`. Read readiness markers only
as behavior evidence. Signal only the driver-owned detached anchor after a fresh
identity match. After completion, require exact reported resources absent and
no new `casn-quality-*` Docker name, port-31337 listener, or invocation process.
If an internal harness resource remains, fail and retain diagnostics; do not
adopt or clean it.

- [ ] **Step 6: Verify each case and commit**

Run unit evidence tests, then each black-box CLI case once. Confirm the unchanged
harness reports final MySQL readiness and application-user `SELECT 1` before
build. Finish with strict typecheck/lint and diff checks.

Commit:

```bash
git add scripts/ci/disposable-lifecycle/harness-evidence.ts scripts/ci/disposable-lifecycle/harness-scenarios.ts scripts/ci/disposable-lifecycle/cli.ts test/unit/ci/disposable-lifecycle/harness-evidence.test.ts
git commit -m "test(lifecycle): verify disposable harness as a black box"
```

### Task 7: Remove rejected Bash architecture by forward commit

**Files:**
- Delete: `scripts/ci/disposable-process-registry.sh`
- Delete: `scripts/ci/disposable-registered-process-launcher.sh`
- Restore: `scripts/ci/disposable-process-identity.sh`
- Verify: `scripts/ci/with-disposable-app.sh`

**Interfaces:**
- Consumes: all new TypeScript tests and CLI scenarios.
- Produces: no rejected registry/launcher dependency; accepted shared shell helper and main harness blobs.

- [ ] **Step 1: Run all new behavior before removal**

Run `npm run disposable-lifecycle:test:fast`. Expected: GREEN while superseded
files still exist but are unused. Confirm with the exact reference scan from
Step 3; do not spend another Docker/build matrix on files with no consumers.

- [ ] **Step 2: Delete superseded helpers and restore the accepted identity helper**

Use `apply_patch` to delete the two files which are absent at `87e518d`. Restore
`disposable-process-identity.sh` exactly to its `87e518d` blob through a forward
edit; do not checkout/reset the branch.

- [ ] **Step 3: Prove removal did not change behavior**

Run the same fast command. Expected: GREEN. Then run:

```bash
git diff --exit-code 87e518d -- scripts/ci/disposable-process-identity.sh scripts/ci/with-disposable-app.sh
test "$(sha256sum scripts/ci/with-disposable-app.sh | cut -d' ' -f1)" = "10253ea47aa9d3b0f93d6de1482c13207a1eaef3a3c85e5e0e8eea1516aa71b4"
if rg -n 'disposable-process-registry|disposable-registered-process-launcher' scripts test package.json; then exit 1; fi
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ci/disposable-process-identity.sh scripts/ci/disposable-process-registry.sh scripts/ci/disposable-registered-process-launcher.sh
git commit -m "refactor(test): remove rejected shell lifecycle registry"
```

### Task 8: Full local acceptance and Task 6 handoff

**Files:**
- Modify only if required by actual wiring: `package.json`, `scripts/ci/quality-debt-policy.sh`, `.github/workflows/quality-checks/action.yml`
- No application/runtime source changes.

**Interfaces:**
- Consumes: completed driver and the original quality-debt plan.
- Produces: independently reviewable Task 6 evidence which unblocks Tasks 7–12.

- [ ] **Step 1: Refresh refs and prove branch containment**

```bash
git fetch origin --prune
git rev-list --left-right --count origin/main...HEAD
git status --short --branch
```

If `origin/main` advanced, finish the active Task 6 review first and request
fresh authorization naming the newly observed `origin/main` commit before any
local merge. Inspect conflicts and rerun every affected gate. Never push or
deploy.

- [ ] **Step 2: Clean install and static gates**

```bash
npm ci
npm run disposable-lifecycle:type-check
for round in 1 2 3 4 5; do npm run disposable-lifecycle:test:unit; done
for round in 1 2 3 4 5; do npm run disposable-lifecycle:test:process; done
bash scripts/ci/with-disposable-app-regression-test.sh all-fast
npm run type-check
npm run lint
npm run runtime:policy:test && npm run runtime:policy
npm run first-party-quality:policy:test
npm run quality:policy
```

Expected: all exit 0; only the documented ESLint 9.39.5 compatibility notice may remain.

- [ ] **Step 3: Run the expensive harness matrix once on the exact tree**

```bash
bash scripts/ci/with-disposable-app-regression-test.sh all-harness
npx jest --runInBand --runTestsByPath test/integration/pages/HydrationAndDataIntegration.test.tsx test/unit/components/SearchModal.test.tsx test/unit/components/searchUtils.test.ts test/unit/snapshot/verify-parity.test.ts
bash scripts/ci/with-disposable-app.sh bash -c 'RUN_LIVE_TESTS=1 npx jest --runInBand --runTestsByPath test/integration/pages/HydrationAndDataIntegration.live.test.tsx test/integration/db/seed.live.test.ts'
```

Expected: harness matrix GREEN; 4/4 suites and 56/56 non-live tests; 2/2 suites and 13/13 live tests; controlled statuses 0, 23, and 143 preserved by their scenarios.

- [ ] **Step 4: Run build and repository policies**

```bash
npm run build
npm run audit:policy
npm run check:posts
npm run check:cms-mdx-media
npm run compose:policy
npm run deploy:policy
bash scripts/ci/assert-no-deployment-db-mutation.sh
bash scripts/ci/remote-deploy-rollback-test.sh
git diff --check
```

- [ ] **Step 5: Prove exact cleanup and protected-resource preservation**

Before Step 2, save exact baselines for all Docker names/IDs, relevant socket
rows, matching temporary roots/processes, and full `/proc/2329714/stat` when
that PID is present. After Step 4, capture the same inventories again. Require
byte-for-byte equality for pre-existing Docker resources and PID identity,
absence of every resource introduced by the run, and no loss of a baseline
resource. A PID absent at baseline is recorded as absent and is not invented as
a protected identity. The final executable checks use sorted files beneath a
separate fixture-owned directory, for example:

```bash
docker_inventory="$(docker ps -a --format '{{.ID}} {{.Names}}')" || exit 1
socket_inventory="$(ss -H -ltn 'sport = :31337')" || exit 1
temp_inventory="$(find /tmp -maxdepth 1 -type d \( -name 'casn-quality.*' -o -name 'casn-quality-regression-*' \) -print)" || exit 1
all_process_inventory="$(ps -eo pid,ppid,pgid,sid,args)" || exit 1
process_inventory="$(rg '[d]isposable-lifecycle/(cli|gate-child)\.ts|[w]ith-disposable-app(-regression-test)?\.sh' <<<"$all_process_inventory" || true)"
diff -u "$acceptance_baseline/docker" <(sort <<<"$docker_inventory")
diff -u "$acceptance_baseline/sockets" <(sort <<<"$socket_inventory")
diff -u "$acceptance_baseline/temp-roots" <(sort <<<"$temp_inventory")
diff -u "$acceptance_baseline/processes" <(sort <<<"$process_inventory")
if [[ -f "$acceptance_baseline/pid-2329714.stat" ]]; then
  cmp "$acceptance_baseline/pid-2329714.stat" /proc/2329714/stat
fi
git diff --exit-code 87e518d -- scripts/ci/with-disposable-app.sh scripts/ci/disposable-process-identity.sh
git status --short --branch
```

The baseline capture uses the same fail-closed commands and stores sorted full
outputs before any test command. Docker/socket/process/path query failure is a
failed proof, not an empty result. The baseline directory has its own exact
fixture owner and is removed in `finally` only after comparison.

- [ ] **Step 6: Independent review and commit any final wiring only**

If Step 2 proves the existing policy/action already runs the exact commands,
leave those files unchanged. If wiring is genuinely missing, add it test-first,
rerun Steps 2–5, and commit only that wiring:

```bash
git add package.json scripts/ci/quality-debt-policy.sh .github/workflows/quality-checks/action.yml
git commit -m "ci(quality): gate disposable lifecycle driver"
```

Generate a review package from `4906d05` through final HEAD. A fresh reviewer
must report both specification and quality PASS before the ledger marks Task 6
complete and the original plan resumes at Task 7.

## Plan self-review

### Spec coverage

| Specification requirement | Plan task |
| --- | --- |
| strict typed modules and no new dependency | 1–6 |
| `present` / `absent` / `unknown` | 1 |
| anchored root and evidence without authority | 2 |
| parent-owned pre-release identity | 3 |
| bounded signal, reap, status, stabilization | 4 |
| thin local/CI command boundary | 5 |
| logs as evidence only and harness black box | 6 |
| forward removal and accepted shell restoration | 7 |
| fast repetitions separated from Docker/build | 8 |
| production/Directus/deployment boundaries | Global Constraints, 8 |
| final inventories and independent review | 8 |

### Cross-task interfaces

| Producer | Consumer | Consistency check |
| --- | --- | --- |
| Task 1 identity union | Tasks 3–4 | All callers exhaustively handle `unknown`. |
| Task 2 `OwnedRoot` | Tasks 4 and 6 | Only creator-captured root identity permits removal. |
| Task 3 `OwnedProcess` | Task 4 | Parent captures detached anchor before release. |
| Task 4 finalizer | Tasks 5–6 | Cleanup result overrides pass and preserves explicit nonzero status otherwise. |
| Task 5 CLI | Tasks 6–8 | Fast scenarios stay Docker-free; harness scenarios are separate. |
| Task 6 evidence | Task 8 | Parsed resources can prove absence but cannot authorize mutation. |
| Task 7 forward removal | Task 8 | Accepted helper/harness blobs are verified against `87e518d`. |

No task authorizes production, remote, push, PR, merge, or deployment actions.
CSRF/browser sessions, public HTTP transport, messaging/jobs/webhooks, CQRS,
ports-and-adapters, DDD, migrations, rollback, and Directus behavior remain
unchanged and outside implementation scope.
