#!/usr/bin/env bash
set -euo pipefail

readonly policy="$(cd "$(dirname "$0")" && pwd)/first-party-quality-policy.sh"
readonly test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT

expect_rejected() {
  local diagnostic="$1"
  if "$policy" "$test_root/repo" >"$test_root/out" 2>"$test_root/err"; then
    printf 'Policy unexpectedly accepted: %s\n' "$diagnostic" >&2
    exit 1
  fi
  rg -Fq "[first-party-quality] $diagnostic" "$test_root/err"
}

reset_fixture() {
  rm -rf "$test_root/repo"
  mkdir -p "$test_root/repo/app" "$test_root/repo/test" \
    "$test_root/repo/scripts" "$test_root/repo/.github/workflows/quality-checks" \
    "$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist"
  git -C "$test_root/repo" init -q
  printf '%s\n' '{"scripts":{"lint":"eslint . --max-warnings 0"}}' >"$test_root/repo/package.json"
  printf '%s\n' \
    'export default [' \
    '  { ignores: [".next/**", "node_modules/**", "coverage/**", "dist/**", "app/generated/**", "**/*.d.ts"] },' \
    '];' >"$test_root/repo/eslint.config.mjs"
  printf '%s\n' 'export default function Page() { return null; }' >"$test_root/repo/app/page.tsx"
  printf '%s\n' "it('renders', () => { expect(true).toBe(true); });" >"$test_root/repo/test/page.test.tsx"
  printf '%s\n' 'export const value = 1;' >"$test_root/repo/scripts/tool.ts"
  printf '%s\n' 'export default {};' >"$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist/index.js"
  printf '%s\n' 'runs:' '  using: composite' '  steps:' '    - run: npm run lint' '      shell: bash' '    - run: npm run quality:policy' '      shell: bash' >"$test_root/repo/.github/workflows/quality-checks/action.yml"
  printf '%s\n' 'jobs:' '  quality:' '    steps:' '      - run: npm run lint' '      - run: npm run quality:policy' >"$test_root/repo/.github/workflows/docker.yml"
  cp "$test_root/repo/.github/workflows/docker.yml" "$test_root/repo/.github/workflows/deploy.yml"
  git -C "$test_root/repo" add .
}

reset_fixture
"$policy" "$test_root/repo"

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/app/page.tsx"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist/index.js"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i 's/it(/it.skip(/' "$test_root/repo/test/page.test.tsx"
git -C "$test_root/repo" add .
expect_rejected 'focused-or-skipped-test'

reset_fixture
printf '%s\n' "describe.only('x', () => {});" >>"$test_root/repo/test/page.test.tsx"
git -C "$test_root/repo" add .
expect_rejected 'focused-or-skipped-test'

reset_fixture
printf '%s\n' "(hasComponent ? describe : describe.skip)('x', () => {});" >>"$test_root/repo/test/page.test.tsx"
git -C "$test_root/repo" add .
expect_rejected 'conditional-suite'

reset_fixture
printf '%s\n' 'if (element) expect(element).toBeVisible();' >>"$test_root/repo/test/page.test.tsx"
git -C "$test_root/repo" add .
expect_rejected 'conditional-assertion'

reset_fixture
sed -i '$i\  { files: ["test/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'broad-rule-disable'

reset_fixture
sed -i 's/eslint . --max-warnings 0/eslint ./' "$test_root/repo/package.json"
git -C "$test_root/repo" add .
expect_rejected 'lint-must-reject-warnings'

reset_fixture
sed -i 's/npm run lint/npm run lint -- --fix/' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-not-rewrite'

reset_fixture
sed -i 's/npm run lint/npm run lint:fix/' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/npm run quality:policy/d' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

echo 'First-party quality policy behavior passed.'
