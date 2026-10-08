#!/usr/bin/env bash
# Fetch upstream main and show what changed since upstream.lock. Record the sync in docs/upstream-log.md.
set -euo pipefail
cd "$(dirname "$0")/.."
while read -r name sha; do
  git -C "upstream/$name" fetch -q origin main
  n=$(git -C "upstream/$name" rev-list --count "$sha..origin/main")
  echo "== $name: $n new commits since ${sha:0:7}"
  git -C "upstream/$name" log --oneline "$sha..origin/main" | head -50
done < upstream.lock
