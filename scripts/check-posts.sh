#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob
ERR=0
for f in posts/*.mdx; do
  c=$(awk 'NR<=80 && /^---[[:space:]]*$/{c++} END{print c+0}' "$f")
  if [ $((c % 2)) -eq 1 ]; then echo "Niedomknięty front-matter -> $f"; ERR=1; continue; fi
  fm=$(awk 'BEGIN{hit=0} {if($0~/^---[[:space:]]*$/){hit++} if(hit==1 && $0!~/^---[[:space:]]*$/) print} hit==2{exit}' "$f")
  for key in slug title date; do
    echo "$fm" | grep -q "^[[:space:]]*$key[[:space:]]*:" || { echo "Brak $key -> $f"; ERR=1; }
  done
  if echo "$fm" | grep -q '^[[:space:]]*date:[[:space:]]*[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}[[:space:]]*$'; then
    echo "UWAGA: date bez cudzysłowu -> $f (użyj \"YYYY-MM-DD\")"; ERR=1
  fi
done
exit $ERR
