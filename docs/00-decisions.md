# Decisions

Settled on 8 October 2026. Change one only by editing this file in its own commit, with the reason.

| # | Question | Decision | Who |
| --- | --- | --- | --- |
| D1 | Fork or propose upstream | Fork | Owner |
| D2 | Scope | Pixel and Vector modes first. Layout mode later (after 1.0) | Owner |
| D3 | Text engine | VectorCraft's engine, with four PhotoCraft pieces ported onto it | Recommended, accepted |
| D4 | Native file | The `.pcraft` bundle layout under a new `.astudio` extension; vector layers stored as `.vectorcraft` v3 subtrees | Recommended, accepted |
| D5 | Name | A-Studio | Owner |

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
