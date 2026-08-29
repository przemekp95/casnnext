#!/usr/bin/env bash
set -euo pipefail

control_fd="$1"
status_file="$2"
ready_file="$3"
shift 3

[[ "$control_fd" =~ ^[0-9]+$ ]] || exit 64
[[ "$status_file" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.status$ ]] || exit 64
[[ "$ready_file" =~ ^/tmp/casn-quality\.[A-Za-z0-9]+/active-[0-9]+\.ready$ ]] || exit 64
(($# > 0)) || exit 64

# The supervisor is the durable process-group/session leader. Commands get the
# default dispositions; the supervisor itself survives group TERM/INT/HUP until
# its owner has proved the group empty or escalated the whole group to KILL.
trap '' TERM INT HUP
(
  exec {control_fd}>&-
  exec env \
    --default-signal=TERM \
    --default-signal=INT \
    --default-signal=HUP \
    -- "$@"
) &
command_pid=$!

printf 'ready\n' >"$ready_file"

set +e
wait "$command_pid"
command_status=$?
set -e
status_temp="${status_file}.tmp.$$"
printf '%s\n' "$command_status" >"$status_temp"
mv -- "$status_temp" "$status_file"

while IFS= read -r control_message <&"$control_fd"; do
  [[ "$control_message" == 'stop' ]] && exit 0
done

exit 1
