#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo 'Usage: assert-no-deployment-db-mutation.sh FILE...' >&2
  exit 2
fi

readonly forbidden_pattern='migration:(run|revert)|RUN_DB_MIGRATIONS|DB_MIGRATION_CONFIRM|directus[[:space:]]+(bootstrap|schema)'

for target in "$@"; do
  if [[ ! -f "$target" ]]; then
    echo "Deployment mutation policy target does not exist: $target" >&2
    exit 2
  fi
  if rg -ni -- "$forbidden_pattern" "$target"; then
    echo "Deployment path must not mutate application migrations or Directus schema: $target" >&2
    exit 1
  fi
done

echo 'Deployment database-mutation boundary passed.'
