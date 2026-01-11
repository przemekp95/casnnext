#!/usr/bin/env bash
set -euo pipefail

# Brakujące z Twojej listy 404:
REQ=(
  AjaxLoader.gif
  blog-details-bg.jpg
  blog-list-bg.jpg
  counter-bg-1.jpg
  faq-bg.jpg
  features-bg.jpg
  logo.jpg
  our-clients-bg.jpg
  our-Project-bg.jpg
  page-header.jpg
  project-details-bg.jpg
  service-bg.jpg
)

mkdir -p public/css/images public/css/legacy

notfound=()

# Szukaj po całym projekcie (bez .git i node_modules), bez użycia gita:
for name in "${REQ[@]}"; do
  # gdzie ma trafić
  if [[ "$name" == "AjaxLoader.gif" ]]; then
    dest="public/css/legacy/$name"
  else
    dest="public/css/images/$name"
  fi
  # znajdź pierwszy plik o tej nazwie
  src="$(find . \
      -type d \( -name .git -o -name node_modules -o -name .next \) -prune -false -o \
      -type f -iname "$name" -print -quit)"
  if [[ -n "$src" ]]; then
    echo "✓ $name ← $src"
    mkdir -p "$(dirname "$dest")"
    cp -f "$src" "$dest"
  else
    echo "✗ NIE ZNALEZIONO: $name"
    notfound+=("$name")
  fi
done

echo
if (( ${#notfound[@]} > 0 )); then
  echo "⚠ Brak w projekcie:"
  printf ' - %s\n' "${notfound[@]}"
  exit 2
else
  echo "Wszystkie wymagane pliki skopiowane do public/."
fi
