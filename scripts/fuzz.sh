#!/usr/bin/env bash
# Runs every fuzz target under crates/*/fuzz (P2-11: PhotoCraft's codecs, psd and raw targets; P2-15:
# the svg, pdf, eps, cad and metafile importers) for a
# fixed time each. Needs the nightly toolchain and cargo-fuzz (`rustup toolchain install nightly`,
# `cargo install cargo-fuzz --locked`); a developer check on Linux, nothing ships from these crates.
#
# Usage: scripts/fuzz.sh [seconds per target, default 30] [crate ...]   e.g. scripts/fuzz.sh 60 psd
# Crashes are saved in crates/<crate>/fuzz/artifacts/<target>/; the script exits non-zero on any.
set -euo pipefail
cd "$(dirname "$0")/.."
secs=${1:-30}
shift || true
crates=${*:-$(ls -d crates/*/fuzz | cut -d/ -f2)}
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$(pwd)/target/fuzz}
mkdir -p "$CARGO_TARGET_DIR"
status=0
for c in $crates; do
  for t in $(cd "crates/$c" && cargo +nightly fuzz list); do
    # Seed files (small valid inputs, crates/<crate>/fuzz/seeds/<target>) are read alongside the
    # corpus the fuzzer grows; it never writes into them.
    dirs=()
    if [ -d "crates/$c/fuzz/seeds/$t" ]; then mkdir -p "crates/$c/fuzz/corpus/$t"; dirs=("fuzz/corpus/$t" "fuzz/seeds/$t"); fi
    if (cd "crates/$c" && cargo +nightly fuzz run "$t" "${dirs[@]}" -- -max_total_time="$secs" > "$CARGO_TARGET_DIR/$c-$t.log" 2>&1); then
      runs=$(grep -oE '^Done [0-9]+ runs' "$CARGO_TARGET_DIR/$c-$t.log" | tail -1)
      echo "fuzz $c/$t: ok (${runs:-no summary} in ${secs} s)"
    else
      echo "fuzz $c/$t: FAILED (log: $CARGO_TARGET_DIR/$c-$t.log)"; status=1
    fi
  done
done
exit $status
