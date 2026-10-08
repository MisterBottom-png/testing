# Baseline

## Windows (task P0-03)

**Result: both upstream apps build and pass all their tests on Windows.** PhotoCraft: 3,980 tests
passed, 0 failed. VectorCraft: 3,997 passed, 0 failed (3 timing tests are skipped by design).

Measured on 8 October 2026 with photocraft@e5e3e39 and vectorcraft@8b036df, rustc 1.99.0, GitHub
Actions `windows-latest`, `.github/workflows/baseline.yml`. Photocraft is built without its optional
`heif` feature. Release builds start from scratch (no cache) with upstream's release profile.

| Measure | PhotoCraft | VectorCraft | Machine |
| --- | --- | --- | --- |
| Upstream commit | e5e3e39 | 8b036df | |
| Release build time | 22 min 13 s (1,333 s) | 28 min 48 s (1,728 s) | 2 CPUs, 8 GB, normal disk (run 37817543646) |
| Release build time, fast setup | 11 min 20 s (680 s) | 15 min 40 s (940 s) | 4 CPUs, 16 GB, Dev Drive, Defender off (run 37839966772) |
| `cargo test --workspace` passed / failed | 3,980 / 0 | 3,997 / 0 (3 ignored) | both runs |
| Test build and run | about 81 min; 35.5 min with the fast setup | about 68 min; 27.5 min with the fast setup | |
| Startup to first frame | not measured | not measured | needs a desktop session (P4) |
| Open a 24 MP PSD | not measured | | needs a desktop session (P4) |
| Render 20,000 shapes | | not measured | needs a desktop session (P4) |
| Lay out 10,000 glyphs | not measured | not measured | P2 text work (P2-04) |

The first run did everything in one job on a 2-CPU machine and took 3 hours 21 minutes. The
workflow now runs four jobs side by side (each app's release build and each app's tests) on a Dev
Drive with Defender scanning off; the whole run then takes 37 minutes (PhotoCraft's tests are the
slowest job).

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

### Windows (D7)

GitHub Actions `windows-latest`, run 37825571138 (`.github/workflows/p1-measure.yml`): AMD EPYC 7763,
2 CPU threads, 8 GB RAM. Same program, three runs, medians. All prototype tests pass on Windows.

| Measure | Dense | Sparse |
| --- | --- | --- |
| Change one path: redraw + composite | **7.2 ms** (7.2, 7.2, 7.3) | **3.9 ms** (4.3, 3.9, 3.9) |
| First render of the Vector layer | 184 ms (186, 184, 149) | 120 ms (167, 119, 120) |
| Full composite of the 24 MP canvas | 886 ms | 755 ms |
| Criterion benchmark | 3.6 ms | 3.1 ms |

Target (under 100 ms) met on Windows too. A whole-layer change costs about 1.1 s there
(first render plus full composite on 2 threads).

