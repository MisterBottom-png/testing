#!/bin/sh
# Builds the Desaturate example plug-in and refreshes the test fixture built from it.
# Needs the wasm32-unknown-unknown target: `rustup target add wasm32-unknown-unknown`.
set -eu
cd "$(dirname "$0")"
# Paths of the build machine are mapped to fixed names, so a rebuild gives the same bytes.
sysroot=$(rustc --print sysroot)
RUSTFLAGS="--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo --remap-path-prefix=$sysroot=/rustc --remap-path-prefix=$(pwd)=/plugin" \
  cargo build --release --target wasm32-unknown-unknown
out=target/wasm32-unknown-unknown/release/astudio_plugin_desaturate.wasm
cp "$out" ../tests/fixtures/desaturate.wasm
echo "built $out ($(wc -c < "$out") bytes) -> crates/plugins/tests/fixtures/desaturate.wasm"
