# Decisions

Settled on 8 October 2026. Change one only by editing this file in its own commit, with the reason.

| # | Question | Decision | Who |
| --- | --- | --- | --- |
| D1 | Fork or propose upstream | Fork | Owner |
| D2 | Scope | Pixel and Vector modes first. Layout mode later (after 1.0) | Owner |
| D3 | Text engine | VectorCraft's engine, with four PhotoCraft pieces ported onto it | Recommended, accepted |
| D4 | Native file | The `.pcraft` bundle layout under a new `.astudio` extension; vector layers stored as `.vectorcraft` v3 subtrees | Recommended, accepted |
| D5 | Name | A-Studio | Owner |
| D6 | Full merge after the P1 prototype | GO: one app | Owner, 8 October 2026 |
| D7 | Platforms | Windows only (D6 is kept for the P1 go/no-go result) | Owner, 8 October 2026 |
| D8 | Colour engine | One A-Studio engine: PhotoCraft `cms` at the core, VectorCraft's colour layer on top, new safe fast paths; default CMYK PhotoCraft Coated | Owner, 8 October 2026 |
| D9 | Third-party data the PDF reader builds in | Allowed: Adobe's published CMap tables (BSD-3-Clause) and the Foxit/PDFium fallback fonts (BSD) | Owner, 9 October 2026 |

## D1 Fork

- The ArtCraft name, wordmark and mark must be removed (their brand licence allows them only inside
  PhotoCraft and VectorCraft). A plain-text credit is allowed: "Based on PhotoCraft and VectorCraft by
  the ArtCraft team and contributors."
- Upstream keeps moving (both repos had commits on 8 October 2026). Pull upstream on a fixed schedule,
  every two weeks, with `scripts/sync-upstream.sh`. Keep A-Studio's own changes in separate crates
  where possible so each pull stays small.

## D2 Scope

- 1.0 = Pixel mode + Vector mode in one window, one document, one file.
- Layout mode is designed (see the mockup and `docs/11-ui-spec.md`) but not built before 1.0.
  The ArtCraft team's DesignCraft covers page layout in the meantime.

## D3 Text engine

Both stacks shape with `harfrust` and read fonts with `skrifa`. PhotoCraft wraps them in `parley`;
VectorCraft has its own layout engine (7,490 lines) with threaded frames, hyphenation, Japanese
composition rules, vertical type, variable-font instances and font subsetting for PDF/SVG. Keep that,
and port from PhotoCraft (6,664 lines): PSD text round trip (EngineData), Warp Text, optical kerning,
rasterizing into tiles. Details: `docs/06-text-engine.md`.

## D4 File format

`.pcraft` is a ZIP bundle with content-addressed, zstd-compressed 256-pixel tiles and incremental
saves; `.vectorcraft` is one JSON file with base64 images. The bundle handles large pixel data;
vector layers go into its manifest unchanged. New extension because PhotoCraft cannot open vector
layers. Readers for `.pcraft` and `.vectorcraft` stay. Spec: `docs/05-file-format.md`.

## D5 Name

A-Studio. A quick web search on 8 October 2026 found no graphics editor of that name. That is not a
trademark clearance: search the EUIPO (TMview) and USPTO registers before the first public build.
Avoid any Adobe-like naming (Ps, Ai, "Photo-", "-shop").

## D6 Go/no-go after P1

Decided by the owner on 8 October 2026: **GO**, merge PhotoCraft and VectorCraft into one app.

- Basis: `docs/p1-report.md`. The P1 prototype (`proto/`) passed the exit test: a PSD with a
  VectorCraft path as a Vector layer, drawn into tiles, saved and reopened; a one-path edit on a
  24 MP canvas with 1,000 paths in about 7 ms (target under 100 ms, Linux dev machine; the Windows
  run was still pending when the owner decided).
- Known limits carried into P2 to P4: VectorCraft's renderer shifts some edge pixels with its
  viewport origin (each tile always uses the same viewport); whole-layer changes redraw everything
  (about 0.7 s at 24 MP); the effects-to-plug-ins link breaks the layer rules and must be moved in P2.
- `proto/` stays as a throwaway reference; P2 ports code for real into `crates/`.

## D7 Platforms

Decided by the owner on 8 October 2026: A-Studio is a Windows-only desktop app.

- Reason: the owner chose to focus on one desktop platform.
- Builds, tests, CI, the baseline and packaging target Windows (x64 first). Linux and macOS builds,
  packages (AppImage, deb, rpm, Flatpak, FreeBSD, `.dmg`, notarization) and their icon formats
  (`.icns`, hicolor) are dropped.
- Not changed by this decision: the web build and the rule that L0 to L6 build for
  `wasm32-unknown-unknown`. They stay until the owner decides otherwise.
- Developers and agents may still build and test on Linux or macOS; that is a dev convenience, not
  a supported platform.

## D8 Colour engine

Decided by the owner on 8 October 2026, from the study in `docs/13-colour-engine.md`.

- One colour engine in `astudio-color`: PhotoCraft's `cms` (most accurate of the options measured:
  4 to 5 times lower error on CMYK conversions than moxcms; pure Rust, no `unsafe`, builds for the web).
- VectorCraft's colour layer sits on top: colour model kept per value, gradients, swatches, Lab and
  Delta E 2000, proof setups. Its ICC handling moves onto the one engine. Its Generic CMYK model stays
  as a named profile, so VectorCraft files open with the same colours. No user-visible feature is dropped.
- New documents use PhotoCraft Coated CMYK by default. Existing files keep the profile they name.
- moxcms leaves the shipped app; it stays a dev-dependency, as a test oracle.
- Speed: new matrix-shaper and fixed-point paths in safe code (task P2-12), target within 2 times
  moxcms's speed with accuracy unchanged. If that target is missed, using a second engine for the
  screen only is a new decision for the owner.
- Speed, revised by the owner on 9 October 2026 after P2-12: the fast paths are accepted as they are,
  accuracy unchanged. Measured against moxcms (1 thread, 4 threads): RGB to CMYK 1.3 and 1.7 times
  (within the target), CMYK to RGB 3.0 and 2.5 times, RGB to RGB 4.2 and 4.1 times
  (`docs/13-colour-engine.md`). Reason: the screen conversion runs on the GPU, and a 24-megapixel
  export or mode change now takes 0.05 to 0.26 s on 4 threads; the rest of the gap needs vector code
  or less exact tables. No second engine. More speed is later work, after 1.0.

## D9 PDF reader data

Decided by the owner on 9 October 2026, during P2-15 (the VectorCraft importers).

- The PDF reader (`hayro-interpret`, through `astudio-pdf`) compiles in Adobe's published CMap
  resources (https://github.com/adobe-type-tools/cmap-resources, BSD-3-Clause, through
  `hayro-cmap`), which decode Japanese, Chinese and Korean text, and the Foxit fonts from PDFium
  (BSD), which draw the fourteen standard PDF fonts when a file doesn't embed them. Both are
  allowed; their notices are in `NOTICE`.
- Reason: they are published under free licences for redistribution and are not taken from an
  Adobe product; without them, CJK text and unembedded standard fonts in PDFs import wrongly.
- Not changed: the clean-room rule stays as it is for everything else (no code, icons, presets,
  profiles, shaders or screenshots from Adobe products), and the bundled UI fonts stay the four in
  `assets/fonts`.
