# Security Policy

## Supported Versions

Only the `main` branch and the latest production deployment are supported with
security fixes.

## Dependency Risk Policy

- CI evaluates the complete root application lockfile with
  `npm audit --package-lock-only` and fails at the configured `info` threshold.
  Development and optional dependencies are included.
- The Directus image is upstream and digest-pinned in both Compose files; it is
  exercised by the repository Directus smoke, not audited as a local npm
  project.
- The current complete lockfile audit reports zero critical, high, moderate,
  low, and info findings.
- ESLint 9's npm deprecation notice is an upstream-support warning, not a
  current audit advisory. ESLint 10 is deferred until every plugin supplied by
  the installed Next.js lint stack declares compatible peer dependencies.
- Install-time lifecycle scripts are fail-closed through
  `strict-allow-scripts=true`. Only reviewed, exact package versions in
  `allowScripts` may run; new or updated script-bearing dependencies require a
  fresh review rather than inheriting approval by package name.
- No active exception approval is recorded. `SECURITY_EXCEPTIONS.md` preserves
  historical records only; it is not a waiver.

## Reporting a Vulnerability

Please report vulnerabilities privately by opening a GitHub Security Advisory:

1. Go to the repository `Security` tab.
2. Click `Report a vulnerability`.
3. Provide affected version, reproduction steps, and impact.

Initial triage target: 3 business days.
