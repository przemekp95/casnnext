#!/usr/bin/env bash
set -euo pipefail

AUDIT_FAIL_ON_APP="${AUDIT_FAIL_ON_APP:-${AUDIT_FAIL_ON:-info}}"
AUDIT_SUMMARY_FILE="${AUDIT_SUMMARY_FILE:-}"

validate_threshold() {
  local value="$1"
  local label="$2"
  case "$value" in
    info|low|moderate|high|critical)
      ;;
    *)
      echo "Invalid ${label} value: $value"
      echo "Allowed values: info, low, moderate, high, critical"
      exit 1
      ;;
  esac
}

validate_threshold "$AUDIT_FAIL_ON_APP" "AUDIT_FAIL_ON_APP"

APP_AUDIT_FILE="$(mktemp)"

cleanup() {
  rm -f "$APP_AUDIT_FILE"
}
trap cleanup EXIT

echo "Running npm audit for the complete app dependency tree..."
npm audit --package-lock-only --json >"$APP_AUDIT_FILE" || true

node - "$AUDIT_FAIL_ON_APP" "$APP_AUDIT_FILE" "$AUDIT_SUMMARY_FILE" <<'NODE'
const fs = require("fs");

const appFailOn = process.argv[2];
const appFile = process.argv[3];
const summaryFile = process.argv[4];

const severities = ["info", "low", "moderate", "high", "critical"];

function parseAuditReport(path, label) {
  const raw = fs.readFileSync(path, "utf8").trim();
  if (!raw) {
    throw new Error(`${label}: empty audit report`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label}: invalid audit report JSON`);
  }
}

function severityWeight(level) {
  return severities.indexOf(level);
}

function collectBlockingVulns(report, thresholdIndex) {
  const vulnerabilities = report?.vulnerabilities ?? {};
  return Object.entries(vulnerabilities)
    .map(([key, vuln]) => ({
      name: vuln.name || key,
      severity: vuln.severity || "info",
      isDirect: Boolean(vuln.isDirect),
    }))
    .filter((vuln) => severityWeight(vuln.severity) >= thresholdIndex)
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || a.name.localeCompare(b.name));
}

const report = parseAuditReport(appFile, "app");
const thresholdIndex = severityWeight(appFailOn);

if (thresholdIndex === -1) {
  console.error(`[security] Invalid threshold for app: ${appFailOn}`);
  process.exit(1);
}

const counts = report?.metadata?.vulnerabilities ?? {};
const row = {
  project: "app",
  threshold: appFailOn,
  critical: Number(counts.critical || 0),
  high: Number(counts.high || 0),
  moderate: Number(counts.moderate || 0),
  low: Number(counts.low || 0),
  info: Number(counts.info || 0),
};

row.blocking = severities
  .slice(thresholdIndex)
  .reduce((acc, severity) => acc + Number(counts[severity] || 0), 0);

console.log(
  `[security] app: threshold=${row.threshold} critical=${row.critical}, high=${row.high}, moderate=${row.moderate}, low=${row.low}, info=${row.info}`
);

const blockingVulns = collectBlockingVulns(report, thresholdIndex);

if (summaryFile) {
  const table = [
    "| Project | Threshold | Critical | High | Moderate | Low | Info | Blocking |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${row.project} | ${row.threshold} | ${row.critical} | ${row.high} | ${row.moderate} | ${row.low} | ${row.info} | ${row.blocking} |`,
  ].join("\n");

  const details = blockingVulns.length
    ? `\n\n### Blocking vulnerabilities\n${blockingVulns
        .slice(0, 12)
        .map((v) => `- app: ${v.name} (${v.severity}, ${v.isDirect ? "direct" : "transitive"})`)
        .join("\n")}`
    : "\n\nNo vulnerabilities above configured thresholds.";

  fs.appendFileSync(summaryFile, `## Dependency Audit Summary\n\n${table}${details}\n\n`);
}

if (row.blocking > 0) {
  console.error(`[security] app: found ${row.blocking} vulnerabilities at or above ${appFailOn}`);
  process.exit(1);
}

console.log(`[security] Audit policy passed (app fail on ${appFailOn}+).`);
NODE
