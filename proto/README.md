# P1 prototype (throwaway)

Proves that one PhotoCraft document can hold VectorCraft vector layers (phase P1 in
`docs/01-roadmap.md`). The owner chose (8 October 2026) to build it here, outside the main
workspace, and to port code for real in P2/P3 only if the P1 result is GO.

- Not shipped and not part of the main workspace or CI. Run `scripts/bootstrap.sh` first: the crates
  below use the upstream clones in `../upstream/` by path (never edited).
- `pc-doc`, `pc-vector`, `pc-compose`, `pc-format` are copies of the PhotoCraft crates `doc`, `vector`,
  `compose`, `format` from photocraft@e5e3e39 (MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team
  and the PhotoCraft contributors). Package names carry a `proto-pc-` prefix; the library names stay
  `photocraft_*` so the copied code needs no renames. A-Studio changes are marked `A-Studio P1`.
- `vlayer`: renders a Vector layer into 256-px tiles with VectorCraft's renderer, one band of tiles
  per renderer call, and redraws only the tiles an edit touches (P1-02).
- `p1-check` (placeholder until P1-03/P1-04): the P1 exit test end to end and the benchmark.
- `clippy.toml` and `rustfmt.toml` are upstream PhotoCraft's, so the copied code is checked the same way.

```sh
cd proto
cargo test --workspace                 # P1-01 to P1-03 checks
cargo bench -p vlayer                  # P1-04
```
