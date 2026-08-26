#!/usr/bin/env bash

perform_http_request() {
  if (( $# < 2 )); then
    echo "perform_http_request requires a response file and curl arguments." >&2
    return 1
  fi

  local http_response_file="$1"
  shift
  local http_code curl_status

  : >"$http_response_file"
  if http_code="$(curl --output "$http_response_file" --write-out "%{http_code}" "$@")"; then
    curl_status=0
  else
    curl_status=$?
  fi

  if (( curl_status != 0 )) || [[ ! "$http_code" =~ ^[0-9]{3}$ ]] || [[ "$http_code" == "000" ]]; then
    : >"$http_response_file"
    echo "HTTP transport failed (curl exit ${curl_status}, HTTP code ${http_code:-none})." >&2
    return 1
  fi

  printf '%s' "$http_code"
}
