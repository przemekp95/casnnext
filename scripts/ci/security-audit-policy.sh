#!/usr/bin/env bash
set -euo pipefail

AUDIT_FAIL_ON="${AUDIT_FAIL_ON:-high}"

case "$AUDIT_FAIL_ON" in
  info|low|moderate|high|critical)
    ;;
  *)
    echo "Invalid AUDIT_FAIL_ON value: $AUDIT_FAIL_ON"
    echo "Allowed values: info, low, moderate, high, critical"
    exit 1
    ;;
esac

APP_AUDIT_FILE="$(mktemp)"
STRAPI_AUDIT_FILE="$(mktemp)"

cleanup() {
  rm -f "$APP_AUDIT_FILE" "$STRAPI_AUDIT_FILE"
}
trap cleanup EXIT

echo "Running npm audit for app production deps..."
npm audit --omit=dev --omit=optional --package-lock-only --json >"$APP_AUDIT_FILE" || true

echo "Running npm audit for Strapi production deps..."
npm --prefix strapi audit --omit=dev --omit=optional --package-lock-only --json >"$STRAPI_AUDIT_FILE" || true

node - "$AUDIT_FAIL_ON" "$APP_AUDIT_FILE" "$STRAPI_AUDIT_FILE" <<'NODE'
const fs = require("fs");

const failOn = process.argv[2];
const appFile = process.argv[3];
const strapiFile = process.argv[4];

const severities = ["info", "low", "moderate", "high", "critical"];
const thresholdIndex = severities.indexOf(failOn);
if (thresholdIndex === -1) {
  console.error(`[security] Invalid threshold: ${failOn}`);
  process.exit(1);
}

const reports = [
  { name: "app", file: appFile },
  { name: "strapi", file: strapiFile },
];

function parseAuditReport(path, label) {
  const raw = fs.readFileSync(path, "utf8").trim();
  if (!raw) {
    throw new Error(`${label}: empty audit report`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label}: invalid audit report JSON`);
  }
}

let failed = false;

for (const reportInfo of reports) {
  const report = parseAuditReport(reportInfo.file, reportInfo.name);
  const counts = report?.metadata?.vulnerabilities ?? {};
  const info = Number(counts.info || 0);
  const low = Number(counts.low || 0);
  const moderate = Number(counts.moderate || 0);
  const high = Number(counts.high || 0);
  const critical = Number(counts.critical || 0);

  console.log(
    `[security] ${reportInfo.name}: critical=${critical}, high=${high}, moderate=${moderate}, low=${low}, info=${info}`
  );

  const totalBlocking = severities
    .slice(thresholdIndex)
    .reduce((acc, severity) => acc + Number(counts[severity] || 0), 0);

  if (totalBlocking > 0) {
    failed = true;
    console.error(
      `[security] ${reportInfo.name}: found ${totalBlocking} vulnerabilities at or above ${failOn}`
    );
  }
}

if (failed) {
  process.exit(1);
}

console.log(`[security] Audit policy passed (fail on ${failOn}+).`);
NODE
