#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# Set locale to handle UTF-8 properly
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

ERR=0
for f in posts/*.mdx; do
  # Count only the first two --- lines (front-matter)
  c=$(head -20 "$f" | grep -c '^---[[:space:]]*$')
  if [ "$c" -lt 2 ]; then echo "Niedomknięty front-matter -> $f"; ERR=1; continue; fi

  # Extract front-matter using awk (should work fine with UTF-8 locale)
  fm=$(awk 'BEGIN{hit=0} {if($0~/^---[[:space:]]*$/){hit++} if(hit==1 && $0!~/^---[[:space:]]*$/) print} hit==2{exit}' "$f")

  for key in slug title date; do
    echo "$fm" | grep -q "^[[:space:]]*$key[[:space:]]*:" || { echo "Brak $key -> $f"; ERR=1; }
  done

  if echo "$fm" | grep -q '^[[:space:]]*date:[[:space:]]*[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}[[:space:]]*$'; then
    echo "UWAGA: date bez cudzysłowu -> $f (użyj \"YYYY-MM-DD\")"; ERR=1
  fi
done
exit $ERR
