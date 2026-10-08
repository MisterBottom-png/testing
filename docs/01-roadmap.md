# Roadmap

Nine phases. Each has an exit test; do not start the next phase until it passes. Durations are rough
guesses for one full-time developer working with AI coding agents, and assume upstream code is reused,
not rewritten. Treat them as a range to re-estimate after P1, not a promise.

| Phase | Goal | Rough length | Exit test |
| --- | --- | --- | --- |
| P0 Setup | Fork exists, builds, no ArtCraft marks | 2 weeks | Both upstream apps build from this repo on Windows (D7); `scripts/rebrand-scan.sh` reports zero ArtCraft marks in shipped files |
| P1 Prototype (go/no-go) | Prove one document can hold vector layers | 2 to 4 weeks | A PSD opens in PhotoCraft with one VectorCraft path added as a Vector layer, rendered into tiles, saved and reopened; a 24-megapixel canvas with 1,000 paths redraws a changed layer in under 100 ms |
| P2 Shared core | One geometry, colour, text, codec layer | 6 to 10 weeks | Both apps build against the shared crates; all upstream tests still pass |
| P3 One document and engine | One `Document`, one command registry, one undo history | 8 to 12 weeks | Every PhotoCraft and VectorCraft command runs on the merged document from the CLI; MCP lists both sets |
| P4 One window | Mode switch, per-mode tools, panels and shortcuts | 6 to 10 weeks | The three mockup screens (Layout disabled) are reproduced in the real app; snapshot tests pass |
| P5 File format and import | `.astudio` v1; PSD, SVG, PDF, AI, `.pcraft`, `.vectorcraft` in and out | 4 to 6 weeks | Round-trip corpus tests pass at the upstream rates (PSD 307 of 309) |
| P6 Feature transfer | Pixel filters on vector layers; vector tools on pixel documents | 6 to 10 weeks | The 56 Photoshop-style effects VectorCraft lacks run as live effects on vector layers |
| P7 1.0 release | Packaging, signing, website, trademark | 4 to 6 weeks | Signed Windows build (D7) and the web build; trademark filed; no open crash bugs |
| P8 Layout mode | Pages, frames, threaded text | after 1.0 | Mockup Layout screen works end to end |

Total to 1.0: roughly 38 to 60 weeks of focused work. The prototype in P1 is the decision point: if it
fails its exit test, stop at P2 and ship a shared core with two apps instead of one.

## P0 Setup

1. Create the GitHub repo `a-studio` from this kit; enable Actions.
2. `scripts/bootstrap.sh` clones upstream into `upstream/photocraft` and `upstream/vectorcraft` at pinned commits.
3. `scripts/baseline.sh` builds and tests both, records times and test counts in `docs/baseline.md`.
4. Remove ArtCraft marks (`docs/07-fork-and-rebrand.md`), change app ids, add A-Studio icon placeholder.
5. CI green: fmt, clippy, tests, wasm, `cargo deny`, layer check.

## P1 Prototype

1. Add `LayerContent::Vector(VectorLayer)` to PhotoCraft's `doc` crate, holding a VectorCraft node tree (`Vec<Arc<Node>>` plus its artboard transform).
2. Render: VectorCraft `render` (vello_cpu) draws the tree into PhotoCraft 256-px tiles; cache per layer revision; only dirty tiles redraw.
3. Save inside `.pcraft` manifest as a `.vectorcraft` v3 subtree; reopen.
4. Benchmark on 24 MP, 1,000 paths; record in `docs/baseline.md`.
5. Decide go or no-go. Record the result in `docs/00-decisions.md` as D6.

## P2 Shared core

- `astudio-geom`: VectorCraft geom (kurbo-based) plus PhotoCraft's pixel-space types and warp.
- `astudio-color`: merge both colour crates; one CMS (PhotoCraft `cms`); keep the user's colour model per value (VectorCraft rule) and runtime bit depth (PhotoCraft rule).
- `astudio-text`: per `docs/06-text-engine.md`.
- Codecs: PhotoCraft `codecs`, `heif`, `raw`, `psd`; VectorCraft `svg`, `pdf`, `eps`, `cad`, `metafile`.
- Unify the 17 crates whose versions differ (`docs/03-dependencies.md`).

## P3 One document and engine

- Document = PhotoCraft layer stack + Vector layer kind (from P1) + artboards and swatches/styles from VectorCraft's document.
- One command registry: join 627 PhotoCraft ids and VectorCraft's `CommandSpec` set; resolve clashing ids with prefixes `pixel.` and `vector.` only where both exist.
- One undo model: PhotoCraft copy-on-write tiles + VectorCraft structural sharing; one history panel.
- One MCP server and control channel.

## P4 One window

Per `docs/11-ui-spec.md`. Thin UI rule stays: panels read engine state and call `app.run(id, params)`.

## P5 File format and import

Per `docs/05-file-format.md`. Corpora: photocraft-corpus, psd-tools, ag-psd, PngSuite, VectorCraft examples.

## P6 Feature transfer

Top items from `docs/12-feature-backlog.md`: non-destructive filters everywhere, link layers, filter search, trace both ways.

## P7 1.0 release

Per `docs/10-release-and-legal.md`.
