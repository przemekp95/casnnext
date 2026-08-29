#!/usr/bin/env bash
set -euo pipefail

readonly root="$1"

fail() { printf '[first-party-quality] %s\n' "$1" >&2; exit 1; }

is_excluded_source() {
  local path="$1"
  case "$path" in
    .next/*|node_modules/*|coverage/*|dist/*|app/generated/*|*.d.ts|*.d.mts|*.d.cts|lib/generated/*|lib/vendor/*)
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
    git -C "$root" ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.cjs' '*.mjs' '*.mts' '*.cts'
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
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const path = require('path');

const [rootArgument, ...files] = process.argv.slice(2);
const root = path.resolve(rootArgument);
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const { ESLint } = requireFromRoot('eslint');
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
  const mockBlock = items.find((item) => item?.name === 'casn/next-image-mock');
  const hasExactMockBlock = mockBlock
    && Object.keys(mockBlock).sort().join(',') === 'files,name,rules'
    && Array.isArray(mockBlock.files)
    && mockBlock.files.length === 1
    && mockBlock.files[0] === 'test/__mocks__/nextImageMock.tsx'
    && Object.keys(mockBlock.rules ?? {}).length === 1
    && mockBlock.rules?.['@next/next/no-img-element'] === 'off';
  const disabledImageRuleBlocks = items.filter((item) => severity(item?.rules?.['@next/next/no-img-element']) === 0);
  if (requiredNames.some((name) => names.filter((candidate) => candidate === name).length !== 1)
    || !hasExpectedTail || !hasExactMockBlock || disabledImageRuleBlocks.length !== 1
    || disabledImageRuleBlocks[0] !== mockBlock) {
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
  local -a npm_config_files=()
  mapfile -d '' -t npm_config_files < <(
    git -C "$root" ls-files -z | while IFS= read -r -d '' path; do
      case "$path" in
        .npmrc|*/.npmrc) printf '%s\0' "$root/$path" ;;
      esac
    done
  )
  if ! node - "$root/package.json" "${npm_config_files[@]}" <<'NODE'
const fs = require('fs');

const [packageFile, ...npmConfigFiles] = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const forbiddenLifecycleHooks = new Set([
  'prelint',
  'postlint',
  'prequality:policy',
  'postquality:policy',
  'prefirst-party-quality:policy',
  'postfirst-party-quality:policy',
]);

if (Object.keys(packageJson.scripts ?? {}).some((name) => forbiddenLifecycleHooks.has(name))) {
  process.exit(1);
}

for (const npmConfigFile of npmConfigFiles) {
  const lines = fs.readFileSync(npmConfigFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) process.exit(1);
    const key = trimmed.slice(0, separator).trim().toLowerCase().replaceAll('_', '-');
    const value = trimmed.slice(separator + 1).trim().toLowerCase();
    if (key !== 'strict-allow-scripts' || value !== 'true') process.exit(1);
  }
}
NODE
  then
    fail 'npm-execution-contract'
  fi
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
process.exit(packageJson.scripts?.lint === 'eslint . --ext .ts,.tsx,.js,.jsx,.cjs,.mjs,.mts,.cts --max-warnings 0' ? 0 : 1);
NODE
  then
    fail 'lint-must-reject-warnings'
  fi
}

check_workflow() {
  local workflow="$1"
  local document_kind="$2"
  [[ -f "$root/$workflow" ]] || fail 'workflow-must-run-quality'

  if ! node - "$root" "$root/$workflow" "$document_kind" <<'NODE'
const fs = require('fs');
const { createRequire } = require('module');
const path = require('path');

const [rootArgument, workflowFile, documentKind] = process.argv.slice(2);
const root = path.resolve(rootArgument);
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const YAML = requireFromRoot('yaml');
const workflow = YAML.parse(fs.readFileSync(workflowFile, 'utf8'));
const stepGroups = [];
let invalid = false;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, keys) => isPlainObject(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const allowedInheritedEnv = new Set([
  'APP_IMAGE_NAME',
  'CODECOV_TOKEN',
  'COVERAGE_EXCELLENT_LINES',
  'COVERAGE_MIN_LINES',
  'NGINX_IMAGE_NAME',
  'REGISTRY',
]);
const hasOnlyAllowedInheritedEnv = (env) => env === undefined
  || (isPlainObject(env)
    && Object.keys(env).every((name) => allowedInheritedEnv.has(name)));
const allowedTriggers = new Set(['pull_request', 'push', 'workflow_dispatch']);
const hasActiveTrigger = (document) => Object.hasOwn(document, 'on')
  && isPlainObject(document.on)
  && Object.keys(document.on).length > 0
  && Object.entries(document.on).every(([trigger, configuration]) => allowedTriggers.has(trigger)
    && (configuration === null || isPlainObject(configuration)));
const hasReadOnlyContentsPermission = (permissions) => hasExactKeys(permissions, ['contents'])
  && permissions.contents === 'read';
const hasStepName = (step) => typeof step.name === 'string' && step.name.trim() !== '';
const isExactCheckoutStep = (step) => hasExactKeys(step, ['name', 'uses']) && hasStepName(step)
  && step.uses === 'actions/checkout@v4';
const isExactSetupNodeStep = (step) => hasExactKeys(step, ['name', 'uses', 'with']) && hasStepName(step)
  && step.uses === 'actions/setup-node@v4'
  && hasExactKeys(step.with, ['cache', 'node-version'])
  && step.with.cache === 'npm' && step.with['node-version'] === '22';
const isExactRunStep = (step, command) => hasExactKeys(step, ['name', 'run']) && hasStepName(step)
  && step.run === command;
const isExactWorkflowGateJob = (job) => {
  if (!isPlainObject(job) || !Object.keys(job).every((key) => ['env', 'permissions', 'runs-on', 'steps'].includes(key))
    || job['runs-on'] !== 'ubuntu-latest' || !hasReadOnlyContentsPermission(job.permissions)
    || !hasOnlyAllowedInheritedEnv(job.env) || !Array.isArray(job.steps) || job.steps.length !== 5) {
    return false;
  }
  return isExactCheckoutStep(job.steps[0])
    && isExactSetupNodeStep(job.steps[1])
    && isExactRunStep(job.steps[2], 'npm ci --ignore-scripts')
    && isExactRunStep(job.steps[3], 'npm run lint')
    && isExactRunStep(job.steps[4], 'npm run quality:policy');
};
const isExactCompositeGateStep = (step) => hasExactKeys(step, ['name', 'run', 'shell'])
  && hasStepName(step) && step.shell === 'bash';

if (documentKind === 'composite') {
  if (!isPlainObject(workflow) || workflow?.runs?.using !== 'composite' || !Array.isArray(workflow.runs.steps)
    || Object.hasOwn(workflow, 'jobs') || Object.hasOwn(workflow, 'on')
    || Object.hasOwn(workflow, 'env') || Object.hasOwn(workflow, 'defaults')) {
    invalid = true;
  } else {
    stepGroups.push({ steps: workflow.runs.steps, isComposite: true });
  }
} else if (documentKind === 'workflow') {
  if (!isPlainObject(workflow) || !hasActiveTrigger(workflow) || !isPlainObject(workflow.jobs)
    || Object.keys(workflow.jobs).length === 0 || Object.hasOwn(workflow, 'runs')
    || Object.values(workflow.jobs).some((job) => !isPlainObject(job))) {
    invalid = true;
  } else {
    invalid ||= Object.hasOwn(workflow, 'defaults') || !hasOnlyAllowedInheritedEnv(workflow.env);
    for (const job of Object.values(workflow.jobs)) {
      if (Array.isArray(job?.steps)) stepGroups.push({ steps: job.steps, job, isComposite: false });
    }
  }
} else {
  invalid = true;
}

const lintLike = /\bnpm\s+run\s+lint(?:\b|:)/;
const policyLike = /\bnpm\s+run\s+quality:policy\b/;
const exactCommands = new Set(['npm run lint', 'npm run quality:policy']);
invalid ||= stepGroups.length === 0;
const occurrences = [];

for (const group of stepGroups) {
  const { steps } = group;
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    if (!isPlainObject(step) || typeof step.run !== 'string') continue;
    const commands = step.run.split(/\r?\n/).map((command) => command.trim()).filter(Boolean);
    const relevant = commands.some((command) => lintLike.test(command) || policyLike.test(command));
    if (!relevant) continue;
    if (commands.some((command) => !exactCommands.has(command))) {
      invalid = true;
      continue;
    }
    commands.forEach((command, commandIndex) => occurrences.push({ group, stepIndex, commandIndex, command }));
  }
}

const lintCommands = occurrences.filter(({ command }) => command === 'npm run lint');
const policyCommands = occurrences.filter(({ command }) => command === 'npm run quality:policy');
const adjacent = lintCommands.length === 1 && policyCommands.length === 1
  && lintCommands[0].group === policyCommands[0].group
  && ((lintCommands[0].stepIndex === policyCommands[0].stepIndex
      && policyCommands[0].commandIndex === lintCommands[0].commandIndex + 1)
    || (policyCommands[0].stepIndex === lintCommands[0].stepIndex + 1 && policyCommands[0].commandIndex === 0));
if (adjacent && documentKind === 'composite') {
  invalid ||= lintCommands[0].stepIndex !== 0 || lintCommands[0].commandIndex !== 0
    || policyCommands[0].stepIndex !== 0 || policyCommands[0].commandIndex !== 1
    || !isExactCompositeGateStep(lintCommands[0].group.steps[0]);
}
if (adjacent && documentKind === 'workflow') {
  invalid ||= lintCommands[0].stepIndex !== 3 || lintCommands[0].commandIndex !== 0
    || policyCommands[0].stepIndex !== 4 || policyCommands[0].commandIndex !== 0
    || !isExactWorkflowGateJob(lintCommands[0].group.job);
}
process.exit(invalid || !adjacent ? 1 : 0);
NODE
  then
    fail 'workflow-must-run-quality'
  fi
}

check_source_suppressions
check_eslint_config
check_package_scripts
check_workflow '.github/workflows/quality-checks/action.yml' composite
check_workflow '.github/workflows/docker.yml' workflow
check_workflow '.github/workflows/deploy.yml' workflow

echo 'First-party quality policy passed.'
