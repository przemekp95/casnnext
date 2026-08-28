#!/usr/bin/env bash
set -euo pipefail

readonly root="$1"

fail() { printf '[first-party-quality] %s\n' "$1" >&2; exit 1; }

is_excluded_source() {
  local path="$1"
  case "$path" in
    .next/*|node_modules/*|coverage/*|dist/*|app/generated/*|*.d.ts|lib/generated/*|lib/vendor/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

tracked_source_files() {
  local path
  local -a tracked_files=()
  mapfile -d '' -t tracked_files < <(
    git -C "$root" ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.cjs' '*.mjs'
  )

  for path in "${tracked_files[@]}"; do
    is_excluded_source "$path" && continue
    printf '%s\0' "$root/$path"
  done
}

check_source_suppressions() {
  local -a source_files=()
  mapfile -d '' -t source_files < <(tracked_source_files)
  ((${#source_files[@]})) || return

  if rg -n --pcre2 'eslint-(?:disable|enable)(?:-[[:alnum:]-]+)?|@ts-(?:ignore|nocheck|expect-error)\b' -- "${source_files[@]}"; then
    fail 'inline-eslint-directive'
  fi

  if rg -n --pcre2 '\b(?:it|test|describe)\s*\.\s*(?:skip|only)\s*\(' -- "${source_files[@]}"; then
    fail 'focused-or-skipped-test'
  fi

  if rg -n --pcre2 '\?\s*describe\s*:\s*describe\s*\.\s*(?:skip|only)\b' -- "${source_files[@]}"; then
    fail 'conditional-suite'
  fi

  if rg -n --pcre2 'if\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*(?:length|[A-Za-z_$][A-Za-z0-9_$]*))?\s*\)\s*(?:\{\s*)?expect\s*\(' -- "${source_files[@]}"; then
    fail 'conditional-assertion'
  fi
}

check_eslint_config() {
  local -a configs=()
  local -a source_files=()
  mapfile -d '' -t configs < <(
    git -C "$root" ls-files -z -- \
      'eslint.config.js' 'eslint.config.cjs' 'eslint.config.mjs' 'eslint.config.ts' \
      '.eslintrc' '.eslintrc.js' '.eslintrc.cjs' '.eslintrc.mjs' '.eslintrc.json'
  )
  [[ ${#configs[@]} -eq 1 && ${configs[0]} == 'eslint.config.mjs' ]] || fail 'effective-eslint-config'
  mapfile -d '' -t source_files < <(tracked_source_files)

  if ! node - "$root" "${source_files[@]}" <<'NODE'
const { ESLint } = require('eslint');
const { pathToFileURL } = require('url');
const path = require('path');

const [rootArgument, ...files] = process.argv.slice(2);
const root = path.resolve(rootArgument);
const configFile = path.join(root, 'eslint.config.mjs');
const severity = (value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'error') return 2;
  if (raw === 'warn') return 1;
  if (raw === 'off') return 0;
  return raw;
};
const nonHookRules = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-require-imports',
  '@typescript-eslint/no-unused-vars',
  '@typescript-eslint/ban-ts-comment',
  '@typescript-eslint/no-var-requires',
  '@next/next/no-assign-module-variable',
  '@next/next/no-css-tags',
];
const hookRules = ['react-hooks/error-boundaries', 'react-hooks/set-state-in-effect'];
const hookExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.mts', '.cts']);

(async () => {
  const loaded = await import(pathToFileURL(configFile).href);
  const items = Array.isArray(loaded.default) ? loaded.default : [loaded.default];
  const names = items.map((item) => item?.name).filter(Boolean);
  const requiredNames = [
    'casn/strict-first-party',
    'casn/react-hook-supported-files',
    'casn/next-image-mock',
  ];
  const hasExpectedTail = requiredNames.every((name, index) => items.at(index - requiredNames.length)?.name === name);
  if (requiredNames.some((name) => names.filter((candidate) => candidate === name).length !== 1)
    || !hasExpectedTail) {
    process.exitCode = 1;
    return;
  }

  const eslint = new ESLint({ cwd: root, overrideConfigFile: configFile });
  for (const file of files) {
    const config = await eslint.calculateConfigForFile(file);
    if (nonHookRules.some((rule) => severity(config.rules?.[rule]) !== 2)) {
      process.exitCode = 1;
      return;
    }
    for (const rule of hookRules) {
      const expected = hookExtensions.has(path.extname(file)) ? 2 : undefined;
      if (expected === 2 && severity(config.rules?.[rule]) !== 2) {
        process.exitCode = 1;
        return;
      }
      if (expected === undefined && config.rules?.[rule] !== undefined) {
        process.exitCode = 1;
        return;
      }
    }
    const expectedImageSeverity = path.relative(root, file) === 'test/__mocks__/nextImageMock.tsx' ? 0 : 2;
    if (severity(config.rules?.['@next/next/no-img-element']) !== expectedImageSeverity) {
      process.exitCode = 1;
      return;
    }
  }
})().catch(() => { process.exitCode = 1; });
NODE
  then
    fail 'effective-eslint-config'
  fi
}

check_package_scripts() {
  if ! node - "$root/package.json" <<'NODE'
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(packageJson.scripts?.['first-party-quality:policy'] === 'bash scripts/ci/first-party-quality-policy.sh .' ? 0 : 1);
NODE
  then
    fail 'first-party-policy-alias'
  fi
  if ! node - "$root/package.json" <<'NODE'
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(packageJson.scripts?.lint === 'eslint . --ext .ts,.tsx,.js,.jsx,.cjs --max-warnings 0' ? 0 : 1);
NODE
  then
    fail 'lint-must-reject-warnings'
  fi
}

check_workflow() {
  local workflow="$1"
  [[ -f "$root/$workflow" ]] || fail 'workflow-must-run-quality'

  if ! node - "$root/$workflow" <<'NODE'
const fs = require('fs');
const workflow = fs.readFileSync(process.argv[2], 'utf8');
const lines = workflow.split(/\r?\n/);
const indentation = (line) => line.match(/^\s*/)[0].length;
const stepSections = [];

for (let index = 0; index < lines.length; index += 1) {
  const section = /^(\s*)steps:\s*$/.exec(lines[index]);
  if (!section) continue;
  const sectionIndent = section[1].length;
  const stepIndent = sectionIndent + 2;
  for (let cursor = index + 1; cursor < lines.length;) {
    if (lines[cursor].trim() && indentation(lines[cursor]) <= sectionIndent) break;
    if (new RegExp(`^ {${stepIndent}}-\\s+`).test(lines[cursor])) {
      const start = cursor;
      cursor += 1;
      while (cursor < lines.length && !(new RegExp(`^ {${stepIndent}}-\\s+`).test(lines[cursor])) && !(lines[cursor].trim() && indentation(lines[cursor]) <= sectionIndent)) cursor += 1;
      stepSections.push(lines.slice(start, cursor));
      continue;
    }
    cursor += 1;
  }
}

const executions = [];
let unsafe = false;
for (let stepIndex = 0; stepIndex < stepSections.length; stepIndex += 1) {
  const step = stepSections[stepIndex];
  const runIndex = step.findIndex((line) => /^\s*(?:-\s*)?run:\s*/.test(line));
  if (runIndex === -1) continue;
  const runMatch = /^(\s*)(?:-\s*)?run:\s*(.*)$/.exec(step[runIndex]);
  const runIndent = runMatch[1].length;
  let commands = [];
  if (runMatch[2] === '|') {
    for (let index = runIndex + 1; index < step.length; index += 1) {
      const line = step[index];
      if (line.trim() && indentation(line) <= runIndent) break;
      if (line.trim()) commands.push(line.trim());
    }
  } else if (runMatch[2]) {
    commands = [runMatch[2].trim()];
  }
  const relevant = commands.some((command) => /\bnpm\s+run\s+(?:lint|quality:policy)\b/.test(command));
  if (relevant && step.some((line) => /^\s*(?:-\s*)?(?:if|continue-on-error|env):/.test(line) || line.includes('#'))) unsafe = true;
  commands.forEach((command, commandIndex) => executions.push({ stepIndex, commandIndex, command }));
}

const lintLike = executions.filter(({ command }) => /\bnpm\s+run\s+lint(?:\b|:)/.test(command));
const policyLike = executions.filter(({ command }) => /\bnpm\s+run\s+quality:policy\b/.test(command));
const exactLint = lintLike.filter(({ command }) => command === 'npm run lint');
const exactPolicy = policyLike.filter(({ command }) => command === 'npm run quality:policy');
const adjacent = exactLint.length === 1 && exactPolicy.length === 1
  && exactPolicy[0].stepIndex >= exactLint[0].stepIndex
  && exactPolicy[0].stepIndex <= exactLint[0].stepIndex + 1
  && executions.indexOf(exactPolicy[0]) === executions.indexOf(exactLint[0]) + 1;
const hasOnlyExactCommands = lintLike.length === 1 && policyLike.length === 1;
process.exit(unsafe || !hasOnlyExactCommands || !adjacent ? 1 : 0);
NODE
  then
    fail 'workflow-must-run-quality'
  fi
}

check_source_suppressions
check_eslint_config
check_package_scripts
check_workflow '.github/workflows/quality-checks/action.yml'
check_workflow '.github/workflows/docker.yml'
check_workflow '.github/workflows/deploy.yml'

echo 'First-party quality policy passed.'
