#!/usr/bin/env bash
set -euo pipefail

readonly PACKAGE_JSON='package.json'
readonly ESLINT_CONFIG='eslint.config.mjs'
readonly CYPRESS_HYDRATION='cypress/e2e/hydration.cy.ts'
readonly QUALITY_ACTION='.github/workflows/quality-checks/action.yml'
readonly DOCKER_WORKFLOW='.github/workflows/docker.yml'
readonly DEPLOY_WORKFLOW='.github/workflows/deploy.yml'

policy_failed=0

report_failure() {
  echo "[quality-policy] $1" >&2
  policy_failed=1
}

if ! node <<'NODE'
const pkg = require('./package.json');
const errors = [];
const eslintVersion = pkg.devDependencies?.eslint;
const legacyDeadline = '2026-09-30';
const today = process.env.QUALITY_POLICY_DATE ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) errors.push('QUALITY_POLICY_DATE must use YYYY-MM-DD.');
if (eslintVersion === '9.39.5') {
  if (today > legacyDeadline) {
    errors.push(`ESLint 9 compatibility exception expired on ${legacyDeadline}.`);
  } else {
    console.error(`[quality-policy] NOTICE: ESLint 9 compatibility exception expires after ${legacyDeadline}.`);
  }
} else if (!/^10\./.test(eslintVersion ?? '')) {
  errors.push('ESLint must be pinned to the approved 9.39.5 exception or a supported 10.x release.');
}
if (!pkg.scripts?.lint?.includes('--max-warnings 0')) errors.push('lint must reject warnings.');
if (/--ignore-pattern\s+["']?(lib|migrations)\//.test(pkg.scripts?.lint ?? '')) {
  errors.push('lint must not exclude lib or migrations.');
}
if (pkg.scripts?.['quality:policy'] !== 'bash scripts/ci/quality-debt-policy.sh') {
  errors.push('quality:policy script is missing or unexpected.');
}
for (const error of errors) console.error(`[quality-policy] ${error}`);
process.exitCode = errors.length > 0 ? 1 : 0;
NODE
then
  policy_failed=1
fi

if rg -n '"(lib|migrations)/\*\*"' "$ESLINT_CONFIG"; then
  report_failure 'ESLint must not broadly ignore lib or migrations.'
fi

if rg -n 'it\.skip\(' "$CYPRESS_HYDRATION"; then
  report_failure 'Hydration Cypress scenarios must execute instead of using it.skip.'
fi

if ! npm run runtime:policy:test; then
  report_failure 'Runtime source policy fixture contract failed.'
fi

if ! bash scripts/ci/server-launcher-test.sh; then
  report_failure 'Server launcher fixture contract failed.'
fi

if [[ -f server.js ]] && rg -n '^/\* eslint-disable' server.js; then
  report_failure 'The custom server must express its module boundary without inline lint suppression.'
fi

if [[ -e scripts/bulk-eslint-fix.js ]]; then
  report_failure 'The obsolete suppression-generating bulk ESLint fixer must be removed.'
fi

if rg -n -- '--fix|--write' "$QUALITY_ACTION"; then
  report_failure 'CI quality checks must not rewrite the checkout.'
fi

for required_action_command in 'npm run lint' 'npm run quality:policy'; do
  if ! rg -Fq "$required_action_command" "$QUALITY_ACTION"; then
    report_failure "Composite quality action is missing: $required_action_command"
  fi
done

for workflow in "$DOCKER_WORKFLOW" "$DEPLOY_WORKFLOW"; do
  if ! rg -Fq 'npm run quality:policy' "$workflow"; then
    report_failure "$workflow must run the quality policy."
  fi
done

for runtime_file in package.json Dockerfile docker-compose.final.yml docker-compose.portainer.yml .github/workflows/deploy.yml; do
  if rg -Fq 'server.js' "$runtime_file"; then
    report_failure "$runtime_file still references the ambiguous server.js entrypoint."
  fi
  if ! rg -Fq 'server.cjs' "$runtime_file"; then
    report_failure "$runtime_file must reference the explicit server.cjs entrypoint."
  fi
done

if ((policy_failed != 0)); then
  exit 1
fi

echo 'Quality debt policy passed.'
