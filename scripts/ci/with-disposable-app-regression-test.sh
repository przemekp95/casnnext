#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly repository_root
readonly tsx_bin="$repository_root/node_modules/.bin/tsx"
[[ -x "$tsx_bin" ]] || {
  printf 'repository-local tsx is unavailable; run npm ci\n' >&2
  exit 69
}
cd "$repository_root"
exec "$tsx_bin" "$repository_root/scripts/ci/disposable-lifecycle/cli.ts" "$@"
