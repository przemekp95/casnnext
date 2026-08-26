#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd "$script_directory/../.." && pwd -P)"
readonly script_directory repository_root

die() {
  printf 'production exporter installation failed\n' >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Usage: install-production-exporter.sh --ssh-target NAME --remote-root ABSOLUTE_PATH' \
    '       --reviewed-commit SHA [--replace-reviewed-sha CURRENT_EXPORTER_SHA]' >&2
  exit 2
}

ssh_target=''
remote_root=''
reviewed_commit=''
replace_reviewed_sha=''
while (( $# > 0 )); do
  case "$1" in
    --ssh-target) [[ $# -ge 2 ]] || usage; ssh_target="$2"; shift 2 ;;
    --remote-root) [[ $# -ge 2 ]] || usage; remote_root="$2"; shift 2 ;;
    --reviewed-commit) [[ $# -ge 2 ]] || usage; reviewed_commit="$2"; shift 2 ;;
    --replace-reviewed-sha) [[ $# -ge 2 ]] || usage; replace_reviewed_sha="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$ssh_target" && -n "$remote_root" && -n "$reviewed_commit" ]] || usage
[[ "$ssh_target" =~ ^[A-Za-z][A-Za-z0-9_.-]{0,127}$ ]] || die
[[ "$remote_root" == /* && "$remote_root" != *$'\n'* && "$remote_root" != *'/../'* && "$remote_root" != */.. ]] || die
[[ "$reviewed_commit" =~ ^[0-9a-f]{40}$ ]] || die
[[ -z "$replace_reviewed_sha" || "$replace_reviewed_sha" =~ ^[0-9a-f]{64}$ ]] || die
for command_name in git scp ssh sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || die
done
git -C "$repository_root" cat-file -e "$reviewed_commit^{commit}" 2>/dev/null || die

temporary_directory="$(mktemp -d /tmp/casn-exporter-package.XXXXXXXX)"
readonly temporary_directory
chmod 700 "$temporary_directory"
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  case "$temporary_directory" in
    /tmp/casn-exporter-package.*) rm -rf -- "$temporary_directory" ;;
    *) exit_status=1 ;;
  esac
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

package_directory="$temporary_directory/package"
mkdir "$package_directory"
chmod 700 "$package_directory"
git -C "$repository_root" archive --format=tar "$reviewed_commit" \
  scripts/snapshot/common.sh scripts/snapshot/manifest.sh scripts/snapshot/export-production.sh \
  | tar -C "$package_directory" --strip-components=2 -xf -
(
  cd "$package_directory"
  sha256sum common.sh manifest.sh export-production.sh > SHA256SUMS
)
chmod 600 "$package_directory"/*
bundle="$temporary_directory/exporter.tar"
tar -C "$package_directory" -cf "$bundle" common.sh manifest.sh export-production.sh SHA256SUMS
chmod 600 "$bundle"
bundle_hash="$(sha256sum "$bundle" | awk '{print $1}')"
remote_archive="/tmp/casn-snapshot-install.${reviewed_commit:0:12}.$$.tar"
replacement_argument="${replace_reviewed_sha:--}"
readonly bundle bundle_hash remote_archive replacement_argument

scp "$bundle" "$ssh_target:$remote_archive"
ssh "$ssh_target" bash -s -- "$remote_root" "$remote_archive" "$bundle_hash" "$replacement_argument" <<'REMOTE_INSTALL'
set -euo pipefail

remote_root="$1"
archive="$2"
expected_archive_hash="$3"
replacement_hash="$4"
[[ "$replacement_hash" != - ]] || replacement_hash=''
[[ "$(id -u)" == 0 ]] || exit 70
[[ "$remote_root" == /* && "$remote_root" != *$'\n'* && "$remote_root" != *'/../'* && "$remote_root" != */.. ]] || exit 71
[[ "$archive" =~ ^/tmp/casn-snapshot-install\.[0-9a-f]{12}\.[0-9]+\.tar$ ]] || exit 72
[[ "$expected_archive_hash" =~ ^[0-9a-f]{64}$ ]] || exit 73
[[ -z "$replacement_hash" || "$replacement_hash" =~ ^[0-9a-f]{64}$ ]] || exit 74
[[ -f "$archive" && ! -L "$archive" ]] || exit 75
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$expected_archive_hash" ]] || exit 76
for command_name in age curl docker jq openssl sha256sum tar; do
  command -v "$command_name" >/dev/null 2>&1 || exit 85
done

staging="$(mktemp -d /tmp/casn-snapshot-install-stage.XXXXXXXX)"
pending=''
cleanup_remote() {
  local exit_status=$?
  trap - EXIT INT TERM
  [[ -z "$pending" || ! -e "$pending" ]] || rm -f -- "$pending"
  case "$staging" in
    /tmp/casn-snapshot-install-stage.*) rm -rf -- "$staging" ;;
    *) exit_status=1 ;;
  esac
  rm -f -- "$archive"
  exit "$exit_status"
}
trap cleanup_remote EXIT INT TERM
chmod 700 "$staging"
mapfile -t entries < <(tar -tf "$archive" | LC_ALL=C sort)
expected=(SHA256SUMS common.sh export-production.sh manifest.sh)
[[ "${entries[*]}" == "${expected[*]}" ]] || exit 77
tar -C "$staging" -xf "$archive"
(cd "$staging" && sha256sum -c SHA256SUMS >/dev/null)

program_directory="$remote_root/usr/local/libexec/casn-snapshot"
config_directory="$remote_root/etc/casn-snapshot"
install -d -m 0750 "$program_directory" "$config_directory"
chown root:root "$program_directory" "$config_directory"
entrypoint="$program_directory/export-production.sh"
if [[ -e "$entrypoint" || -L "$entrypoint" ]]; then
  [[ -f "$entrypoint" && ! -L "$entrypoint" && -n "$replacement_hash" ]] || exit 78
  [[ "$(sha256sum "$entrypoint" | awk '{print $1}')" == "$replacement_hash" ]] || exit 79
elif [[ -n "$replacement_hash" ]]; then
  exit 80
fi

install_reviewed_file() {
  local source="$1" destination="$2" mode="$3"
  pending="$destination.new.$$"
  [[ ! -e "$pending" && ! -L "$pending" ]] || exit 81
  umask 077
  set -C
  : > "$pending"
  set +C
  cat "$source" > "$pending"
  chmod "$mode" "$pending"
  chown root:root "$pending"
  [[ "$(sha256sum "$source" | awk '{print $1}')" == "$(sha256sum "$pending" | awk '{print $1}')" ]] || exit 82
  mv -f -- "$pending" "$destination"
  pending=''
}

install_reviewed_file "$staging/common.sh" "$program_directory/common.sh" 0640
install_reviewed_file "$staging/manifest.sh" "$program_directory/manifest.sh" 0750
install_reviewed_file "$staging/export-production.sh" "$entrypoint" 0750
install_reviewed_file "$staging/SHA256SUMS" "$program_directory/SHA256SUMS" 0640

config="$config_directory/export.env"
if [[ ! -e "$config" && ! -L "$config" ]]; then
  umask 077
  set -C
  : > "$config"
  set +C
elif [[ ! -f "$config" || -L "$config" ]]; then
  exit 83
fi
chmod 0600 "$config"
chown root:root "$config"
[[ "$(sha256sum "$entrypoint" | awk '{print $1}')" == "$(awk '$2 == "export-production.sh" {print $1}' "$program_directory/SHA256SUMS")" ]] || exit 84
printf 'reviewed exporter installed\n'
REMOTE_INSTALL

printf '%s\n' \
  'Populate the remote root-only export.env manually with exactly these keys:' \
  'SOURCE_COMPOSE_PROJECT' \
  'SOURCE_MYSQL_SERVICE' \
  'SOURCE_DATABASE' \
  'SOURCE_DIRECTUS_SERVICE' \
  'SOURCE_DIRECTUS_UPLOADS_VOLUME' \
  'SOURCE_LEGACY_UPLOADS_VOLUME' \
  'SOURCE_DOCKER_NETWORK' \
  'EXPECTED_DATABASE_NAME_HASH' \
  'EXPECTED_SERVER_UUID_HASH' \
  'SNAPSHOT_EXPORT_USER' \
  'SNAPSHOT_EXPORT_PASSWORD' \
  'SNAPSHOT_AGE_RECIPIENT' \
  'SNAPSHOT_OUTPUT_DIRECTORY' \
  'SOURCE_PUBLIC_URL'
