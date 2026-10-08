#!/usr/bin/env bash
# Build and test both upstream apps once; prints numbers for docs/baseline.md.
set -euo pipefail
cd "$(dirname "$0")/../upstream"
logs="$(cd .. && pwd)/target/baseline"; mkdir -p "$logs"   # full test output, kept out of upstream/
for app in photocraft vectorcraft; do
  echo "== $app $(git -C $app rev-parse --short HEAD)"
  ( cd $app
    start=$(date +%s); cargo build --release --locked -p $app; end=$(date +%s)
    echo "$app release build: $((end-start)) s"
    # Failing or non-compiling tests must not stop the run: the counts and the exit code are the
    # result. --no-fail-fast runs every test binary so the counts are complete.
    cargo test --workspace --locked --no-fail-fast > "$logs/test-$app.log" 2>&1 && rc=0 || rc=$?
    { grep -E '^test result:' "$logs/test-$app.log" || true; } | awk '{p+=$4; f+=$6} END {printf "tests passed %d, failed %d\n", p, f}'
    echo "$app cargo test exit code: $rc (full output: target/baseline/test-$app.log)"
  )
done
