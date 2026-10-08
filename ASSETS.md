# Asset attribution

Every non-code file shipped in A-Studio, with author, source and licence. Add the row in the same
commit as the file. `cargo xtask assets` (ported in P0) fails on any file under `assets/` without a row.
The upstream rows to carry over, and the ones to drop, are in `docs/data/assets.csv`.

| Path | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
