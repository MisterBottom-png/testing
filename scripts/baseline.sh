#!/usr/bin/env bash
# Build and test the upstream apps once; prints numbers for docs/baseline.md.
# Usage: scripts/baseline.sh [photocraft|vectorcraft|all] [build|test|all]   (defaults: all all)
# CI runs each app and part as its own job (.github/workflows/baseline.yml), side by side.
set -euo pipefail
apps=${1:-all}; part=${2:-all}
case "$apps" in all) apps="photocraft vectorcraft";; photocraft|vectorcraft) ;; *) echo "unknown app $apps"; exit 2;; esac
case "$part" in all|build|test) ;; *) echo "unknown part $part"; exit 2;; esac
cd "$(dirname "$0")/../upstream"
logs="$(cd .. && pwd)/target/baseline"; mkdir -p "$logs"   # full test output, kept out of upstream/
for app in $apps; do
  echo "== $app $(git -C $app rev-parse --short HEAD)"
  ( cd $app
    # Download every crate first, so network time is not counted in the build times below.
    cargo fetch --locked
    if [ "$part" != test ]; then
      start=$(date +%s); cargo build --release --locked -p $app; end=$(date +%s)
      echo "$app release build: $((end-start)) s"
    fi
    if [ "$part" != build ]; then
      # Failing or non-compiling tests must not stop the run: the counts and the exit code are the
      # result. --no-fail-fast runs every test binary so the counts are complete.
      start=$(date +%s)
      cargo test --workspace --locked --no-fail-fast > "$logs/test-$app.log" 2>&1 && rc=0 || rc=$?
      end=$(date +%s)
      { grep -E '^test result:' "$logs/test-$app.log" || true; } | awk '{p+=$4; f+=$6} END {printf "tests passed %d, failed %d\n", p, f}'
      echo "$app cargo test exit code: $rc, $((end-start)) s with the test build (full output: target/baseline/test-$app.log)"
    fi
  )
done
