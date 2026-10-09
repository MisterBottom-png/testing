#!/usr/bin/env bash
# Clone the two upstream projects at pinned commits, optionally craft-fonts, and check the toolchain.
# Usage: scripts/bootstrap.sh [--latest] [--fonts]
set -euo pipefail
cd "$(dirname "$0")/.."
LATEST=0; FONTS=0
for a in "$@"; do case "$a" in --latest) LATEST=1;; --fonts) FONTS=1;; *) echo "unknown option $a"; exit 2;; esac; done

need() { command -v "$1" >/dev/null || { echo "missing: $1 ($2)"; exit 1; }; }
need git "https://git-scm.com"
need cargo "https://rustup.rs"
need rustup "https://rustup.rs"
rv=$(rustc --version | awk '{print $2}')
echo "rustc $rv (need 1.95 or newer)"
rustup target list --installed | grep -q wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown

mkdir -p upstream
clone() { # name url pinned-commit
  local name=$1 url=$2 pin=$3
  if [ ! -d "upstream/$name/.git" ]; then git clone --filter=blob:none "$url" "upstream/$name"; fi
  git -C "upstream/$name" fetch -q origin main
  if [ "$LATEST" = 1 ]; then git -C "upstream/$name" checkout -q origin/main; else git -C "upstream/$name" checkout -q "$pin"; fi
  echo "$name $(git -C "upstream/$name" rev-parse --short HEAD)"
}
# Pins = the commits this kit was made from (8 Oct 2026). Update them with --latest, then edit here.
clone photocraft  https://github.com/storytold/photocraft  e5e3e39
clone vectorcraft https://github.com/storytold/vectorcraft 8b036df

if [ "$FONTS" = 1 ]; then
  # Pinned: the golden paragraphs (crates/text/tests/data/golden_paragraphs.txt) were laid out
  # with these font files; CI checks out the same commit.
  [ -d ../craft-fonts ] || git clone --filter=blob:none https://github.com/storytold/craft-fonts ../craft-fonts
  git -C ../craft-fonts fetch -q origin 8dcdacd5153e64560d109541a47d806f26f048c0
  git -C ../craft-fonts checkout -q FETCH_HEAD
  echo "fonts: export CRAFT_FONTS_DIR=\"$(cd ../craft-fonts && pwd)\""
fi
{ echo "photocraft $(git -C upstream/photocraft rev-parse HEAD)"; echo "vectorcraft $(git -C upstream/vectorcraft rev-parse HEAD)"; } > upstream.lock
echo "wrote upstream.lock. Next: scripts/baseline.sh"
