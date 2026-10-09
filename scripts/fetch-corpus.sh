#!/usr/bin/env bash
# Fetches the real-file test corpora into corpus/ (gitignored; never commit these files), at the
# commits PhotoCraft pins (upstream/photocraft/xtask/src/corpus_pins.rs), each file checked against
# its SHA-256 in scripts/corpus/<set>.sha256 (copied from PhotoCraft's xtask/<set>-corpus.sha256).
#
# Usage: scripts/fetch-corpus.sh [psd]
#   psd: the 170 small psd-tools (MIT) and ag-psd (MIT) files PhotoCraft's PSD tests use.
# Files already present with the right hash are kept; a hash mismatch is an error.
set -euo pipefail
cd "$(dirname "$0")/.."
PSD_TOOLS_COMMIT=96eb134c17b2c65edf4c4151c0f00b802ada86c2
AG_PSD_COMMIT=387049670cb89b88fb8fe1b7c01aeacf98dd2e3b

url_for() { # <set> <path in the set>
  case "$1/$2" in
    psd/psd-tools/*) echo "https://raw.githubusercontent.com/psd-tools/psd-tools/$PSD_TOOLS_COMMIT/tests/psd_files/${2#psd-tools/}" ;;
    psd/ag-psd/*) echo "https://raw.githubusercontent.com/Agamnentzar/ag-psd/$AG_PSD_COMMIT/test/${2#ag-psd/}" ;;
    *) echo "no source for $1/$2" >&2; return 1 ;;
  esac
}

fetch_set() { # <set>
  local set=$1 manifest="scripts/corpus/$1.sha256" n=0 got=0
  while read -r hash path; do
    [ -n "$path" ] || continue
    n=$((n + 1))
    local dest="corpus/$set/$path"
    if [ -f "$dest" ] && echo "$hash  $dest" | sha256sum -c --status; then continue; fi
    mkdir -p "$(dirname "$dest")"
    curl -fsSL --retry 3 -o "$dest.part" "$(url_for "$set" "$path")"
    if ! echo "$hash  $dest.part" | sha256sum -c --status; then
      echo "fetch-corpus: $set/$path does not match its pinned SHA-256" >&2; rm -f "$dest.part"; exit 1
    fi
    mv "$dest.part" "$dest"
    got=$((got + 1))
  done < "$manifest"
  # Licences of the sources, next to their files.
  [ -f "corpus/$set/psd-tools/LICENSE" ] || curl -fsSL -o "corpus/$set/psd-tools/LICENSE" "https://raw.githubusercontent.com/psd-tools/psd-tools/$PSD_TOOLS_COMMIT/LICENSE"
  [ -f "corpus/$set/ag-psd/LICENSE" ] || curl -fsSL -o "corpus/$set/ag-psd/LICENSE" "https://raw.githubusercontent.com/Agamnentzar/ag-psd/$AG_PSD_COMMIT/LICENSE"
  echo "corpus/$set: $n files ($got downloaded)"
}

for s in ${*:-psd}; do
  case "$s" in psd) fetch_set psd ;; *) echo "unknown corpus $s" >&2; exit 2 ;; esac
done
