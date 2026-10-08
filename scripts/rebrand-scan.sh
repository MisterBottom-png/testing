#!/usr/bin/env bash
# List files that still carry ArtCraft marks or upstream app ids.
# Default: scan upstream/ (what is left to change). --shipped: scan this repo's crates, apps,
# assets and packaging (text marks and brand/upstream icon file names), and fail if anything is found.
set -euo pipefail
cd "$(dirname "$0")/.."
# Also the upstream MSI UpgradeCode GUIDs: a fork must never reuse them (docs/07-fork-and-rebrand.md).
PAT='ArtCraft|artcraft|getartcraft|ai\.storyteller|D9660F32-2D0A-4ABE-B73D-17BE25F1542C|601C6437-08AE-4645-ADCC-27F036C2EA2F'
if [ "${1:-}" = "--shipped" ]; then
  dirs=(); for d in crates apps assets packaging; do [ -d "$d" ] && dirs+=("$d"); done
  [ ${#dirs[@]} -eq 0 ] && { echo "nothing shipped yet"; exit 0; }
  if grep -rIliE "$PAT" "${dirs[@]}"; then echo "rebrand: marks found in shipped files"; exit 1; fi
  # Brand and upstream icon files are binary (PNG, SVG logos, icns/ico), so grep cannot see them: match names.
  files=$(find "${dirs[@]}" -type f \( -path '*/docs/brand/*' -o -iname '*artcraft*' -o -iname 'ai.storyteller.*' \
    -o -iname 'photocraft*.png' -o -iname 'photocraft*.svg' -o -iname 'photocraft*.ico' -o -iname 'photocraft*.icns' \
    -o -iname 'vectorcraft*.png' -o -iname 'vectorcraft*.svg' -o -iname 'vectorcraft*.ico' -o -iname 'vectorcraft*.icns' \))
  if [ -n "$files" ]; then echo "$files"; echo "rebrand: ArtCraft brand or upstream icon files in shipped dirs"; exit 1; fi
  echo "rebrand: clean"
else
  grep -rIcE "$PAT" upstream --exclude-dir=.git --exclude-dir=target | grep -v ':0$' | sort -t: -k2 -nr
  find upstream \( -path '*/docs/brand/*' -o -path '*/assets/app-icon/*' \) -type f | grep -v '/.git/'
fi
