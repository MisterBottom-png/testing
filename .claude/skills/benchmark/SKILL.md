---
name: benchmark
description: "Measure A-Studio or upstream performance and record it in docs/baseline.md. Use for the P0 baseline, the P1 vector-layer prototype benchmark, or when asked how fast something is."
argument-hint: "[baseline|prototype|<what to measure>]"
---

Always measure release builds (`--release`), close to the same machine, three runs, report the median.

- `baseline` (P0-03): on Windows, run the `baseline` workflow (four parallel jobs; artifacts
  `baseline-windows-<app>-<build|test>`), or locally `scripts/baseline.sh [app] [build|test]`. Note
  in `docs/baseline.md` that the CI numbers come from a Dev Drive with Defender off. Then fill the table: upstream commits,
  release build time, test counts, startup time, opening a 24 MP PSD, rendering 20,000 shapes
  (`vectorcraft-cli bench`), laying out 10,000 glyphs.
- `prototype` (P1-04): build a document 6000 x 4000 px (24 MP) with one raster layer and one Vector layer
  holding 1,000 paths (mixed lines and curves, fills and strokes). Change one path and time the redraw of
  the dirty tiles plus composite. Target under 100 ms. Also record a full first render and memory use.
  Write the bench as a `criterion` benchmark in the crate that owns the render path, so it can be re-run.
- Anything else: state what is measured, input size, machine (CPU, RAM, OS, GPU), and the numbers.

Record results in `docs/baseline.md` with the date and commit. Say in plain words whether the target was met.
