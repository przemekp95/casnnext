#!/usr/bin/env bash

casn_process_stat_failure_status() {
  local pid="$1"
  local proc_root="$2"
  local process_root="$proc_root/$pid"
  local stat_path="$process_root/stat"

  if [[ -e "$stat_path" || -L "$stat_path" \
    || -e "$process_root" || -L "$process_root" ]]; then
    return 2
  fi
  return 1
}

casn_read_process_identity() {
  local pid="$1"
  local proc_root="${2:-/proc}"
  local stat_line
  local stat_fields
  local -a fields
  local start_time
  local process_group
  local parent_pid
  local session_id

  [[ "$pid" =~ ^[0-9]+$ ]] || return 2
  if ! IFS= read -r stat_line 2>/dev/null <"$proc_root/$pid/stat"; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi
  if [[ "$stat_line" != "$pid ("*") "* ]]; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi

  stat_fields="${stat_line##*) }"
  if [[ "$stat_fields" == "$stat_line" ]]; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi
  read -r -a fields <<<"$stat_fields"
  if ((${#fields[@]} < 20)); then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi

  parent_pid="${fields[1]}"
  process_group="${fields[2]}"
  session_id="${fields[3]}"
  start_time="${fields[19]}"
  if [[ ! "$start_time" =~ ^[0-9]+$ \
    || ! "$process_group" =~ ^[0-9]+$ \
    || ! "$parent_pid" =~ ^[0-9]+$ \
    || ! "$session_id" =~ ^[0-9]+$ ]]; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi

  printf '%s %s %s %s\n' "$start_time" "$process_group" "$parent_pid" "$session_id"
}

casn_process_identity_matches() {
  local pid="$1"
  local expected_start_time="$2"
  local expected_process_group="$3"
  local expected_parent_pid="$4"
  local expected_session_id="$5"
  local proc_root="${6:-/proc}"
  local current_identity
  local read_status

  if current_identity="$(casn_read_process_identity "$pid" "$proc_root")"; then
    :
  else
    read_status=$?
    return "$read_status"
  fi
  [[ "$current_identity" == \
    "$expected_start_time $expected_process_group $expected_parent_pid $expected_session_id" ]]
}

casn_read_process_state() {
  local pid="$1"
  local proc_root="${2:-/proc}"
  local stat_line
  local stat_fields

  [[ "$pid" =~ ^[0-9]+$ ]] || return 2
  if ! IFS= read -r stat_line 2>/dev/null <"$proc_root/$pid/stat"; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi
  if [[ "$stat_line" != "$pid ("*") "* ]]; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi
  stat_fields="${stat_line##*) }"
  if [[ "$stat_fields" == "$stat_line" ]]; then
    casn_process_stat_failure_status "$pid" "$proc_root"
    return $?
  fi
  printf '%s\n' "${stat_fields%% *}"
}

casn_process_group_membership_status() {
  local expected_process_group="$1"
  local expected_session_id="$2"
  local excluded_pid="$3"
  local proc_root="${4:-/proc}"
  local process_root
  local pid
  local process_group
  local session_id
  local identity
  local identity_status
  local unknown=0

  [[ "$expected_process_group" =~ ^[0-9]+$ \
    && "$expected_session_id" =~ ^[0-9]+$ \
    && "$excluded_pid" =~ ^[0-9]+$ ]] || return 2

  for process_root in "$proc_root"/[0-9]*; do
    [[ -e "$process_root" || -L "$process_root" ]] || continue
    pid="${process_root##*/}"
    [[ "$pid" == "$excluded_pid" ]] && continue
    if identity="$(casn_read_process_identity "$pid" "$proc_root")"; then
      read -r _ process_group _ session_id <<<"$identity"
    else
      identity_status=$?
      if ((identity_status == 1)); then
        continue
      fi
      unknown=1
      continue
    fi
    if [[ "$process_group" == "$expected_process_group" && "$session_id" == "$expected_session_id" ]]; then
      return 0
    fi
  done
  ((unknown == 0)) || return 2
  return 1
}

casn_process_group_has_members() {
  local expected_process_group="$1"
  local expected_session_id="$2"
  local excluded_pid="$3"
  local proc_root="${4:-/proc}"
  local membership_status

  [[ "$expected_process_group" =~ ^[0-9]+$ \
    && "$expected_session_id" =~ ^[0-9]+$ \
    && "$excluded_pid" =~ ^[0-9]+$ ]] || return 2
  if casn_process_group_membership_status \
    "$expected_process_group" "$expected_session_id" "$excluded_pid" "$proc_root"; then
    return 0
  else
    membership_status=$?
  fi
  case "$membership_status" in
    1)
      return 1
      ;;
    2)
      # Boolean callers must not turn unknown membership into confirmed absence.
      return 0
      ;;
    *)
      return 2
      ;;
  esac
}
