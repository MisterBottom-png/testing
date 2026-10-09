# Architecture

Both upstream projects already use the same layer scheme (L0 to L7, checked by `cargo xtask layers`):
a crate may depend only on strictly lower layers, and only L6 and up may use egui, eframe, winit or rfd.
A-Studio keeps that scheme. The checker in `xtask/` enforces it on the target crates below.

## Target crates

| Layer | A-Studio crate | Built from (upstream crate) | Notes |
| --- | --- | --- | --- |
| L0 | `astudio-geom` | vc `geom` + pc `geom` | Done (P2-01). Crate root = vc `geom` (kurbo-based paths); `pixel` = pc `geom` root (integer rects, tiles, pc's float `Point`/`Affine`); `warp` = pc `geom::warp`. `scripts/upstream-compat.sh` builds both upstream apps against it |
| L0 | `astudio-color` | pc `color` + pc `cms` + vc `color` | P2-02. Crate root = pc `color` (runtime bit depth, colour modes, blend modes); `cms` = pc `cms`, the one colour engine (D8, `docs/13-colour-engine.md`); `vector` = vc `color` (colours that keep their model, gradients, swatches), its ICC work on `cms`. Still to do: merge the two blend-mode sets and the duplicated sRGB/Lab maths, make Coated CMYK the default for new documents (P3), move swatches to `astudio-vdoc` if it helps |
| L0 | `astudio-raster` | pc `raster` | P2-16. Copy-on-write 256-px tiles |
| L0 standalone | `astudio-psd`, `astudio-raw`, `astudio-tablet` | pc same names | P2-11 (psd, raw). No workspace deps; `tablet` keeps the only `unsafe` |
| L0 | `astudio-codecs`, `astudio-heif` | pc same names | P2-11. Flat image formats; `codecs` uses `heif` (HEIC photos, no workspace deps of its own) behind its `heif` feature, a same-layer edge |
| L1 | `astudio-vdoc` | vc `doc` | Vector node tree, appearance, symbols, swatches |
| L1 | `astudio-doc` | pc `doc` + Vector layer | P2-16 (pc `doc`: layer stack, text-layer model). `LayerContent::Vector` holding an `astudio-vdoc` tree joins in P3-01 (vdoc before doc inside L1) |
| L2 | `astudio-text` | vc `text` + ports from pc `text` | See `06-text-engine.md` |
| L2 | `astudio-plugins` | pc+vc `plugins` | One wasmi host; one plug-in ABI with filter and live-effect entry points. Needs only L0 and L1 crates; sits below `astudio-effects` inside L2 |
| L2 | `astudio-pathops`, `astudio-trace`, `astudio-effects`, `astudio-vbrush` | vc `pathops`, `trace`, `effects`, `brush` | P2-14 (pathops, effects, vbrush). Inside L2, `effects` may use `plugins`, `pathops` and `text`; `trace` may use `pathops` (VectorCraft's order) |
| L2 | `astudio-ops`, `astudio-paint`, `astudio-algo`, `astudio-vector` | pc same names | `vector` (pc shape rasterizer) shrinks as vc render takes over |
| L3 | `astudio-compose`, `astudio-gpu` | pc `compose`, `gpu` | CPU compositor = reference oracle; wgpu compositor = canvas |
| L3 | `astudio-render` | vc `render` | P2-14. vello_cpu; draws vector layers into tiles |
| L3 | `astudio-format` | pc `format` + vc `format` | `.astudio` read/write; `.pcraft` and `.vectorcraft` readers |
| L3 | `astudio-svg`, `astudio-pdf`, `astudio-eps`, `astudio-cad`, `astudio-metafile` | vc same names | |
| L4 | `astudio-io`, `astudio-tools` | pc `io`, vc `tools` (pc tools live in its engine and ui) | |
| L5 | `astudio-engine` | pc `engine` + vc `engine` | One command registry, one undo history, one guard |
| L6 | `astudio-ui` | pc `ui-egui` + vc `ui-egui` | Modes, panels, menus |
| L6 | `astudio-automation` | pc `automation` + vc `mcp` | Control channel and MCP server |
| L6 | `astudio-testkit` | both `testkit` | Test-only |
| L7 | `a-studio`, `a-studio-cli`, `a-studio-web` | both apps | Desktop, CLI and web shells |
| tool | `xtask` | both `xtask` | layers, corpus, assets, bundle, ico, version, wasm |

pc = PhotoCraft, vc = VectorCraft.

## Data flow

1. Input (mouse, pen, keys, CLI, MCP) becomes a command id plus JSON params.
2. `astudio-engine` runs the command against the document; every change is one undo step.
3. The document stores raster tiles, adjustment and text layers, and Vector layers holding node trees.
4. Rendering: each Vector layer is drawn by `astudio-render` into tiles and cached by layer revision;
   `astudio-gpu` composites all tiles; `astudio-compose` gives the same result on the CPU for tests.
5. Save writes the `.astudio` bundle incrementally.

## Rules that carry over unchanged

- Never crash: no `unwrap`, `expect`, `panic!`, indexing on input data, or unchecked arithmetic in shipped code; a guard catches panics per entry point and rolls back.
- No `unsafe` except `astudio-tablet` on Windows (pen input; D7).
- Everything is a command; the UI is thin.
- Never break wasm: L0 to L6 must build for `wasm32-unknown-unknown`.
- Bit depth and colour model are runtime data.
- Clean-room: no Adobe code, assets or screenshots; no GPL/AGPL code (Krita, GIMP, Inkscape, lib2geom).

## Open design points (decide in P1 or P2)

- Vector layer coordinate mapping: vector points (1/72 inch) to pixels via document resolution; store the resolution on the document, not the layer.
- Effects: PhotoCraft layer styles vs VectorCraft Appearance stack. Proposal: Appearance on Vector layers, layer styles on all layers, both rendered by the same effect kernels.
- Selection model: pixel selections (masks) and object selections (node ids) live side by side; each mode decides which one tools read.
