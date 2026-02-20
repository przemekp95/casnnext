#!/usr/bin/env bash
set -euo pipefail

echo "Checking MDX media paths for Strapi compatibility..."

PATTERN='(src|href)\s*=\s*["'"'"']\/uploads\/|\]\(\/uploads\/'

if rg -n --pcre2 "$PATTERN" posts/*.mdx; then
  echo
  echo "Found MDX media paths using /uploads/."
  echo "Use /cms/uploads/... for Strapi-hosted media to keep frontend routing compatible."
  exit 1
fi

echo "MDX media paths check passed."
