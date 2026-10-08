#!/usr/bin/env bash
# Build and test both upstream apps once; prints numbers for docs/baseline.md.
set -euo pipefail
cd "$(dirname "$0")/../upstream"
for app in photocraft vectorcraft; do
  echo "== $app $(git -C $app rev-parse --short HEAD)"
  ( cd $app
    start=$(date +%s); cargo build --release --locked -p $app; end=$(date +%s)
    echo "$app release build: $((end-start)) s"
    cargo test --workspace --locked 2>&1 | grep -E '^test result:' | awk '{p+=$4; f+=$6} END {print "tests passed " p ", failed " f}'
  )
done
