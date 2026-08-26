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

casn_read_process_state() {
  local pid="$1"
  local proc_root="${2:-/proc}"
  local stat_line
  local stat_fields

  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  IFS= read -r stat_line 2>/dev/null <"$proc_root/$pid/stat" || return 1
  [[ "$stat_line" == "$pid ("*") "* ]] || return 1
  stat_fields="${stat_line##*) }"
  [[ "$stat_fields" != "$stat_line" ]] || return 1
  printf '%s\n' "${stat_fields%% *}"
}

casn_process_group_has_members() {
  local expected_process_group="$1"
  local expected_session_id="$2"
  local excluded_pid="$3"
  local proc_root="${4:-/proc}"
  local stat_path
  local pid
  local stat_line
  local stat_fields
  local -a fields
  local process_group
  local session_id

  [[ "$expected_process_group" =~ ^[0-9]+$ \
    && "$expected_session_id" =~ ^[0-9]+$ \
    && "$excluded_pid" =~ ^[0-9]+$ ]] || return 2

  for stat_path in "$proc_root"/[0-9]*/stat; do
    [[ -r "$stat_path" ]] || continue
    pid="${stat_path%/stat}"
    pid="${pid##*/}"
    [[ "$pid" == "$excluded_pid" ]] && continue
    IFS= read -r stat_line 2>/dev/null <"$stat_path" || continue
    [[ "$stat_line" == "$pid ("*") "* ]] || continue
    stat_fields="${stat_line##*) }"
    [[ "$stat_fields" != "$stat_line" ]] || continue
    read -r -a fields <<<"$stat_fields"
    ((${#fields[@]} >= 4)) || continue
    process_group="${fields[2]}"
    session_id="${fields[3]}"
    if [[ "$process_group" == "$expected_process_group" && "$session_id" == "$expected_session_id" ]]; then
      return 0
    fi
  done
  return 1
}
