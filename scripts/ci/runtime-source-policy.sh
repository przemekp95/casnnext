#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="${1:-.}"
readonly CHECK="${2:-all}"

fail() { echo "[runtime-policy] $1" >&2; exit 1; }
tracked() { git -C "$ROOT" ls-files --error-unmatch "$1" >/dev/null 2>&1; }

require_file() {
  local path="$1"
  [[ -f "$ROOT/$path" ]] || fail "required runtime file is missing: $path"
}

package_script() {
  local name="$1"
  node -e '
    const fs = require("fs");
    const [file, name] = process.argv.slice(1);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    process.stdout.write(pkg.scripts?.[name] ?? "");
  ' "$ROOT/package.json" "$name" 2>/dev/null || fail "package.json must be valid JSON."
}

tsconfig_option() {
  local name="$1"
  node -e '
    const fs = require("fs");
    const [file, name] = process.argv.slice(1);
    const tsconfig = JSON.parse(fs.readFileSync(file, "utf8"));
    const value = tsconfig.compilerOptions?.[name];
    process.stdout.write(value === undefined ? "" : String(value));
  ' "$ROOT/tsconfig.runtime.json" "$name" 2>/dev/null || fail "tsconfig.runtime.json must be valid JSON."
}

check_sources() {
  local source
  for source in \
    server.ts \
    lib/db.shared.ts \
    lib/server/startup-database.ts \
    lib/server/migration-policy.ts; do
    tracked "$source" || fail "required TypeScript runtime source must be tracked: $source"
  done

  local legacy
  for legacy in \
    lib/db.shared.js \
    lib/server/migration-policy.js \
    lib/server/startup-database.js \
    lib/db.node.js \
    lib/init-db.js; do
    if tracked "$legacy"; then
      fail "generated JavaScript source artifact must not be tracked: $legacy"
    fi
  done
}

check_build() {
  [[ "$(package_script build)" == 'npm run build:runtime && next build' ]] \
    || fail 'build must equal "npm run build:runtime && next build".'
  [[ "$(package_script build:runtime)" == 'tsc -p tsconfig.runtime.json' ]] \
    || fail 'build:runtime must equal "tsc -p tsconfig.runtime.json".'
  [[ "$(package_script start)" == 'node server.cjs' ]] \
    || fail 'start must equal "node server.cjs".'

  [[ "$(tsconfig_option rootDir)" == '.' ]] \
    || fail 'tsconfig.runtime.json compilerOptions.rootDir must equal ".".'
  [[ "$(tsconfig_option outDir)" == 'dist/runtime' ]] \
    || fail 'tsconfig.runtime.json compilerOptions.outDir must equal "dist/runtime".'
  [[ "$(tsconfig_option allowJs)" == 'false' ]] \
    || fail 'tsconfig.runtime.json compilerOptions.allowJs must equal false.'

  require_file .gitignore
  rg -Fx '/dist/runtime/' "$ROOT/.gitignore" >/dev/null \
    || fail '.gitignore must contain /dist/runtime/.'

  local artifact
  for artifact in \
    dist/runtime/server.js \
    dist/runtime/lib/db.shared.js \
    dist/runtime/lib/server/startup-database.js; do
    require_file "$artifact"
  done

  local generated_source
  for generated_source in \
    server.js \
    lib/db.shared.js \
    lib/server/migration-policy.js \
    lib/server/startup-database.js \
    lib/db.node.js \
    lib/init-db.js; do
    [[ ! -e "$ROOT/$generated_source" ]] \
      || fail "generated JavaScript source artifact must not exist: $generated_source"
  done
}

check_launcher() {
  require_file server.cjs
  if rg -Fq 'require(' "$ROOT/server.cjs"; then
    fail 'server.cjs must not contain require(.'
  fi
  rg -Fq './dist/runtime/server.js' "$ROOT/server.cjs" \
    || fail 'server.cjs must load ./dist/runtime/server.js.'
}

check_image() {
  require_file Dockerfile
  if rg -Fq '/app/lib' "$ROOT/Dockerfile" || rg -Fq '/app/migrations' "$ROOT/Dockerfile"; then
    fail 'Dockerfile must not copy /app/lib or /app/migrations.'
  fi
  rg -Fq '/app/server.cjs' "$ROOT/Dockerfile" \
    || fail 'Dockerfile must copy /app/server.cjs.'
  rg -Fq '/app/dist/runtime' "$ROOT/Dockerfile" \
    || fail 'Dockerfile must copy /app/dist/runtime.'
}

case "$CHECK" in
  sources)
    check_sources
    ;;
  build)
    check_build
    ;;
  launcher)
    check_launcher
    ;;
  image)
    check_image
    ;;
  all)
    check_sources
    check_build
    check_launcher
    check_image
    ;;
  *)
    fail "unsupported check: $CHECK"
    ;;
esac
