# CASN Disposable Lifecycle Driver Design

**Date:** 2026-08-27

**Status:** Proposed — architecture approved in chat; written specification
awaiting review

## Purpose

Replace the rejected Bash regression-runner architecture for Task 6 of the
first-party quality-debt plan with a small, strictly typed Node/TypeScript test
driver. The replacement must prove the existing disposable application harness
behaves safely without turning the test infrastructure into a new first-party
maintenance burden.

This document is an addendum to:

- `docs/superpowers/specs/2026-08-26-casn-first-party-quality-debt-elimination-design.md`;
- `docs/superpowers/plans/2026-08-26-casn-first-party-quality-debt-elimination.md`.

It supersedes only the implementation mechanics of Task 6. Tasks 0–5 remain
accepted. Tasks 7–12 remain blocked until this replacement is implemented,
verified, and independently reviewed.

## Why the Task 6 design changes

The accepted application harness, `scripts/ci/with-disposable-app.sh`, is
unchanged between `87e518d` and the current branch. The failed work is the
regression runner around it.

The rejected commits `5795b48` and `204535a` expanded the runner to almost
3,000 lines of Bash plus three helper scripts. Independent review continued to
find load-bearing lifecycle defects:

- destructive cleanup authority derived from child-controlled logs;
- dangling symlink, pending-record, and duplicate-record false greens;
- ambiguous `/proc` read failures collapsed into confirmed absence;
- initialization windows without reliable teardown;
- pre-registration launchers which could outlive a timeout;
- shared tri-state semantics incompatible with unchanged consumers;
- cleanup roots insufficiently anchored across symlink or inode replacement.

These findings indicate a boundary problem rather than a missing local guard.
Continuing to patch the shell runner would replace visible test debt with a
larger, harder-to-review subsystem.

The rejected commits remain in local history for auditability. The replacement
will remove their superseded files and restore shared shell helpers through a
forward commit; history will not be rewritten.

## Decisions and rejected alternatives

### Chosen: typed driver behind the existing shell command

A strict TypeScript driver owns process launch, identity capture, deadlines,
status propagation, and post-run evidence. A thin Bash entrypoint retains the
existing command surface for local and CI callers.

This choice uses the repository's existing Node 22, TypeScript, `tsx`, Jest, and
ESLint toolchain. It makes state transitions explicit and permits most failure
contracts to run against deterministic fake `/proc` fixtures without Docker or
process races.

### Rejected: continue extending the Bash registry

This preserves sunk implementation work but retains duplicated parsers,
integer status conventions, trap state, FIFO protocols, and shell-global
mutation across thousands of lines. The review history shows that nominal
GREEN runs do not make that structure reliably reviewable.

### Rejected: reduce the adversarial contracts

Dropping PID reuse, unknown `/proc`, timeout, symlink, signal, or cleanup
contracts would make the suite smaller by weakening the behavior it is meant
to prove. The replacement instead moves those contracts into fast typed tests
and keeps a small black-box integration matrix.

No PID namespace, cgroup manager, privileged helper, daemon, or additional npm
dependency is introduced.

## Scope

### In scope

- a TypeScript `/proc` reader with explicit `present`, `absent`, and `unknown`
  results;
- a parent-owned gated launcher for commands the driver is authorized to
  signal;
- exact process identity and temporary-root ownership records;
- bounded signal, reap, status, and stabilization behavior;
- deterministic unit tests and real local-process integration tests;
- a minimal black-box matrix for the unchanged disposable application harness;
- removal of the rejected Bash registry/launcher architecture by a forward
  commit;
- strict typecheck, lint, ShellCheck for the thin wrapper, and final resource
  inventory.

### Out of scope

- changes to `scripts/ci/with-disposable-app.sh`;
- application, runtime, API, database, migration, deployment, rollback, or
  Directus behavior;
- automatic database or Directus metadata rollback;
- production, remote database, public runtime, port 3000, or any pre-existing
  Docker container;
- automatic adoption or cleanup of resources from logs, process names, argv,
  cwd, environment scans, Docker enumeration, or stale evidence files;
- changing the accepted ESLint 9.39.5 compatibility deadline.

## Source layout and command boundary

The implementation will use the following bounded units:

```text
scripts/ci/with-disposable-app-regression-test.sh       thin checked entrypoint
scripts/ci/disposable-lifecycle/cli.ts                  scenario selection/reporting
scripts/ci/disposable-lifecycle/proc.ts                 strict Linux /proc adapter
scripts/ci/disposable-lifecycle/owned-process.ts        gated launch and identity
scripts/ci/disposable-lifecycle/cleanup.ts              bounded teardown/proof
scripts/ci/disposable-lifecycle/harness-scenarios.ts    black-box harness cases
test/unit/ci/disposable-lifecycle/*.test.ts             deterministic contracts
test/integration/ci/disposable-lifecycle.test.ts        real local processes
tsconfig.disposable-lifecycle.json                      strict no-emit boundary
```

Names may be mechanically adjusted by the implementation plan if an existing
repository convention requires it, but the responsibility boundaries must not
be recombined into one large file.

The shell entrypoint contains only `set -euo pipefail`, repository-root
resolution, a check for the repository-local `tsx` executable, and `exec` of
`cli.ts` with the original arguments. It contains no process parsing,
signalling, cleanup, Docker handling, or suppression.

The driver runs through the repository-local `node_modules/.bin/tsx`; it does
not use a network-resolving `npx` fallback.

## Strict TypeScript boundary

`tsconfig.disposable-lifecycle.json` is `strict: true`, `noEmit: true`, targets
Node 22/ES2022, and includes only the driver plus its unit/integration tests.
The driver uses no `any`, TypeScript suppression, inline ESLint directive,
CommonJS `require()`, or broad ESLint override.

The root application typecheck remains unchanged. A dedicated npm command runs
the strict driver typecheck, and the final quality policy includes the new
first-party TypeScript sources.

## Process identity model

### Discriminated results

The `/proc` adapter never communicates state through overloaded numeric exit
codes. Its public result is a discriminated union:

```ts
type ProcessLookup =
  | { kind: 'present'; identity: ProcessIdentity; state: ProcessState }
  | { kind: 'absent' }
  | { kind: 'unknown'; reason: string };
```

`ProcessIdentity` contains PID, start time, PPID, process group, and session.
The parser locates the final `) ` delimiter so process names containing spaces
or parentheses remain valid. Process state must be one literal Linux state
character accepted by the adapter; malformed text is `unknown`.

A missing `stat` file is `absent` only after a second path check confirms that
the entry remains absent. A still-present unreadable, malformed, dangling, or
inconsistent entry is `unknown`. Callers must exhaustively handle all three
variants. `unknown` can never establish cleanup, readiness, ownership, or
permission to signal.

This strict adapter is private to the new driver. The shared Bash identity
helper is restored to the accepted pre-rewrite version, so no new semantics are
silently imposed on the unchanged main harness.

### Parent-owned gated launch

The driver starts a small Node child with an IPC gate and `detached: true`.
Immediately after `spawn` returns, the parent reads and records the child's full
identity before sending the release message. The child cannot start the target
command before release.

If identity capture is absent or unknown, the gate stays closed and the driver
fails. Because the parent already owns the PID returned by `spawn`, it can
revalidate that exact identity and perform bounded cleanup without discovering
authority from the child.

The parent also requires the Node child handle to remain live, PPID to equal the
parent, and PID, process group, and session to identify the new detached leader
before releasing the gate. The gated child remains that stable driver-owned
process-group/session anchor until its target exits and the group is proved
empty. Every exact-PID or process-group TERM/KILL is preceded immediately by a
fresh full anchor identity match. PID reuse, changed process group/session, or
unexplained reparenting revokes authority and fails closed.

The driver does not adopt descendants merely because they share a process
group, argv, cwd, environment value, or name. Group scans are absence evidence,
never signalling authority.

## Ownership and cleanup

### Driver-owned resources

The parent records only resources it creates directly:

- the gated launcher identity captured from the returned child PID;
- explicitly created synthetic fixture processes, each captured by its fixture
  owner before release;
- a driver root created with `mkdtemp` under `/tmp/casn-quality-regression-`;
- evidence files created beneath that root.

At root creation the driver records device, inode, owner, and mode from an open
directory descriptor. Before traversal or removal it requires the path to be a
non-symlink directory with the same identity. Replacement, disappearance at an
unexpected phase, permission loss, or a dangling symlink is a cleanup failure.

Evidence is written as one schema-versioned JSON document to a mode-0600
temporary file, `fsync`ed, and published with a no-clobber operation. The
document is diagnostic state, not authority after the creating process exits.
A later invocation never automatically signals or deletes resources named by a
stale evidence document.

### Unchanged harness resources

The existing shell harness remains responsible for its exact MySQL container,
application process, internal supervisor, and `casn-quality.*` directory. The
driver may parse its anchored resource line only to assert post-run absence and
produce diagnostics. It never uses the line to signal a PID, remove a
container, or delete a path.

Before each black-box case the driver captures Docker, socket, and relevant
process evidence. After the case it verifies that no new matching resource
remains and that the exact reported resources are absent. If the harness leaks
an internal resource the test fails and retains evidence; the driver does not
claim authority to repair a resource it did not create.

Synthetic "unregistered process" scenarios use two separate owners: the test
fixture owner captures the exact identity for final fixture teardown, while the
system-under-test registry intentionally receives no authority. The assertion
proves system teardown leaves that process alive; only afterward may the
fixture owner revalidate and remove it.

### One bounded finalization path

The CLI installs signal/error finalization before creating its root. All normal,
error, signal, and child-exit paths converge on one idempotent async `finally`.
Initialization before root creation is a no-op cleanup; after creation, only
the anchored root and parent-owned identities are eligible.

Each wait has its own deadline and child-liveness condition. Cleanup first
signals the target through the freshly verified driver-owned group anchor,
proves the group empty, then reaps the gated anchor and removes the evidence
root. Cleanup failure overrides an otherwise successful scenario. An incoming
nonzero or signal-derived status is preserved unless cleanup itself also fails,
in which case the report records both and returns the cleanup failure status.

After teardown, the driver waits through a short bounded stabilization window
and requires every owned identity/group and path to remain absent. Unknown
process state fails the proof.

## Scenario and test strategy

### Deterministic unit tests

Fake `/proc` trees and temporary roots cover:

- process names with spaces and nested parentheses;
- present, absent, unreadable, malformed, statless, dangling, and disappearing
  entries;
- PID reuse and changed PPID/PGID/session;
- symlink, inode replacement, permission, duplicate publication, and stale
  evidence behavior;
- exact status precedence and timeout classification;
- evidence never granting destructive authority.

Expectations use literal hand-derived identities and states. Tests mutate real
behavior; they do not grep implementation source or reuse the parser to build
expected values.

### Real local-process integration tests

Docker-free tests cover:

- gate closed until the parent records identity;
- successful child and exact nonzero status propagation;
- TERM and bounded KILL of a driver-owned ignored-signal process;
- stopped process handling;
- leader exit with a surviving owned descendant;
- pre-registration child failure and timeout;
- registered survivor causing cleanup failure;
- unregistered process remaining untouched until fixture-owner teardown;
- initialization error and signal cleanup;
- stabilized post-return absence.

Race-sensitive local-process tests repeat several times. Every repetition has a
hard outer deadline and performs its own exact fixture cleanup.

### Black-box application-harness matrix

Expensive Docker/build cases run once per final exact tree, not inside every
unit mutation loop:

- successful command with the expected loopback DSN and URLs;
- healthy-infrastructure child exit 23 preserved exactly;
- external TERM with status and bounded cleanup;
- command leader exit with ignored descendant;
- external TERM with ignored descendant;
- Docker-absence-query failure and socket-absence-query failure must fail
  visibly rather than claim verified cleanup;
- the required 56 non-live tests and 13 live tests through the unchanged
  harness.

MySQL readiness retains the already accepted final-server marker plus
application-user `SELECT 1`; a lone `mysqladmin ping` is not acceptance.

The complete fast unit/process suite is repeated. The Docker/build matrix is
not repeated merely to manufacture race confidence which belongs in the
Docker-free layer.

## Removal and migration boundary

Implementation uses forward commits only:

1. Add RED TypeScript tests against the behavioral defects retained in the
   rejected runner.
2. Add the strict typed units and thin shell entrypoint.
3. Move real-process and harness scenarios to the driver.
4. Delete the superseded Bash registry and registered-launcher helpers.
5. Restore `disposable-process-identity.sh` to the accepted pre-rewrite contract
   unless the implementation plan demonstrates an independent required fix for
   the unchanged harness and obtains separate approval.
6. Delete the large rejected runner logic, leaving only the thin entrypoint.

No rejected commit is reset, amended, squashed, or removed from history.

## Acceptance

The replacement is accepted only when all of the following are fresh on the
final exact commit:

- strict driver typecheck and focused ESLint with zero warnings;
- deterministic unit and real-process suites, including repeated race cases;
- shell syntax and ShellCheck for the thin entrypoint and unchanged harness;
- the black-box harness matrix, 56 non-live tests, and 13 live tests;
- controlled child statuses 0 and 23;
- production build and existing MySQL final-readiness rule;
- no prohibited inline directive, skip, broad lint override, `any`, or
  `require()` introduced;
- no destructive target sourced from logs, argv, cwd, process names,
  environment scans, Docker enumeration, or stale evidence;
- no `casn-quality-*` container, port-31337 listener, driver/harness process,
  or `casn-quality*` temporary root created by the run remains;
- protected pre-existing PID `2329714` and all pre-existing Docker resources
  remain untouched;
- the exact `with-disposable-app.sh` blob remains unchanged from `87e518d`;
- `git diff --check` and worktree status are clean;
- an independent task review reports both specification and quality PASS.

Failures retain diagnostic evidence when safe and report exact limitations.
They are never converted to GREEN by retry alone; a rerun is supplementary
evidence after the root cause is identified.

## Methodology and architectural applicability

The replacement is implemented test-first. Recorded RED/GREEN order supports
TDD claims for the new driver, but existing test history is not relabeled TDD.
The scenario matrix is executable behavioral documentation for this lifecycle
boundary; the repository is not labeled globally BDD.

This is local test infrastructure, not a domain bounded context. DDD and CQRS
do not apply. It does not change ports-and-adapters boundaries, HTTP transport,
browser sessions or CSRF, messaging/jobs, webhooks, production runtime,
deployment, rollback, database, or Directus behavior.
