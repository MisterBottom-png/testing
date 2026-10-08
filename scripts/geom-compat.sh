#!/usr/bin/env bash
# P2-01 proof: both upstream apps build against astudio-geom.
#
# Copies upstream/photocraft and upstream/vectorcraft (read-only, never edited) into
# target/geom-compat/, swaps each copy's own geometry crate for a thin crate of the same name that
# re-exports astudio-geom, then type-checks the whole workspace (every crate, test and benchmark)
# and builds the desktop app. A compile error means astudio-geom lost something an app uses.
#
# Usage: scripts/geom-compat.sh [--test]   (--test also runs both upstream test suites; slow)
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
TEST=0
for a in "$@"; do case "$a" in --test) TEST=1;; *) echo "unknown option $a"; exit 2;; esac; done
[ -d upstream/photocraft/.git ] && [ -d upstream/vectorcraft/.git ] || { echo "run scripts/bootstrap.sh first"; exit 1; }

out=target/geom-compat
mkdir -p "$out"

# shim <app> <module re-exports>
shim() {
  local app=$1 body=$2
  local dir="$out/$app"
  rm -rf "$dir/src-copy"
  mkdir -p "$dir/src-copy"
  git -C "upstream/$app" archive HEAD | tar -x -C "$dir/src-copy"
  local geom="$dir/src-copy/crates/geom"
  rm -rf "$geom"
  mkdir -p "$geom/src"
  cat > "$geom/Cargo.toml" <<EOF
[package]
name = "$app-geom"
version.workspace = true
edition.workspace = true
license.workspace = true
publish = false

[dependencies]
astudio-geom = { path = "$root/crates/geom" }
EOF
  printf '%s\n' "//! Compatibility shim (scripts/geom-compat.sh): $app's geometry is astudio-geom." "$body" > "$geom/src/lib.rs"
}

# PhotoCraft's geom root = astudio_geom::pixel, plus its warp module.
shim photocraft 'pub use astudio_geom::pixel::*;
pub use astudio_geom::warp;'
# VectorCraft's geom root = astudio_geom's root (kurbo names, paths, shapes, ...).
shim vectorcraft 'pub use astudio_geom::*;'

status=0
for app in photocraft vectorcraft; do
  dir="$out/$app"
  echo "== $app $(git -C "upstream/$app" rev-parse --short HEAD) against astudio-geom"
  # The upstream Cargo.lock is kept, so every other dependency stays at its pinned version.
  if ( cd "$dir/src-copy" && CARGO_TARGET_DIR="$root/$dir/target" cargo check --workspace --all-targets --quiet ) \
    && ( cd "$dir/src-copy" && CARGO_TARGET_DIR="$root/$dir/target" cargo build -p "$app" --quiet ); then
    echo "$app: builds against astudio-geom"
  else
    echo "$app: FAILED to build against astudio-geom"; status=1; continue
  fi
  if [ "$TEST" = 1 ]; then
    ( cd "$dir/src-copy" && CARGO_TARGET_DIR="$root/$dir/target" cargo test --workspace --no-fail-fast ) > "$dir/test.log" 2>&1 && rc=0 || rc=$?
    { grep -E '^test result:' "$dir/test.log" || true; } | awk '{p+=$4; f+=$6} END {printf "tests passed %d, failed %d\n", p, f}'
    echo "$app cargo test exit code: $rc (full output: $dir/test.log)"
    [ "$rc" = 0 ] || status=1
  fi
done
exit $status
