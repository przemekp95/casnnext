#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly script_directory
# shellcheck source=/dev/null
source "$script_directory/common.sh"

readonly database_payload=database.sql
readonly directus_payload=directus-uploads.tar
readonly legacy_payload=legacy-uploads.tar

usage() {
  printf '%s\n' \
    'Usage:' \
    '  manifest.sh build --input DIR --output FILE' \
    '  manifest.sh verify --manifest FILE --payload-dir DIR' >&2
  return 2
}

require_regular_owner_file() {
  require_owner_only_file "$1"
}

require_payload_directory() {
  local directory="${1-}"
  [[ -n "$directory" && -d "$directory" && ! -L "$directory" ]] || die 'payload directory is invalid'
  realpath -e -- "$directory"
}

validate_inventory() {
  local inventory="$1"
  jq -e '
    def lowercase_hash: type == "string" and test("^[0-9a-f]{64}$");
    def count: type == "number" and . >= 0 and floor == .;
    (keys | sort) == ["capturedAt","database","media","public","snapshotId","source"]
    and (.snapshotId | type == "string" and test("^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$"))
    and (.capturedAt | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
    and (.source | (keys | sort) == ["databaseNameHash","serverUuidHash"])
    and (.source.databaseNameHash | lowercase_hash)
    and (.source.serverUuidHash | lowercase_hash)
    and (.database | (keys | sort) == ["events","routines","tables","triggers","views"])
    and (.database.tables | count)
    and (.database.views | count)
    and (.database.triggers | count)
    and (.database.routines | count)
    and (.database.events | count)
    and (.media | (keys | sort) == ["directus","legacy"])
    and (.media.directus | (keys | sort) == ["files","representativeEvidence","representativePath"])
    and (.media.directus.files | count)
    and (.media.directus.representativePath == null or (.media.directus.representativePath | type == "string" and startswith("/cms/assets/")))
    and (
      (.media.directus.files == 0 and .media.directus.representativePath == null and .media.directus.representativeEvidence == "empty-volume")
      or (.media.directus.files > 0 and .media.directus.representativePath != null and .media.directus.representativeEvidence == "public-api")
      or (.media.directus.files > 0 and .media.directus.representativePath == null and .media.directus.representativeEvidence == "no-public-directus-reference")
    )
    and (.media.legacy | (keys | sort) == ["files","representativeEvidence","representativePath"])
    and (.media.legacy.files | count)
    and (.media.legacy.representativePath == null or (.media.legacy.representativePath | type == "string" and startswith("/cms/uploads/")))
    and (
      (.media.legacy.files == 0 and .media.legacy.representativePath == null and .media.legacy.representativeEvidence == "empty-volume")
      or (.media.legacy.files > 0 and .media.legacy.representativePath != null and (.media.legacy.representativeEvidence == "public-api" or .media.legacy.representativeEvidence == "volume-inventory"))
    )
    and (.public | (keys | sort) == ["analyses","authors","sitemap"])
    and ([.public.authors, .public.analyses, .public.sitemap] | all(
      (keys | sort) == ["count","sha256"]
      and (.count | count)
      and (.sha256 | lowercase_hash)
    ))
  ' "$inventory" >/dev/null || die 'inventory contract validation failed'
}

validate_manifest() {
  local manifest="$1"
  jq -e '
    def lowercase_hash: type == "string" and test("^[0-9a-f]{64}$");
    def count: type == "number" and . >= 0 and floor == .;
    (keys | sort) == ["capturedAt","database","media","public","snapshotId","source","version"]
    and .version == 1
    and (.snapshotId | type == "string" and test("^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$"))
    and (.capturedAt | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
    and (.source | (keys | sort) == ["databaseNameHash","serverUuidHash"])
    and (.source.databaseNameHash | lowercase_hash)
    and (.source.serverUuidHash | lowercase_hash)
    and (.database | (keys | sort) == ["canonicalSha256","events","routines","sha256","tables","triggers","views"])
    and (.database.sha256 | lowercase_hash)
    and (.database.canonicalSha256 | lowercase_hash)
    and (.database.tables | count)
    and (.database.views | count)
    and (.database.triggers | count)
    and (.database.routines | count)
    and (.database.events | count)
    and (.media | (keys | sort) == ["directus","legacy"])
    and ([.media.directus, .media.legacy] | all(
      (keys | sort) == ["files","representativeEvidence","representativePath","sha256"]
      and (.files | count)
      and (.sha256 | lowercase_hash)
    ))
    and (.media.directus.representativePath == null or (.media.directus.representativePath | type == "string" and startswith("/cms/assets/")))
    and (.media.legacy.representativePath == null or (.media.legacy.representativePath | type == "string" and startswith("/cms/uploads/")))
    and (
      (.media.directus.files == 0 and .media.directus.representativePath == null and .media.directus.representativeEvidence == "empty-volume")
      or (.media.directus.files > 0 and .media.directus.representativePath != null and .media.directus.representativeEvidence == "public-api")
      or (.media.directus.files > 0 and .media.directus.representativePath == null and .media.directus.representativeEvidence == "no-public-directus-reference")
    )
    and (
      (.media.legacy.files == 0 and .media.legacy.representativePath == null and .media.legacy.representativeEvidence == "empty-volume")
      or (.media.legacy.files > 0 and .media.legacy.representativePath != null and (.media.legacy.representativeEvidence == "public-api" or .media.legacy.representativeEvidence == "volume-inventory"))
    )
    and (.public | (keys | sort) == ["analyses","authors","sitemap"])
    and ([.public.authors, .public.analyses, .public.sitemap] | all(
      (keys | sort) == ["count","sha256"]
      and (.count | count)
      and (.sha256 | lowercase_hash)
    ))
  ' "$manifest" >/dev/null || die 'manifest contract validation failed'
}

require_payload_files() {
  local directory="$1"
  require_regular_owner_file "$directory/$database_payload"
  require_regular_owner_file "$directory/$directus_payload"
  require_regular_owner_file "$directory/$legacy_payload"
}

build_manifest() {
  local input="" output="" inventory database_hash database_canonical_hash directus_hash legacy_hash
  while (( $# > 0 )); do
    case "$1" in
      --input) [[ $# -ge 2 ]] || usage; input="$2"; shift 2 ;;
      --output) [[ $# -ge 2 ]] || usage; output="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$input" && -n "$output" ]] || usage

  input="$(require_payload_directory "$input")"
  inventory="$input/snapshot.json"
  require_regular_owner_file "$inventory"
  require_payload_files "$input"
  validate_inventory "$inventory"
  [[ ! -e "$output" && ! -L "$output" ]] || die 'manifest output already exists'
  [[ -d "$(dirname "$output")" ]] || die 'manifest output parent does not exist'

  database_hash="$(sha256sum -- "$input/$database_payload" | awk '{print $1}')"
  database_canonical_hash="$(sed 's/CHARACTER SET utf8mb4 //g' "$input/$database_payload" | sha256sum | awk '{print $1}')"
  directus_hash="$(sha256sum -- "$input/$directus_payload" | awk '{print $1}')"
  legacy_hash="$(sha256sum -- "$input/$legacy_payload" | awk '{print $1}')"

  umask 077
  set -C
  jq -S \
    --arg database_hash "$database_hash" \
    --arg database_canonical_hash "$database_canonical_hash" \
    --arg directus_hash "$directus_hash" \
    --arg legacy_hash "$legacy_hash" \
    '. + {
      version: 1,
      database: (.database + {sha256: $database_hash, canonicalSha256: $database_canonical_hash}),
      media: {
        directus: (.media.directus + {sha256: $directus_hash}),
        legacy: (.media.legacy + {sha256: $legacy_hash})
      }
    }' "$inventory" > "$output"
  set +C
  chmod 600 -- "$output"
  validate_manifest "$output"
  printf 'manifest built: %s\n' "$(jq -r '.snapshotId' "$output")"
}

verify_manifest() {
  local manifest="" payload_directory="" expected actual
  while (( $# > 0 )); do
    case "$1" in
      --manifest) [[ $# -ge 2 ]] || usage; manifest="$2"; shift 2 ;;
      --payload-dir) [[ $# -ge 2 ]] || usage; payload_directory="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$manifest" && -n "$payload_directory" ]] || usage

  require_regular_owner_file "$manifest"
  payload_directory="$(require_payload_directory "$payload_directory")"
  require_payload_files "$payload_directory"
  validate_manifest "$manifest"

  while IFS=$'\t' read -r expected actual; do
    [[ "$expected" == "$actual" ]] || die 'payload checksum mismatch'
  done <<EOF
$(jq -r '.database.sha256' "$manifest")	$(sha256sum -- "$payload_directory/$database_payload" | awk '{print $1}')
$(jq -r '.media.directus.sha256' "$manifest")	$(sha256sum -- "$payload_directory/$directus_payload" | awk '{print $1}')
$(jq -r '.media.legacy.sha256' "$manifest")	$(sha256sum -- "$payload_directory/$legacy_payload" | awk '{print $1}')
EOF

  jq -r '"manifest verified: \(.snapshotId) authors=\(.public.authors.count) analyses=\(.public.analyses.count) sitemap=\(.public.sitemap.count)"' "$manifest"
}

main() {
  [[ $# -ge 1 ]] || usage
  local command="$1"
  shift
  case "$command" in
    build) build_manifest "$@" ;;
    verify) verify_manifest "$@" ;;
    *) usage ;;
  esac
}

main "$@"
