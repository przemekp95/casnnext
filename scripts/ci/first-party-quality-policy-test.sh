#!/usr/bin/env bash
set -euo pipefail

policy_dir="$(cd "$(dirname "$0")" && pwd)"
readonly policy_dir
readonly policy="$policy_dir/first-party-quality-policy.sh"
source_root="$(cd "$policy_dir/../.." && pwd)"
readonly source_root
test_root="$(mktemp -d)"
readonly test_root
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
  mkdir -p "$test_root/repo"/{app,test/__mocks__,scripts,migrations,types} \
    "$test_root/repo/.github/workflows/quality-checks" \
    "$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist"
  ln -s "$source_root/node_modules" "$test_root/repo/node_modules"
  git -C "$test_root/repo" init -q
  printf '%s\n' '{"scripts":{"lint":"eslint . --ext .ts,.tsx,.js,.jsx,.cjs --max-warnings 0","first-party-quality:policy":"bash scripts/ci/first-party-quality-policy.sh ."}}' >"$test_root/repo/package.json"
  printf '%s\n' \
    'import { defineConfig } from "eslint/config";' \
    'import nextCoreWebVitals from "eslint-config-next/core-web-vitals";' \
    'import nextTypescript from "eslint-config-next/typescript";' \
    '' \
    'export default defineConfig(' \
    '  { ignores: [".next/**", "node_modules/**", "coverage/**", "dist/**", "app/generated/**", "**/*.d.ts"] },' \
    '  ...nextCoreWebVitals,' \
    '  ...nextTypescript,' \
    '  {' \
    '    name: "casn/strict-first-party",' \
    '    rules: {' \
    '      "@typescript-eslint/no-explicit-any": "error",' \
    '      "@typescript-eslint/no-require-imports": "error",' \
    '      "@typescript-eslint/no-unused-vars": "error",' \
    '      "@typescript-eslint/ban-ts-comment": "error",' \
    '      "@typescript-eslint/no-var-requires": "error",' \
    '      "@next/next/no-assign-module-variable": "error",' \
    '      "@next/next/no-css-tags": "error",' \
    '      "@next/next/no-img-element": "error",' \
    '    },' \
    '  },' \
    '  {' \
    '    name: "casn/react-hook-supported-files",' \
    '    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],' \
    '    rules: { "react-hooks/error-boundaries": "error", "react-hooks/set-state-in-effect": "error" },' \
    '  },' \
    '  {' \
    '    name: "casn/next-image-mock",' \
    '    files: ["test/__mocks__/nextImageMock.tsx"],' \
    '    rules: { "@next/next/no-img-element": "off" },' \
    '  },' \
    ');' >"$test_root/repo/eslint.config.mjs"
  printf '%s\n' 'export default function Page() { return null; }' >"$test_root/repo/app/page.tsx"
  printf '%s\n' "it('renders', () => { expect(true).toBe(true); });" >"$test_root/repo/test/page.test.tsx"
  printf '%s\n' 'export default function NextImageMock() { return <img alt="" />; }' >"$test_root/repo/test/__mocks__/nextImageMock.tsx"
  printf '%s\n' 'export const value = 1;' >"$test_root/repo/scripts/tool.ts"
  printf '%s\n' 'export const migration = 1;' >"$test_root/repo/migrations/example.ts"
  printf '%s\n' 'export type FixtureType = string;' >"$test_root/repo/types/example.ts"
  printf '%s\n' 'export default {};' >"$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist/index.js"
  printf '%s\n' 'runs:' '  using: composite' '  steps:' '    - name: Lint and policy' '      run: |' '        npm run lint' '        npm run quality:policy' '      shell: bash' >"$test_root/repo/.github/workflows/quality-checks/action.yml"
  printf '%s\n' 'jobs:' '  quality:' '    steps:' '      - name: Lint' '        run: npm run lint' '      - name: Policy' '        run: npm run quality:policy' >"$test_root/repo/.github/workflows/docker.yml"
  cp "$test_root/repo/.github/workflows/docker.yml" "$test_root/repo/.github/workflows/deploy.yml"
  git -C "$test_root/repo" add .
}

reset_fixture
"$policy" "$test_root/repo"

reset_fixture
sed -i 's/ --max-warnings 0/ --max-warnings 0 || true/' "$test_root/repo/package.json"
git -C "$test_root/repo" add .
expect_rejected 'lint-must-reject-warnings'

reset_fixture
sed -i 's/ --max-warnings 0/ --quiet --max-warnings 0/' "$test_root/repo/package.json"
git -C "$test_root/repo" add .
expect_rejected 'lint-must-reject-warnings'

reset_fixture
sed -i 's/--max-warnings 0/--max-warnings 1/' "$test_root/repo/package.json"
git -C "$test_root/repo" add .
expect_rejected 'lint-must-reject-warnings'

reset_fixture
sed -i 's/ --max-warnings 0/ --ignore-pattern migrations\/\*\* --max-warnings 0/' "$test_root/repo/package.json"
git -C "$test_root/repo" add .
expect_rejected 'lint-must-reject-warnings'

reset_fixture
sed -i 's#bash scripts/ci/first-party-quality-policy.sh \.#true#' "$test_root/repo/package.json"
git -C "$test_root/repo" add .
expect_rejected 'first-party-policy-alias'

reset_fixture
sed -i '$i\  { name: "casn/next-image-mock", files: ["test/__mocks__/nextImageMock.tsx"], rules: { "@next/next/no-img-element": 0 } },' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i '$i\  { name: "casn/warn-any", rules: { "@typescript-eslint/no-explicit-any": "warn" } },' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i '$i\  { name: "casn/next-image-mock", files: ["test/__mocks__/nextImageMock.tsx"], rules: { "@next/next/no-img-element": "off" } },' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i '$i\  { name: "casn/moved-image-mock", files: ["test/page.test.tsx"], rules: { "@next/next/no-img-element": "off" } },' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i '$i\  { name: "casn/spread-image-disable", rules: { ...{ ["@next/next/no-img-element"]: 0 } } },' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist/index.js"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/migrations/example.ts"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/types/example.ts"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i 's/npm run quality:policy/npm run quality:policy || true/' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/npm run quality:policy/npm run quality:policy # required/' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/npm run quality:policy/QUALITY=1 npm run quality:policy/' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/run: |/a\      if: false' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/npm run lint/npm run lint:fix/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '6c\        npm run quality:policy' "$test_root/repo/.github/workflows/quality-checks/action.yml"
sed -i '7c\        npm run lint' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

echo 'First-party quality policy behavior passed.'
