# Security Exceptions Register

## Scope

This document tracks accepted security exceptions for dependency vulnerabilities
that are currently not exploitable in production runtime or cannot be safely
fixed without risky upgrades.

## Active Exceptions

### EX-2026-02-17-001: Optional TypeORM sqlite3 chain in app lockfile

- Date accepted: 2026-02-17
- Owner: Engineering
- Affected scope: root app (`package-lock.json`)
- Finding: `npm audit --omit=dev` reports `high` vulnerabilities through
  `typeorm -> sqlite3 -> node-gyp -> tar`.
- Why accepted:
  - The app uses MySQL only.
  - CI and policy gate production runtime risk with
    `npm audit --omit=dev --omit=optional --package-lock-only`.
  - With optional deps omitted, app report is `0` vulnerabilities above `high`.
- Mitigations in place:
  - CI hard-fails on `high+` separately for app and Strapi.
  - TypeORM kept updated within safe range.
- Exit criteria:
  - Remove when TypeORM no longer pulls vulnerable optional sqlite3 chain, or
    when we migrate away from TypeORM.
- Review cadence: every 30 days.

### EX-2026-02-17-002: Strapi transitive moderate/low vulnerabilities

- Date accepted: 2026-02-17
- Owner: Engineering
- Affected scope: `strapi/package-lock.json`
- Finding: `npm --prefix strapi audit --omit=dev --omit=optional` reports
  moderate/low transitive issues (mainly admin/build toolchain).
- Why accepted:
  - No `high`/`critical` vulnerabilities in current Strapi runtime set.
  - Automated `npm audit fix` does not resolve without incompatible changes.
  - Immediate forced downgrade/major switch proposed by npm is not acceptable.
- Mitigations in place:
  - CI hard-fails on `high+` for Strapi.
  - Weekly dependency update automation for `/strapi` via Dependabot.
  - Existing runtime hardening in Docker and read-only public access model.
- Exit criteria:
  - Upgrade Strapi patch/minor once transitive fixes are available.
  - Close exception after audit has `0` vulnerabilities above chosen policy
    threshold.
- Review cadence: every 14 days.
