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
  [[ ! -e "$entry" && ! -L "$entry" ]] || {
    rm -f -- "$pending"
    return 1
  }
  ln -- "$pending" "$entry" || {
    rm -f -- "$pending"
    return 1
  }
  rm -f -- "$pending" || return 1
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

casn_registry_contains_identity_role() {
  local registry="$1"
  local registry_invocation="$2"
  local expected_pid="$3"
  local expected_identity="$4"
  local expected_role="$5"
  local expected_start_time
  local expected_process_group
  local expected_parent_pid
  local expected_session_id
  local entry
  local record
  local pid
  local start_time
  local parent_pid
  local process_group
  local session_id
  local role

  casn_registry_directory_is_valid "$registry" "$registry_invocation" || return 2
  [[ "$expected_pid" =~ ^[0-9]+$ ]] || return 2
  casn_registry_role_is_valid "$expected_role" || return 2
  read -r expected_start_time expected_process_group expected_parent_pid expected_session_id \
    <<<"$expected_identity"
  [[ "$expected_start_time" =~ ^[0-9]+$ \
    && "$expected_process_group" =~ ^[0-9]+$ \
    && "$expected_parent_pid" =~ ^[0-9]+$ \
    && "$expected_session_id" =~ ^[0-9]+$ ]] || return 2

  for entry in "$registry"/entry.*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    record="$(casn_registry_read_entry "$entry" "$registry" "$registry_invocation")" \
      || return 2
    read -r pid start_time parent_pid process_group session_id role <<<"$record"
    if [[ "$pid" == "$expected_pid" && "$start_time" == "$expected_start_time" \
      && "$parent_pid" == "$expected_parent_pid" \
      && "$process_group" == "$expected_process_group" \
      && "$session_id" == "$expected_session_id" && "$role" == "$expected_role" ]]; then
      return 0
    fi
  done
  return 1
}

casn_registered_ready_record_matches() {
  local record_file="$1"
  local registry_invocation="$2"
  local expected_pid="$3"
  local expected_identity="$4"
  local expected_role="$5"
  local line

  [[ "$record_file" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.[a-z-]+$ \
    && -f "$record_file" && ! -L "$record_file" ]] || return 1
  IFS= read -r line 2>/dev/null <"$record_file" || return 2
  [[ "$(wc -l <"$record_file")" -eq 1 ]] || return 2
  [[ "$line" == "v1"$'\t'"$registry_invocation"$'\t'"$expected_pid"$'\t'"$expected_identity"$'\t'"$expected_role" ]] \
    || return 2
}

casn_waited_identity=''
casn_wait_for_registered_ready_record() {
  local registry="$1"
  local registry_invocation="$2"
  local pid="$3"
  local expected_parent_pid="$4"
  local role="$5"
  local record_file="$6"
  local require_group_leader="$7"
  local max_attempts="$8"
  local wait_fd="$9"
  local attempt
  local current_identity
  local current_start_time
  local current_process_group
  local current_parent_pid
  local current_session_id
  local read_status
  local registry_status
  local process_state
  local state_status

  casn_waited_identity=''
  [[ "$pid" =~ ^[0-9]+$ && "$expected_parent_pid" =~ ^[0-9]+$ \
    && "$require_group_leader" =~ ^[01]$ && "$max_attempts" =~ ^[0-9]+$ \
    && "$max_attempts" -gt 0 && "$wait_fd" =~ ^[0-9]+$ ]] || return 2
  casn_registry_role_is_valid "$role" || return 2
  for ((attempt = 0; attempt < max_attempts; attempt += 1)); do
    if current_identity="$(casn_read_process_identity "$pid")"; then
      read -r current_start_time current_process_group current_parent_pid current_session_id \
        <<<"$current_identity"
      if process_state="$(casn_read_process_state "$pid")"; then
        [[ "$process_state" != 'Z' ]] || return 1
      else
        state_status=$?
        ((state_status == 1)) && return 1
        return 2
      fi
      [[ "$current_parent_pid" == "$expected_parent_pid" ]] || return 1
      if [[ "$require_group_leader" == '1' \
        && ("$current_process_group" != "$pid" || "$current_session_id" != "$pid") ]]; then
        read -r -t 0.01 _ <&"$wait_fd" || true
        continue
      fi
      if [[ -z "$casn_waited_identity" ]]; then
        casn_waited_identity="$current_identity"
      elif [[ "$current_identity" != "$casn_waited_identity" ]]; then
        return 1
      fi
      if casn_registry_contains_identity_role \
        "$registry" "$registry_invocation" "$pid" "$casn_waited_identity" "$role"; then
        if [[ -L "$record_file" ]]; then
          return 2
        fi
        if [[ -e "$record_file" ]]; then
          casn_registered_ready_record_matches \
            "$record_file" "$registry_invocation" "$pid" "$casn_waited_identity" "$role" \
            || return 2
          casn_process_identity_matches \
            "$pid" "$current_start_time" "$current_process_group" \
            "$current_parent_pid" "$current_session_id" || return 2
          return 0
        fi
      else
        registry_status=$?
        ((registry_status == 1)) || return 2
      fi
    else
      read_status=$?
      ((read_status == 1)) && return 1
      return 2
    fi
    read -r -t 0.01 _ <&"$wait_fd" || true
  done
  return 3
}
