#!/usr/bin/env bash

casn_registry_invocation_is_valid() {
  [[ "$1" =~ ^[0-9a-f]{32}$ ]]
}

casn_registry_role_is_valid() {
  [[ "$1" =~ ^[a-z][a-z0-9-]{0,31}$ ]]
}

casn_registry_directory_is_valid() {
  local registry="$1"
  local registry_invocation="$2"

  casn_registry_invocation_is_valid "$registry_invocation" || return 1
  [[ "$registry" =~ ^/tmp/casn-quality-regression\.[A-Za-z0-9]+/registry\.$registry_invocation$ \
    && -d "$registry" && ! -L "$registry" ]]
}

casn_registry_read_entry() {
  local entry="$1"
  local registry="$2"
  local expected_invocation_id="$3"
  local line
  local pattern

  casn_registry_directory_is_valid "$registry" "$expected_invocation_id" || return 1
  [[ "$entry" == "$registry"/entry.* && -f "$entry" && ! -L "$entry" ]] || return 1
  IFS= read -r line 2>/dev/null <"$entry" || return 1
  [[ -n "$line" ]] || return 1
  [[ "$(wc -l <"$entry")" -eq 1 ]] || return 1
  pattern=$'^v1\t([0-9a-f]{32})\t([0-9]+)\t([0-9]+)\t([0-9]+)\t([0-9]+)\t([0-9]+)\t([a-z][a-z0-9-]{0,31})$'
  [[ "$line" =~ $pattern ]] || return 1
  [[ "${BASH_REMATCH[1]}" == "$expected_invocation_id" ]] || return 1
  printf '%s %s %s %s %s %s\n' \
    "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}" \
    "${BASH_REMATCH[5]}" "${BASH_REMATCH[6]}" "${BASH_REMATCH[7]}"
}

casn_registry_write_identity() {
  local registry="$1"
  local registry_invocation="$2"
  local pid="$3"
  local identity="$4"
  local role="$5"
  local start_time
  local process_group
  local parent_pid
  local session_id
  local pending
  local entry
  local recorded

  casn_registry_directory_is_valid "$registry" "$registry_invocation" || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  casn_registry_role_is_valid "$role" || return 1
  read -r start_time process_group parent_pid session_id <<<"$identity"
  [[ "$start_time" =~ ^[0-9]+$ && "$process_group" =~ ^[0-9]+$ \
    && "$parent_pid" =~ ^[0-9]+$ && "$session_id" =~ ^[0-9]+$ ]] || return 1
  casn_process_identity_matches \
    "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id" || return 1

  pending="$(mktemp "$registry/.pending.XXXXXX")" || return 1
  chmod 0600 "$pending" || {
    rm -f -- "$pending"
    return 1
  }
  printf 'v1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$registry_invocation" "$pid" "$start_time" "$parent_pid" \
    "$process_group" "$session_id" "$role" >"$pending" || {
      rm -f -- "$pending"
      return 1
    }
  entry="$registry/entry.$pid.$start_time.${pending##*.}"
  [[ ! -e "$entry" ]] || {
    rm -f -- "$pending"
    return 1
  }
  mv -- "$pending" "$entry" || {
    rm -f -- "$pending"
    return 1
  }
  recorded="$(casn_registry_read_entry "$entry" "$registry" "$registry_invocation")" || return 1
  [[ "$recorded" == "$pid $start_time $parent_pid $process_group $session_id $role" ]] \
    || return 1
  casn_process_identity_matches \
    "$pid" "$start_time" "$process_group" "$parent_pid" "$session_id" || return 1
  printf '%s\n' "$entry"
}

casn_registry_write_current_process() {
  local registry="$1"
  local registry_invocation="$2"
  local role="$3"
  local pid="$BASHPID"
  local identity

  identity="$(casn_read_process_identity "$pid")" || return 1
  casn_registry_write_identity "$registry" "$registry_invocation" "$pid" "$identity" "$role"
}
