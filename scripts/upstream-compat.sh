#!/usr/bin/env bash
# Proof that both upstream apps build against A-Studio's merged crates (P2-01 geometry, P2-02 colour,
# P2-13 vector document, P2-04 text, P2-11 psd/codecs/heif/raw, P2-16 raster/doc, P2-14 pathops/brush/plugins/effects/render,
# P2-15 svg/pdf/eps/cad/metafile).
#
# Copies upstream/photocraft and upstream/vectorcraft (read-only, never edited) into
# target/upstream-compat/, swaps each ported upstream crate for a thin crate of the same name that
# re-exports the A-Studio crate, then type-checks the whole workspace (every crate, test and
# benchmark) and builds the desktop app. A compile error means an A-Studio crate lost something an
# app uses.
#
# Usage: scripts/upstream-compat.sh [--test] [photocraft|vectorcraft]
#   --test also runs the upstream test suites (slow); naming one app checks only that app (each
#   build needs about 11 GB of disk).
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
TEST=0
apps=""
for a in "$@"; do case "$a" in --test) TEST=1;; photocraft|vectorcraft) apps="$apps $a";; *) echo "unknown option $a"; exit 2;; esac; done
apps=${apps:-photocraft vectorcraft}
[ -d upstream/photocraft/.git ] && [ -d upstream/vectorcraft/.git ] || { echo "run scripts/bootstrap.sh first"; exit 1; }

out=target/upstream-compat
mkdir -p "$out"

# copy <app>: a fresh copy of the upstream app at its pinned commit.
copy() {
  local dir="$out/$1/src-copy"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "upstream/$1" archive HEAD | tar -x -C "$dir"
}

# shim <app> <upstream crate dir> <astudio crate dir> <lib.rs body>
shim() {
  local app=$1 crate=$2 target=$3 body=$4
  local dir="$out/$app/src-copy/crates/$crate"
  rm -rf "$dir"
  mkdir -p "$dir/src"
  cat > "$dir/Cargo.toml" <<EOF
[package]
name = "$app-$crate"
version.workspace = true
edition.workspace = true
license.workspace = true
publish = false

[dependencies]
astudio-$target = { path = "$root/crates/$target" }
EOF
  printf '%s\n' "//! Compatibility shim (scripts/upstream-compat.sh): $app's \`$crate\` is astudio-$target." "$body" > "$dir/src/lib.rs"
}

copy photocraft
# PhotoCraft's geom root = astudio_geom::pixel, plus its warp module.
shim photocraft geom geom 'pub use astudio_geom::pixel::*;
pub use astudio_geom::warp;'
# PhotoCraft's cms = astudio_color::cms; its color = astudio-color's root.
shim photocraft cms color 'pub use astudio_color::cms::*;'
shim photocraft color color 'pub use astudio_color::{BlendMode, Color, ColorMode, PixelFormat, SampleType, blend, convert, dither_noise, read_sample, write_sample};'
# PhotoCraft's psd, codecs, heif and raw = the A-Studio crates of the same names (P2-11); their
# features pass through.
shim photocraft psd psd 'pub use astudio_psd::*;'
printf '\n[features]\ncorpus = ["astudio-psd/corpus"]\nserde = ["astudio-psd/serde"]\ntestgen = ["astudio-psd/testgen"]\n' >> "$out/photocraft/src-copy/crates/psd/Cargo.toml"
shim photocraft codecs codecs 'pub use astudio_codecs::*;'
printf '\n[features]\ncorpus = ["astudio-codecs/corpus"]\navif = ["astudio-codecs/avif"]\nheif = ["astudio-codecs/heif"]\n' >> "$out/photocraft/src-copy/crates/codecs/Cargo.toml"
shim photocraft heif heif 'pub use astudio_heif::*;'
# PhotoCraft's raster and doc = astudio-raster and astudio-doc (P2-16).
shim photocraft raster raster 'pub use astudio_raster::*;'
shim photocraft doc doc 'pub use astudio_doc::*;'
shim photocraft raw raw 'pub use astudio_raw::*;'
printf '\n[features]\ntestgen = ["astudio-raw/testgen"]\n' >> "$out/photocraft/src-copy/crates/raw/Cargo.toml"

copy vectorcraft
# VectorCraft's geom root = astudio_geom's root (kurbo names, paths, shapes, ...).
shim vectorcraft geom geom 'pub use astudio_geom::*;'
# VectorCraft's color = astudio_color::vector; its doc = astudio-vdoc.
shim vectorcraft color color 'pub use astudio_color::vector::*;'
shim vectorcraft doc vdoc 'pub use astudio_vdoc::*;'
# VectorCraft's pathops, brush, plugins, effects and render = the A-Studio crates (P2-14).
shim vectorcraft pathops pathops 'pub use astudio_pathops::*;'
shim vectorcraft brush vbrush 'pub use astudio_vbrush::*;'
shim vectorcraft plugins plugins 'pub use astudio_plugins::*;'
# Engine and UI tests read the example plug-in from the plugins crate's fixtures.
mkdir -p "$out/vectorcraft/src-copy/crates/plugins/tests"
cp -r crates/plugins/tests/fixtures "$out/vectorcraft/src-copy/crates/plugins/tests/"
shim vectorcraft effects effects 'pub use astudio_effects::*;'
shim vectorcraft render render 'pub use astudio_render::*;'
# VectorCraft's svg, pdf, eps, cad and metafile = the A-Studio crates (P2-15).
for c in svg pdf eps cad metafile; do shim vectorcraft "$c" "$c" "pub use astudio_$c::*;"; done
# VectorCraft's text = astudio-text; its `test-fonts` feature passes through.
shim vectorcraft text text 'pub use astudio_text::*;'
printf '\n[features]\ntest-fonts = ["astudio-text/test-fonts"]\n' >> "$out/vectorcraft/src-copy/crates/text/Cargo.toml"

status=0
for app in $apps; do
  dir="$out/$app"
  echo "== $app $(git -C "upstream/$app" rev-parse --short HEAD) against the A-Studio crates"
  # The upstream Cargo.lock is kept, so every other dependency stays at its pinned version.
  if ( cd "$dir/src-copy" && CARGO_TARGET_DIR="$root/$dir/target" cargo check --workspace --all-targets --quiet ) \
    && ( cd "$dir/src-copy" && CARGO_TARGET_DIR="$root/$dir/target" cargo build -p "$app" --quiet ); then
    echo "$app: builds against the A-Studio crates"
  else
    echo "$app: FAILED to build against the A-Studio crates"; status=1; continue
  fi
  if [ "$TEST" = 1 ]; then
    ( cd "$dir/src-copy" && CARGO_TARGET_DIR="$root/$dir/target" cargo test --workspace --no-fail-fast ) > "$dir/test.log" 2>&1 && rc=0 || rc=$?
    { grep -E '^test result:' "$dir/test.log" || true; } | awk '{p+=$4; f+=$6} END {printf "tests passed %d, failed %d\n", p, f}'
    echo "$app cargo test exit code: $rc (full output: $dir/test.log)"
    [ "$rc" = 0 ] || status=1
  fi
done
exit $status
