#!/usr/bin/env bash

set -euo pipefail

die() {
  printf 'snapshot: %s\n' "$*" >&2
  return 1
}

require_snapshot_id() {
  [[ "${1-}" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || die 'invalid snapshot id'
}

require_loopback_host() {
  [[ "${1-}" == 127.0.0.1 || "${1-}" == localhost || "${1-}" == ::1 ]] ||
    die 'target host is not loopback'
}

require_local_database_name() {
  [[ "${1-}" == casn_local || "${1-}" =~ ^casn_local_[a-z0-9_]+$ ]] ||
    die 'unsafe local database name'
}

require_digest_ref() {
  [[ "${1-}" =~ ^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$ ]] ||
    die 'image is not digest pinned'
}

require_owner_only_file() {
  local path="${1-}" mode
  [[ -n "$path" && -f "$path" && ! -L "$path" ]] || die 'path is not a regular file'
  mode="$(stat -c '%a' -- "$path")"
  [[ "$mode" == 600 || "$mode" == 400 ]] || die 'file permissions must be 600 or 400'
}

require_empty_directory() {
  local path="${1-}" resolved detected_repository_root
  [[ -n "$path" && -d "$path" && ! -L "$path" ]] || die 'path is not a directory'
  resolved="$(realpath -e -- "$path")"
  [[ "$resolved" != / ]] || die 'filesystem root is not an allowed target'

  detected_repository_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$detected_repository_root" ]]; then
    detected_repository_root="$(realpath -e -- "$detected_repository_root")"
    [[ "$resolved" != "$detected_repository_root" && "$resolved" != "$detected_repository_root/"* ]] ||
      die 'repository paths are not allowed targets'
  fi

  [[ -z "$(find "$resolved" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
    die 'target directory is not empty'
}

sha256_value() {
  printf %s "${1-}" | sha256sum | awk '{print $1}'
}
