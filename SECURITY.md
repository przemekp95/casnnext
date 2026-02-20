# Security Policy

## Supported Versions

Only the `main` branch and the latest production deployment are supported with
security fixes.

## Dependency Risk Policy

- CI enforces dependency audit checks for app and Strapi separately.
- Build fails on `high` and `critical` vulnerabilities.
- Accepted temporary exceptions are tracked in `SECURITY_EXCEPTIONS.md` with
  review dates and exit criteria.

## Reporting a Vulnerability

Please report vulnerabilities privately by opening a GitHub Security Advisory:

1. Go to the repository `Security` tab.
2. Click `Report a vulnerability`.
3. Provide affected version, reproduction steps, and impact.

Initial triage target: 3 business days.
