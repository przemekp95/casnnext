#!/usr/bin/env bash

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

  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  IFS= read -r stat_line 2>/dev/null <"$proc_root/$pid/stat" || return 1
  [[ "$stat_line" == "$pid ("*") "* ]] || return 1

  stat_fields="${stat_line##*) }"
  [[ "$stat_fields" != "$stat_line" ]] || return 1
  read -r -a fields <<<"$stat_fields"
  ((${#fields[@]} >= 20)) || return 1

  parent_pid="${fields[1]}"
  process_group="${fields[2]}"
  session_id="${fields[3]}"
  start_time="${fields[19]}"
  [[ "$start_time" =~ ^[0-9]+$ \
    && "$process_group" =~ ^[0-9]+$ \
    && "$parent_pid" =~ ^[0-9]+$ \
    && "$session_id" =~ ^[0-9]+$ ]] || return 1

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

  current_identity="$(casn_read_process_identity "$pid" "$proc_root")" || return 1
  [[ "$current_identity" == \
    "$expected_start_time $expected_process_group $expected_parent_pid $expected_session_id" ]]
}
