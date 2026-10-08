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

Measured on 8 October 2026, commit of task P1-04, `proto/` prototype, release build,
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

Peak memory of the measuring process: 655 MB (it keeps four 24 MP documents alive at once; one
document with its cache is about 200 MB).

Criterion benchmark (`cargo bench -p vlayer --bench p1`, the same edit on one path repeatedly):
3.1 ms (dense).

Windows (GitHub Actions windows-latest): see the `p1-measure` workflow log; recorded here when run.

