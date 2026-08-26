# Security Exceptions Register

## Current status

There are **no active approved exceptions** for the current root application
lockfile. The source-checked command

```bash
npm audit --package-lock-only
```

currently reports zero vulnerabilities across the complete dependency tree, so
`npm run audit:policy` passes its `info` threshold. The remediation pins `next`
and `eslint-config-next` to 16.3.3, `next-auth` to 4.24.15, TypeORM to 0.3.31,
Cypress to 15.21.1, Jest to 30.4.2, and `jest-environment-jsdom` to 30.4.1.
Unused Lighthouse and `eslint-plugin-boundaries` dependencies were removed.
Compatible transitive packages were refreshed within their declared ranges;
the result does not rely on a risk exception or a forced audit fix.

## Historical, read-only records

The following record is retained for audit history. It does not create or
approve any current exception and must not be used to bypass the policy.

### EX-2026-02-17-001: Optional TypeORM sqlite3 chain in app lockfile

- Recorded: 2026-02-17
- Former scope: root app (`package-lock.json`)
- Former rationale: the app used MySQL and the policy omitted optional
  dependencies.
- Historical outcome: this was an earlier assessment, not a current exception.
  The current complete dependency-tree audit passes without omit flags; this
  record remains historical only.

### Retired historical CMS record

The former Strapi transitive-vulnerability record is retired. Strapi source,
lockfile, image build, and audit command are no longer active repository
surfaces. The only retained Strapi name in runtime configuration is the
read-only historical `strapi_uploads` volume used for `/cms/uploads/`
compatibility.
