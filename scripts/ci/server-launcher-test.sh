#!/usr/bin/env bash
set -euo pipefail

readonly test_root="$(mktemp -d)"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

cp server.cjs "$test_root/server.cjs"

set +e
node "$test_root/server.cjs" >"$test_root/missing.out" 2>"$test_root/missing.err"
missing_status=$?
set -e
test "$missing_status" -ne 0
grep -F 'Failed to load compiled runtime:' "$test_root/missing.err" >/dev/null

mkdir -p "$test_root/dist/runtime"
printf '%s\n' \
  "const fs = require('node:fs');" \
  "fs.writeFileSync(process.env.LAUNCH_MARKER, 'loaded');" \
  >"$test_root/dist/runtime/server.js"
LAUNCH_MARKER="$test_root/marker" node "$test_root/server.cjs"
test "$(cat "$test_root/marker")" = loaded

echo 'Server launcher behavior passed.'
