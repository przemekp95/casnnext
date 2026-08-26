#!/usr/bin/env bash
set -euo pipefail

readonly policy="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/runtime-source-policy.sh"
readonly test_root="$(mktemp -d)"
readonly fixture="$test_root/fixture"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

create_fixture() {
  rm -rf "$fixture"
  mkdir -p "$fixture/lib/server" "$fixture/dist/runtime/lib/server"

  git -C "$fixture" init -q
  git -C "$fixture" config user.email 'runtime-policy@example.test'
  git -C "$fixture" config user.name 'Runtime policy fixture'

  cat >"$fixture/package.json" <<'JSON'
{
  "scripts": {
    "build": "npm run build:runtime && next build",
    "build:runtime": "tsc -p tsconfig.runtime.json",
    "start": "node server.cjs"
  }
}
JSON

  cat >"$fixture/tsconfig.runtime.json" <<'JSON'
{
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist/runtime",
    "allowJs": false
  }
}
JSON

  cat >"$fixture/.gitignore" <<'EOF'
/dist/runtime/
EOF

  cat >"$fixture/server.ts" <<'EOF'
export {};
EOF

  cat >"$fixture/server.cjs" <<'EOF'
void import('./dist/runtime/server.js');
EOF

  cat >"$fixture/lib/db.shared.ts" <<'EOF'
export {};
EOF

  cat >"$fixture/lib/server/startup-database.ts" <<'EOF'
export {};
EOF

  cat >"$fixture/lib/server/migration-policy.ts" <<'EOF'
export {};
EOF

  cat >"$fixture/Dockerfile" <<'EOF'
COPY server.cjs /app/server.cjs
COPY --from=builder /app/dist/runtime /app/dist/runtime
EOF

  touch "$fixture/dist/runtime/server.js"
  touch "$fixture/dist/runtime/lib/db.shared.js"
  touch "$fixture/dist/runtime/lib/server/startup-database.js"

  git -C "$fixture" add package.json tsconfig.runtime.json .gitignore server.ts server.cjs Dockerfile \
    lib/db.shared.ts lib/server/startup-database.ts lib/server/migration-policy.ts
  git -C "$fixture" commit -qm 'valid runtime fixture'
}

expect_rejected() {
  local expected_message="$1"
  local check="$2"
  if "$policy" "$fixture" "$check" >"$test_root/out" 2>"$test_root/err"; then
    echo "Policy unexpectedly accepted: $expected_message" >&2
    exit 1
  fi
  grep -F "$expected_message" "$test_root/err" >/dev/null
}

create_fixture
"$policy" "$fixture" all

create_fixture
node -e '
  const fs = require("fs");
  const file = process.argv[1];
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.scripts["build:runtime"] = "tsc -p tsconfig.runtime.json --outDir .";
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
' "$fixture/package.json"
expect_rejected 'build:runtime must equal "tsc -p tsconfig.runtime.json".' build

for legacy_path in \
  lib/db.shared.js \
  lib/server/migration-policy.js \
  lib/server/startup-database.js \
  lib/db.node.js \
  lib/init-db.js; do
  create_fixture
  touch "$fixture/$legacy_path"
  git -C "$fixture" add "$legacy_path"
  expect_rejected "generated JavaScript source artifact must not be tracked: $legacy_path" sources
done

create_fixture
printf "const runtime = require('./dist/runtime/server.js');\n" >>"$fixture/server.cjs"
expect_rejected 'server.cjs must not contain require(.' launcher

create_fixture
printf "const runtime = require ('./dist/runtime/server.js');\n" >>"$fixture/server.cjs"
expect_rejected 'server.cjs must not contain require(.' launcher

create_fixture
printf "void import('./dist/runtime/not-server.js');\n" >"$fixture/server.cjs"
expect_rejected 'server.cjs must load ./dist/runtime/server.js.' launcher

create_fixture
printf "// void import('./dist/runtime/server.js');\n" >"$fixture/server.cjs"
expect_rejected 'server.cjs must load ./dist/runtime/server.js.' launcher

create_fixture
printf "const runtimePath = './dist/runtime/server.js';\n" >"$fixture/server.cjs"
expect_rejected 'server.cjs must load ./dist/runtime/server.js.' launcher

create_fixture
printf "launcher.import('./dist/runtime/server.js');\n" >"$fixture/server.cjs"
expect_rejected 'server.cjs must load ./dist/runtime/server.js.' launcher

create_fixture
printf 'COPY lib /app/lib\n' >>"$fixture/Dockerfile"
expect_rejected 'Dockerfile must not copy /app/lib or /app/migrations.' image

create_fixture
printf 'COPY migrations /app/migrations\n' >>"$fixture/Dockerfile"
expect_rejected 'Dockerfile must not copy /app/lib or /app/migrations.' image

create_fixture
printf 'COPY server.cjs /app/server.cjs\n' >"$fixture/Dockerfile"
expect_rejected 'Dockerfile must copy /app/dist/runtime.' image

echo 'Runtime source policy behavior passed.'
