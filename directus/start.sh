#!/bin/sh
set -eu

directus_cli_js="${DIRECTUS_CLI_JS:-/directus/cli.js}"
bootstrap_script="${DIRECTUS_BOOTSTRAP_SCRIPT:-/directus/bootstrap.cjs}"
ready_marker="${DIRECTUS_READY_MARKER:-/directus/.casn_bootstrapped}"
directus_pid=""

cleanup() {
  rm -f "$ready_marker"
  if [ -n "$directus_pid" ] && kill -0 "$directus_pid" 2>/dev/null; then
    kill "$directus_pid" 2>/dev/null || true
    wait "$directus_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

rm -f "$ready_marker"

if [ ! -f "$directus_cli_js" ]; then
  echo "Directus CLI is unavailable at $directus_cli_js" >&2
  exit 1
fi

if [ "${DIRECTUS_CLI_PREFLIGHT_ONLY:-0}" = "1" ]; then
  node "$directus_cli_js" --version
  exit 0
fi

node "$directus_cli_js" bootstrap
node "$directus_cli_js" start &
directus_pid="$!"

node "$bootstrap_script"

if ! kill -0 "$directus_pid" 2>/dev/null; then
  if wait "$directus_pid"; then
    exit 0
  else
    exit "$?"
  fi
fi

touch "$ready_marker"
wait "$directus_pid"
