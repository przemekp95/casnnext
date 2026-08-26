#!/usr/bin/env bash
set -euo pipefail

readonly root="$1"
readonly source_paths=(app components lib scripts test cypress jest.setup.ts cypress.config.ts server.cjs)

fail() { printf '[first-party-quality] %s\n' "$1" >&2; exit 1; }

is_first_party_source() {
  local path="$1"
  local source_path
  for source_path in "${source_paths[@]}"; do
    if [[ "$source_path" == *.* ]]; then
      [[ "$path" == "$source_path" ]] && return 0
    elif [[ "$path" == "$source_path/"* ]]; then
      return 0
    fi
  done
  return 1
}

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
    is_first_party_source "$path" || continue
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
  mapfile -d '' -t configs < <(
    git -C "$root" ls-files -z -- \
      'eslint.config.js' 'eslint.config.cjs' 'eslint.config.mjs' 'eslint.config.ts' \
      '.eslintrc' '.eslintrc.js' '.eslintrc.cjs' '.eslintrc.mjs' '.eslintrc.json'
  )
  ((${#configs[@]})) || return

  local -a config_files=()
  local config
  for config in "${configs[@]}"; do
    config_files+=("$root/$config")
  done

  if ! node - "${config_files[@]}" <<'NODE'
const fs = require('fs');
const broadRuleDisable = /rules\s*:\s*\{[\s\S]*?["'][^"'\n]+["']\s*:\s*["']off["']/;
process.exit(process.argv.slice(2).some((file) => broadRuleDisable.test(fs.readFileSync(file, 'utf8'))) ? 1 : 0);
NODE
  then
    fail 'broad-rule-disable'
  fi
}

check_lint_script() {
  if ! node - "$root/package.json" <<'NODE'
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.exit(packageJson.scripts?.lint === 'eslint . --max-warnings 0' ? 0 : 1);
NODE
  then
    fail 'lint-must-reject-warnings'
  fi
}

check_workflow() {
  local workflow="$1"
  [[ -f "$root/$workflow" ]] || fail 'workflow-must-run-quality'

  if rg -n -- '--fix|--write' "$root/$workflow"; then
    fail 'workflow-must-not-rewrite'
  fi

  if ! rg -Fq 'npm run lint' "$root/$workflow" || ! rg -Fq 'npm run quality:policy' "$root/$workflow"; then
    fail 'workflow-must-run-quality'
  fi
}

check_source_suppressions
check_eslint_config
check_lint_script
check_workflow '.github/workflows/quality-checks/action.yml'
check_workflow '.github/workflows/docker.yml'
check_workflow '.github/workflows/deploy.yml'

echo 'First-party quality policy passed.'
