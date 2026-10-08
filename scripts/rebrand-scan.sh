#!/usr/bin/env bash
# List files that still carry ArtCraft marks or upstream app ids.
# Default: scan upstream/ (what is left to change). --shipped: scan this repo's crates, apps,
# assets and packaging, and fail if anything is found.
set -euo pipefail
cd "$(dirname "$0")/.."
PAT='ArtCraft|artcraft|getartcraft|ai\.storyteller'
if [ "${1:-}" = "--shipped" ]; then
  dirs=(); for d in crates apps assets packaging; do [ -d "$d" ] && dirs+=("$d"); done
  [ ${#dirs[@]} -eq 0 ] && { echo "nothing shipped yet"; exit 0; }
  if grep -rIlE "$PAT" "${dirs[@]}"; then echo "rebrand: marks found in shipped files"; exit 1; fi
  echo "rebrand: clean"
else
  grep -rIcE "$PAT" upstream --exclude-dir=.git --exclude-dir=target | grep -v ':0$' | sort -t: -k2 -nr
  find upstream \( -path '*/docs/brand/*' -o -path '*/assets/app-icon/*' \) -type f | grep -v '/.git/'
fi
