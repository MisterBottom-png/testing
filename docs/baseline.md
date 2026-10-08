# Baseline (fill in during P0)

| Measure | PhotoCraft | VectorCraft | Machine |
| --- | --- | --- | --- |
| Upstream commit | | | |
| Release build time | | | |
| `cargo test` passed / failed | | | |
| Startup to first frame | | | |
| Open a 24 MP PSD | | | |
| Render 20,000 shapes | | | |
| Lay out 10,000 glyphs | | | |

## P1 prototype benchmark (task P1-04)

**Result: 7.3 ms to change one path and show it (target: under 100 ms). Target met.**

Measured on 8 October 2026 with upstream photocraft@e5e3e39 and vectorcraft@8b036df, `proto/` prototype, release build,
`cargo run --release -p vlayer --example p1_measure` three times, medians of the three runs.
Machine: Linux cloud VM, Intel Xeon @ 2.1 GHz, 4 threads, 15 GB RAM (a development machine, not the
Windows target; Windows numbers are below when recorded).

Document: 6000 x 4000 px (24 MP), one opaque raster layer and one Vector layer of 1,000 paths
(VectorCraft's own perf recipe: filled and stroked ellipses, filled rectangles at 80 % opacity,
stroked stars). Edit: move one path by 6 pt, redraw its dirty tiles, composite those tiles.

| Measure | Paths 11-94 px (dense) | Paths 3-25 px (sparse) |
| --- | --- | --- |
| Change one path: redraw + composite (median of 21 edits) | **7.3 ms** (runs: 7.3, 7.1, 8.1) | **5.7 ms** (4.7, 5.7, 6.6) |
| Tiles redrawn per edit (median) | 2 | 1 |
| First render of the Vector layer, 384 tiles | 314 ms (314, 333, 244) | 207 ms (201, 207, 257) |
| Full composite of the 24 MP canvas | 419 ms | 410 ms |
| Vector layer cache | 378 tiles, 94 MB | 367 tiles, 92 MB |

Memory: one document is about 96 MB of raster pixels plus the 94 MB vector cache. The measuring
process peaks at 655 MB, mostly the 384 MB floating-point buffer of the full-canvas composite.

Undo: copying the document for an undo step before each edit (the engine's pattern; tiles and vector
nodes are shared, not copied) adds about 1 ms (reviewer's measurement: 8.5 to 9.9 ms dense with
undo, 50 undo states kept).

A change to the whole layer (moving or scaling the whole layer, select-all and move, or a cache that
fell more than one edit behind) redraws all of it: first render plus full composite, about 0.7 s on
this machine. Only small edits are under 100 ms; whole-layer changes need a faster path in P3/P4
(for example, moving the cached tiles while dragging, then redrawing once).

Criterion benchmark (`cargo bench -p vlayer --bench p1`, the same edit on one path repeatedly):
3.1 ms (dense).

Windows (GitHub Actions windows-latest): see the `p1-measure` workflow log; recorded here when run.

