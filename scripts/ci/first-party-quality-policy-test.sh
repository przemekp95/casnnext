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
  printf '%s\n' 'strict-allow-scripts=true' >"$test_root/repo/.npmrc"
  printf '%s\n' '{"scripts":{"lint":"eslint . --ext .ts,.tsx,.js,.jsx,.cjs,.mjs,.mts,.cts --max-warnings 0","first-party-quality:policy":"bash scripts/ci/first-party-quality-policy.sh ."}}' >"$test_root/repo/package.json"
  printf '%s\n' \
    'import { defineConfig } from "eslint/config";' \
    'import nextCoreWebVitals from "eslint-config-next/core-web-vitals";' \
    'import nextTypescript from "eslint-config-next/typescript";' \
    '' \
    'export default defineConfig(' \
    '  { ignores: [".next/**", "node_modules/**", "coverage/**", "dist/**", "app/generated/**", "**/*.d.ts", "**/*.d.mts", "**/*.d.cts"] },' \
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
  printf '%s\n' 'export const mtsFixture = 1;' >"$test_root/repo/types/example.mts"
  printf '%s\n' 'export const ctsFixture = 1;' >"$test_root/repo/types/example.cts"
  printf '%s\n' '/* eslint-disable */' >"$test_root/repo/types/generated.d.mts"
  printf '%s\n' '/* eslint-disable */' >"$test_root/repo/types/generated.d.cts"
  mkdir -p "$test_root/repo/test/fake"
  printf '%s\n' '{"scripts":{"lint":"true","first-party-quality:policy":"true"}}' >"$test_root/repo/test/fake/package.json"
  printf '%s\n' 'export default {};' >"$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist/index.js"
  printf '%s\n' 'runs:' '  using: composite' '  steps:' '    - name: Lint and policy' '      run: |-' '        npm run lint' '        npm run quality:policy' '      shell: bash' >"$test_root/repo/.github/workflows/quality-checks/action.yml"
  printf '%s\n' \
    'on: { push: {} }' \
    'jobs:' \
    '  quality:' \
    '    runs-on: ubuntu-latest' \
    '    permissions: { contents: read }' \
    '    env: { CODECOV_TOKEN: test }' \
    '    steps:' \
    '      - name: Checkout repository' \
    '        uses: actions/checkout@v4' \
    '      - name: Setup Node.js' \
    '        uses: actions/setup-node@v4' \
    '        with: { node-version: "22", cache: npm }' \
    '      - name: Install immutable quality dependencies' \
    '        run: npm ci --ignore-scripts' \
    '      - name: Lint' \
    '        run: "npm run lint"' \
    '      - name: Policy' \
    "        run: 'npm run quality:policy'" >"$test_root/repo/.github/workflows/docker.yml"
  cp "$test_root/repo/.github/workflows/docker.yml" "$test_root/repo/.github/workflows/deploy.yml"
  git -C "$test_root/repo" add .
}

reset_fixture
(cd "$test_root" && "$policy" "$test_root/repo")

reset_fixture
printf '%s\n' 'script-shell=./test/fake/wrapper' >>"$test_root/repo/.npmrc"
git -C "$test_root/repo" add .
expect_rejected 'npm-execution-contract'

reset_fixture
node - "$test_root/repo/package.json" <<'NODE'
const fs = require('fs');
const packageFile = process.argv[2];
const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
packageJson.scripts.prelint = 'npm pkg set scripts.lint=true';
fs.writeFileSync(packageFile, `${JSON.stringify(packageJson)}\n`);
NODE
git -C "$test_root/repo" add .
expect_rejected 'npm-execution-contract'

reset_fixture
sed -i '/- name: Lint/i\      - name: Mutate package scripts\n        run: npm pkg set scripts.lint=true' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/- name: Lint/i\      - name: Persist Node preload\n        run: echo "NODE_OPTIONS=--require=./test/fake/wrapper.cjs" >> "$GITHUB_ENV"' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/- name: Lint/i\      - name: Prepend executable path\n        run: echo "./test/fake" >> "$GITHUB_PATH"' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/- name: Lint/i\      - name: Arbitrary predecessor action\n        uses: ./test/fake/action' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/uses: actions\/checkout@v4/a\        with: { ref: stale }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/with: { node-version: "22", cache: npm }/with: { node-version: "22", cache: npm, registry-url: https:\/\/registry.example.test }/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/npm ci --ignore-scripts/npm ci/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/  steps:/a\    - name: Mutate before composite gate\n      run: npm pkg set scripts.lint=true\n      shell: bash' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/runs-on: ubuntu-latest/a\    container: node:22' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/runs-on: ubuntu-latest/a\    strategy: { matrix: { node: [22] } }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/runs-on: ubuntu-latest/a\    services: { proxy: { image: attacker/image } }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/^on:/d' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
printf '%s\n' 'on: { push: {} }' 'jobs: []' >"$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/quality:/a\    if: false' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/quality:/a\    continue-on-error: true' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '1i env: { NODE_OPTIONS: --require=./test/fake/wrapper.cjs }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '1i env: { npm_config_script_shell: test/fake/wrapper }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/env: { CODECOV_TOKEN: test }/c\    env: { CODECOV_TOKEN: test, NODE_OPTIONS: --require=./test/fake/wrapper.cjs }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/env: { CODECOV_TOKEN: test }/c\    env: { CODECOV_TOKEN: test, npm_config_script_shell: test/fake/wrapper }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/quality:/a\    env: { PATH: /tmp }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '1i defaults: { run: { working-directory: test/fake } }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '1i defaults: { run: { shell: "bash -c cwd=test/fake {0}" } }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/quality:/a\    defaults: { run: { working-directory: test/fake } }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/quality:/a\    defaults: { run: { shell: "bash -c cwd=test/fake {0}" } }' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/run: "npm run lint"/a\        working-directory: test/fake' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/run: "npm run lint"/a\        shell: bash' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/runs-on:/d' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/runs-on: ubuntu-latest/runs-on: ""/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/runs-on: ubuntu-latest/runs-on: "${{ vars.RUNNER }}"/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/runs-on: ubuntu-latest/runs-on: self-hosted/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/runs-on: ubuntu-latest/a\    needs: prerequisite' "$test_root/repo/.github/workflows/docker.yml"
sed -i '1a\  prerequisite:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/using: composite/using: node20/' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
printf '%s\n' 'jobs:' '  quality:' '    steps:' '      - run: npm run lint' '      - run: npm run quality:policy' >"$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
printf '%s\n' 'runs:' '  using: composite' '  steps:' '    - run: npm run lint' '    - run: npm run quality:policy' '      shell: bash' >"$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

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
sed -i 's/"@next\/next\/no-img-element": "off"/"@next\/next\/no-img-element": 0/' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i 's/"@next\/next\/no-img-element": "off"/"@next\/next\/no-img-element": "off", "@next\/next\/no-css-tags": "error"/' "$test_root/repo/eslint.config.mjs"
git -C "$test_root/repo" add .
expect_rejected 'effective-eslint-config'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/directus/extensions/directus-extension-casn-field-guard/dist/index.js"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/app/page.tsx"
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
sed -i '1i /* eslint-disable */' "$test_root/repo/types/example.mts"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
sed -i '1i /* eslint-disable */' "$test_root/repo/types/example.cts"
git -C "$test_root/repo" add .
expect_rejected 'inline-eslint-directive'

reset_fixture
printf '%s\n' 'runs: [' >"$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '6i\        exit 0' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/shell: bash/i\      if: false' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '6c\        function lint() { npm run lint; }' "$test_root/repo/.github/workflows/quality-checks/action.yml"
sed -i '7c\        lint' "$test_root/repo/.github/workflows/quality-checks/action.yml"
sed -i '8i\        npm run quality:policy' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '6c\        bash -c "{ npm run lint; npm run quality:policy; }"' "$test_root/repo/.github/workflows/quality-checks/action.yml"
sed -i '7d' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/shell: bash/a\      uses: actions/checkout@v4' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

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
sed -i '/shell: bash/i\      if: false' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/npm run lint/npm run lint:fix/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i 's/npm run lint/npm run lint -- --fix/' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '/npm run quality:policy/d' "$test_root/repo/.github/workflows/docker.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

reset_fixture
sed -i '6c\        npm run quality:policy' "$test_root/repo/.github/workflows/quality-checks/action.yml"
sed -i '7c\        npm run lint' "$test_root/repo/.github/workflows/quality-checks/action.yml"
git -C "$test_root/repo" add .
expect_rejected 'workflow-must-run-quality'

echo 'First-party quality policy behavior passed.'
