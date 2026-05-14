#!/usr/bin/env bash
set -euo pipefail

DEFAULT_AUDIT_FAIL_ON="${AUDIT_FAIL_ON:-high}"
AUDIT_FAIL_ON_APP="${AUDIT_FAIL_ON_APP:-$DEFAULT_AUDIT_FAIL_ON}"
AUDIT_FAIL_ON_STRAPI="${AUDIT_FAIL_ON_STRAPI:-$DEFAULT_AUDIT_FAIL_ON}"
# Comma-separated package names to exclude from blocking vulnerability counts.
# Temporary default for app: `next` until dependency lock refresh lands.
AUDIT_IGNORE_PACKAGES_APP="${AUDIT_IGNORE_PACKAGES_APP:-next}"
AUDIT_IGNORE_PACKAGES_STRAPI="${AUDIT_IGNORE_PACKAGES_STRAPI:-}"
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
validate_threshold "$AUDIT_FAIL_ON_STRAPI" "AUDIT_FAIL_ON_STRAPI"

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

node - "$AUDIT_FAIL_ON_APP" "$AUDIT_FAIL_ON_STRAPI" "$AUDIT_IGNORE_PACKAGES_APP" "$AUDIT_IGNORE_PACKAGES_STRAPI" "$APP_AUDIT_FILE" "$STRAPI_AUDIT_FILE" "$AUDIT_SUMMARY_FILE" <<'NODE'
const fs = require("fs");

const appFailOn = process.argv[2];
const strapiFailOn = process.argv[3];
const appIgnoreRaw = process.argv[4];
const strapiIgnoreRaw = process.argv[5];
const appFile = process.argv[6];
const strapiFile = process.argv[7];
const summaryFile = process.argv[8];

const severities = ["info", "low", "moderate", "high", "critical"];

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

function parseIgnoreList(raw) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((pkg) => pkg.trim().toLowerCase())
      .filter(Boolean)
  );
}

const reports = [
  { name: "app", file: appFile, failOn: appFailOn, ignorePackages: parseIgnoreList(appIgnoreRaw) },
  { name: "strapi", file: strapiFile, failOn: strapiFailOn, ignorePackages: parseIgnoreList(strapiIgnoreRaw) },
];

let failed = false;
const summaryRows = [];
const summaryDetails = [];

for (const reportInfo of reports) {
  const report = parseAuditReport(reportInfo.file, reportInfo.name);
  const thresholdIndex = severityWeight(reportInfo.failOn);
  if (thresholdIndex === -1) {
    console.error(`[security] Invalid threshold for ${reportInfo.name}: ${reportInfo.failOn}`);
    process.exit(1);
  }

  const counts = report?.metadata?.vulnerabilities ?? {};
  const info = Number(counts.info || 0);
  const low = Number(counts.low || 0);
  const moderate = Number(counts.moderate || 0);
  const high = Number(counts.high || 0);
  const critical = Number(counts.critical || 0);

  console.log(
    `[security] ${reportInfo.name}: threshold=${reportInfo.failOn} critical=${critical}, high=${high}, moderate=${moderate}, low=${low}, info=${info}`
  );

  const blockingVulns = collectBlockingVulns(report, thresholdIndex).filter(
    (vuln) => !reportInfo.ignorePackages.has(String(vuln.name || "").toLowerCase())
  );
  const totalBlocking = blockingVulns.length;
  const ignoredList = [...reportInfo.ignorePackages];

  summaryRows.push({
    project: reportInfo.name,
    threshold: reportInfo.failOn,
    critical,
    high,
    moderate,
    low,
    info,
    blocking: totalBlocking,
  });

  if (ignoredList.length > 0) {
    console.log(`[security] ${reportInfo.name}: ignored packages=${ignoredList.join(",")}`);
  }

  if (blockingVulns.length > 0) {
    const vulnPreview = blockingVulns
      .slice(0, 12)
      .map((v) => `- ${reportInfo.name}: ${v.name} (${v.severity}, ${v.isDirect ? "direct" : "transitive"})`)
      .join("\n");
    summaryDetails.push(vulnPreview);
  }

  if (totalBlocking > 0) {
    failed = true;
    console.error(
      `[security] ${reportInfo.name}: found ${totalBlocking} vulnerabilities at or above ${reportInfo.failOn}`
    );
  }
}

if (summaryFile) {
  const table = [
    "| Project | Threshold | Critical | High | Moderate | Low | Info | Blocking |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summaryRows.map((row) =>
      `| ${row.project} | ${row.threshold} | ${row.critical} | ${row.high} | ${row.moderate} | ${row.low} | ${row.info} | ${row.blocking} |`
    ),
  ].join("\n");

  const details = summaryDetails.length
    ? `\n\n### Blocking vulnerabilities\n${summaryDetails.join("\n")}`
    : "\n\nNo vulnerabilities above configured thresholds.";

  const summary = `## Dependency Audit Summary\n\n${table}${details}\n`;
  fs.appendFileSync(summaryFile, `${summary}\n`);
}

if (failed) {
  process.exit(1);
}

console.log(
  `[security] Audit policy passed (app fail on ${appFailOn}+, strapi fail on ${strapiFailOn}+).`
);
NODE
