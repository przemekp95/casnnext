#!/usr/bin/env bash
set -euo pipefail

mode="$1"
shift

: "${CASN_REGRESSION_IDENTITY_REGISTRY:?}"
: "${CASN_REGRESSION_INVOCATION_ID:?}"
: "${CASN_REGRESSION_IDENTITY_LIBRARY:?}"
: "${CASN_REGRESSION_REGISTRY_LIBRARY:?}"

# shellcheck source=scripts/ci/disposable-process-identity.sh
source "$CASN_REGRESSION_IDENTITY_LIBRARY"
# shellcheck source=scripts/ci/disposable-process-registry.sh
source "$CASN_REGRESSION_REGISTRY_LIBRARY"

write_ready_record() {
  local destination="$1"
  local role="$2"
  local pid="$BASHPID"
  local identity
  local pending

  [[ "$destination" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.[a-z-]+$ ]] || return 1
  identity="$(casn_read_process_identity "$pid")" || return 1
  [[ ! -e "$destination" && ! -L "$destination" ]] || return 1
  pending="$(mktemp "${destination}.tmp.XXXXXX")" || return 1
  chmod 0600 "$pending" || {
    rm -f -- "$pending"
    return 1
  }
  printf 'v1\t%s\t%s\t%s\t%s\n' \
    "$CASN_REGRESSION_INVOCATION_ID" "$pid" "$identity" "$role" >"$pending" || {
      rm -f -- "$pending"
      return 1
    }
  ln -- "$pending" "$destination" || {
    rm -f -- "$pending"
    return 1
  }
  rm -f -- "$pending"
}

case "$mode" in
  supervisor)
    launch_fd="$1"
    launch_record="$2"
    control_fd="$3"
    status_file="$4"
    ready_file="$5"
    command_record="$6"
    shift 6
    [[ "$launch_fd" =~ ^[0-9]+$ && "$control_fd" =~ ^[0-9]+$ && "$#" -gt 0 ]] || exit 64
    : "${CASN_REGRESSION_PROCESS_SUPERVISOR:?}"

    casn_registry_write_current_process \
      "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
      bounded-supervisor >/dev/null
    write_ready_record "$launch_record" bounded-supervisor
    IFS= read -r launch_message <&"$launch_fd"
    [[ "$launch_message" == 'launch' ]] || exit 65
    exec {launch_fd}>&-
    exec "$CASN_REGRESSION_PROCESS_SUPERVISOR" \
      "$control_fd" "$status_file" "$ready_file" \
      bash "$0" command "$command_record" -- "$@"
    ;;
  command)
    command_record="$1"
    shift
    [[ "${1:-}" == '--' ]] || exit 64
    shift
    (($# > 0)) || exit 64

    casn_registry_write_current_process \
      "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
      bounded-command >/dev/null
    write_ready_record "$command_record" bounded-command
    exec "$@"
    ;;
  fixture)
    launch_fd="$1"
    launch_record="$2"
    role="$3"
    shift 3
    [[ "${1:-}" == '--' ]] || exit 64
    shift
    [[ "$launch_fd" =~ ^[0-9]+$ && "$#" -gt 0 ]] || exit 64
    casn_registry_role_is_valid "$role" || exit 64

    casn_registry_write_current_process \
      "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
      "$role" >/dev/null
    write_ready_record "$launch_record" "$role"
    IFS= read -r launch_message <&"$launch_fd"
    [[ "$launch_message" == 'launch' ]] || exit 65
    exec {launch_fd}>&-
    exec "$@"
    ;;
  hold)
    hold_record="$1"
    hold_fifo="$2"
    role="$3"
    casn_registry_role_is_valid "$role" || exit 64
    [[ "$hold_fifo" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.hold$ ]] || exit 64

    casn_registry_write_current_process \
      "$CASN_REGRESSION_IDENTITY_REGISTRY" "$CASN_REGRESSION_INVOCATION_ID" \
      "$role" >/dev/null
    write_ready_record "$hold_record" "$role"
    exec 11<>"$hold_fifo"
    while :; do read -r -t 1 _ <&11 || true; done
    ;;
  *)
    exit 64
    ;;
esac
