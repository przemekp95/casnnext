# CASN Production-to-Local Snapshot Design

## Objective

Provide a repeatable, fail-closed workflow that reproduces the complete current
CASN production data set locally without giving the local importer any path to
write to production. The snapshot includes the complete MySQL database,
including Directus system tables, plus the writable Directus uploads volume and
the historical Strapi uploads volume.

The workflow is explicitly one-way: production creates an encrypted artifact;
the local environment only downloads, verifies, and restores that artifact.
It is not database replication and does not create a bidirectional connection.

## Current Evidence

Read-only checks on 2026-08-26 showed the public production application
returning 32 authors, 39 analyses, and 80 sitemap URLs. The local application
returned 4 authors, 6 analyses, and 5 sitemap URLs. The normalized production
and local API payload hashes also differed.

The existing `scripts/download-db-dump.sh` downloads a release artifact whose
freshness and provenance are not tied to the current production database. The
existing `scripts/reset-dev-db.sh` removes volumes and contains historical
credentials. Neither script is an acceptable foundation for this workflow.

The generic `mikrus` alias was found to refer to an unrelated MyHRVision VPS.
CASN production access is deliberately named `casn-mikrus` and resolves to the
Fundacja host `antoni235`. Read-only inventory through that explicit alias
established the exact production targets without changing production state.

## Scope

The production snapshot contains:

- every table and row in the CASN MySQL database, including Directus system
  tables, users, password hashes, tokens, flows, permissions, and audit data;
- MySQL schema objects required for a faithful restore, including views,
  triggers, routines, and events when present;
- all files from the Directus uploads volume;
- all files from the historical Strapi uploads volume;
- a non-secret manifest containing source identity evidence, timestamps,
  database object inventory, public-content counts, file inventory, and
  SHA-256 checksums.

Environment files, runtime secrets, TLS keys, SSH keys, container registry
credentials, and host configuration are not database or media data and are not
copied. The local runtime uses separate local secrets.

## Safety Model

### Production boundary

The durable safety property is that the local importer never receives a
production database connection string or a general-purpose production SSH
command channel. Production export is performed by a root-owned, reviewed
entrypoint on the production host.

MySQL export uses a dedicated account limited to the read privileges needed by
the selected dump options. Creating that account is a one-time, separately
audited production change. The account has no `INSERT`, `UPDATE`, `DELETE`,
`CREATE`, `ALTER`, `DROP`, `GRANT`, or administrative privileges.

The exporter asserts the expected production Compose project, service labels,
database name, database server identity, and volume identities before acting.
It refuses ambient Docker targets and unresolved names. Media volumes are
mounted read-only for export. The only intended production state changes are:

1. temporarily stopping or otherwise disabling the authenticated Directus
   writer;
2. writing a root-only temporary encrypted snapshot outside application
   volumes;
3. restoring the Directus writer before exit, including error exits;
4. deleting the temporary server-side artifact only after an independently
   verified download.

The public Next.js application and MySQL remain available for reads during the
snapshot window. A shell trap restores the Directus writer after any failure.
If the writer cannot be confirmed healthy after restart, the export fails and
reports an operational incident instead of claiming success.

### Local boundary

Restore always targets a newly created snapshot-specific Compose project,
MySQL volume, Directus uploads volume, and legacy uploads volume. It never
drops, truncates, or overwrites the currently selected local database or
volumes.

The importer requires all of the following before restore:

- the database endpoint is loopback-only;
- the target database name is `casn_local` or uses a stricter
  `casn_local_...` prefix;
- the target containers and volumes carry the expected local project and
  logical-volume labels;
- the database server identity differs from the production identity recorded
  in the manifest;
- the encrypted artifact, detached manifest, and all checksums verify;
- no production hostname, public CASN URL, or production Docker context occurs
  in the effective target configuration.

Failure of any assertion aborts before importing. The previous local stack and
volumes remain available for rollback until the user explicitly authorizes
their removal.

## Snapshot Format and Consistency

The database dump uses a transactionally consistent InnoDB snapshot with
options equivalent to `--single-transaction`, `--quick`, `--hex-blob`, and
explicit inclusion of routines, triggers, and events. Locking options that
would require write or administrative privileges are disabled. Before export,
the implementation checks for non-transactional tables; their presence blocks
the run until a safe consistency method is explicitly designed.

Directus writes are paused before the database transaction and media traversal
begin. The exporter captures the database and both media volumes while the
writer remains paused, then records checksums and reference evidence before
resuming writes. This establishes one coherent snapshot window for database
rows and uploaded files.

The artifact is encrypted on the production host to a local age recipient or
an equivalently reviewed public-key recipient. Plaintext dumps and media
archives are not retained after encryption succeeds. Snapshot files and keys
use owner-only permissions; private decryption material never reaches
production.

## Restore and Cutover

The local importer performs these stages:

1. validate the target and artifact without changing state;
2. create a new snapshot-specific local stack and volumes;
3. restore the complete database into `casn_local` without executing repository
   migrations or seeds;
4. restore both media archives into their new volumes;
5. start MySQL, Directus, Next.js, and Nginx bound to loopback-only ports;
6. run structural, content, media, security-boundary, and route parity checks;
7. switch the local development configuration to the verified stack and
   restart the local development server;
8. retain the previous local stack as rollback evidence.

There is no automatic scheduled import and no startup migration. Each refresh
is an explicit operator command with a snapshot identifier and visible
preflight output.

## Sensitive Data Handling

A faithful database copy retains production Directus identities, password
hashes, audit rows, and stored tokens. The local copy and encrypted artifact
are therefore production-sensitive data.

- Snapshot artifacts are excluded from Git and ordinary build contexts.
- Encrypted artifacts and manifests live in an approved external directory;
  decrypted data exists only inside local Docker volumes and short-lived
  owner-only temporary storage when technically unavoidable.
- Local MySQL and Directus ports bind only to `127.0.0.1`.
- Local Directus and application secrets differ from production secrets.
- Local services do not receive production webhook, email, storage, or other
  outbound integration credentials.
- Logs and verification reports contain counts, hashes, and identifiers, not
  row contents, tokens, credentials, or personal-data payloads.

Because copied static tokens may remain valid against production, possession
of the local database or decrypted artifact must be treated as production
access. This residual risk cannot be eliminated while preserving every row
exactly; it is contained through encryption, filesystem permissions, local-only
network exposure, and the absence of production environment secrets.

## Architecture Boundaries

The workflow consists of explicit commands rather than browser endpoints,
background jobs, queues, webhooks, or continuous replication. The exporter is
a production-side infrastructure adapter; the importer is a local-only
infrastructure adapter. Their artifact and manifest form the only interface.

The design uses a clear read/write separation but does not introduce a CQRS
framework, domain layer, or message bus. CSRF and browser CORS protections are
not applicable because the workflow exposes no browser-facing write endpoint.
HTTP transport is used only for read-only public parity checks. Existing
Directus webhooks are not invoked during restore, and local outbound
integrations remain disabled.

## Failure Handling and Recovery

- Any failed production preflight prevents the Directus pause.
- Any failure after the pause triggers writer restoration and health checking.
- A failed or incomplete export is never marked current and is not importable.
- Checksum, decryption, manifest, database identity, or target-boundary failure
  aborts before restore.
- Restore failure affects only new local volumes and cannot damage the previous
  local stack.
- Parity failure prevents local cutover and retains both the failed candidate
  and previous local stack for diagnosis.
- Cleanup of failed candidates, old snapshots, or old local volumes is always
  a separate explicit action.

## Verification and Acceptance

Implementation follows red-green-refactor for script behavior and boundary
checks. Tests use controlled fake targets and disposable local containers; no
test contacts or mutates production.

Required verification includes:

1. negative tests proving that non-loopback targets, production-like database
   names, wrong labels, matching production server identity, missing manifests,
   and checksum mismatches fail before import;
2. exporter tests proving the writer-resume trap executes on success and each
   simulated failure path;
3. dump restore into disposable MySQL with complete table, view, trigger,
   routine, and event inventory parity;
4. exact database dump checksum and media file-list/checksum verification;
5. public-content parity against the same captured production evidence,
   including at least 32 published authors, 39 published analyses, and 80
   sitemap URLs for the 2026-08-26 snapshot;
6. Directus login-page availability, expected collection inventory, and
   loopback-only port binding without exercising copied credentials in logs;
7. referenced Directus and legacy media availability through local Nginx;
8. local route smoke for the homepage, authors, analyses, collections,
   sitemap, health endpoints, and representative detail pages;
9. repository type checking, lint, focused tests, relevant policy checks, and
   shell static analysis for the new commands.

Counts are snapshot evidence, not permanent constants. Future refreshes record
and compare the current production counts and hashes captured in their own
manifest.

## Execution Gates

The following require explicit confirmation at execution time even after this
design is accepted:

1. one-time creation of the production read-only export account and installation
   of the root-owned exporter entrypoint;
2. pausing the Directus writer for the snapshot window;
3. downloading the production-sensitive encrypted artifact;
4. switching the local application to the verified candidate stack;
5. removing server-side artifacts, old local stacks, volumes, or snapshots.

Production access must be restored and inventoried before implementation can
execute the production stages. The failed SSH inventory in the design phase is
not evidence that the required access currently works.

## Non-Goals

- No production deployment, application image change, database migration, or
  content edit is part of data synchronization.
- No local-to-production import or push command exists.
- No secret or environment-file synchronization is performed.
- No continuous database replication or bidirectional CMS synchronization is
  introduced.
- No automatic deletion of backups, snapshots, volumes, or local data occurs.
