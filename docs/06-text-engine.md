# Text engine plan

Decision D3: keep VectorCraft's text engine, port four PhotoCraft pieces onto it, retire `parley`.

## What each side has

| Capability | VectorCraft `text` (7,490 lines) | PhotoCraft `text` (6,664 lines) |
| --- | --- | --- |
| Shaping | harfrust 0.13 | harfrust 0.12 through parley 0.11 |
| Font reading | skrifa 0.47 | skrifa 0.44 |
| Line breaking | own | ICU segmenter through parley |
| Bidirectional (Hebrew, Arabic) | yes (`unicode-bidi`) | through parley |
| Vertical type, Japanese composition (kinsoku) | yes | vertical yes, kinsoku no |
| Threaded frames | yes | no |
| Hyphenation | yes | no |
| Variable fonts, subsetting for PDF/SVG | yes (`subsetter`, `write-fonts`) | no |
| PSD text round trip (EngineData) | no | yes (`engine_data.rs`, `psd.rs`, `psd_styles.rs`) |
| Warp Text | no (has Envelope Distort) | yes (`warp.rs`) |
| Optical kerning | no | yes (`optical.rs`) |
| Rasterize to tiles | no (vector output) | yes (`raster.rs`, `render.rs`) |
| Spell check | no | yes (`spell.rs`, SCOWL list) |
| Font discovery | own font database (`fontdb.rs`) | fontique through parley |

## Port list

| # | Piece | From | Into | Done when |
| --- | --- | --- | --- | --- |
| T1 | PSD EngineData read/write | pc `engine_data.rs`, `psd.rs`, `psd_styles.rs` | `astudio-text::psd` | PSD text corpus round-trips at PhotoCraft's current rate. Done (P2-05): 21 of 21, as PhotoCraft (`docs/baseline.md`) |
| T2 | Warp Text | pc `warp.rs` | `astudio-text::warp` | The 15 Photoshop warp styles render; matches PhotoCraft output within 1/255. P2-06: the warp maps every point exactly as PhotoCraft does (`tests/warp_photocraft.rs`); the pixel check needs text rendering and is part of P2-08 |
| T3 | Optical kerning | pc `optical.rs` | `astudio-text::optical` | Same pair adjustments as PhotoCraft on the test strings |
| T4 | Rasterize into tiles | pc `raster.rs`, `render.rs` | `astudio-text::raster` | Text layers composite identically on CPU and GPU |
| T5 | Spell check | pc `spell.rs` + SCOWL | `astudio-text::spell` | Edit > Check Spelling works in both modes |

## Checks

- Latin, Arabic (bidirectional), Japanese (vertical) paragraph rendered by the old and new engines; pixel diff stored as a golden.
- Same font discovery result on Windows and web (D7) (web: bundled fonts only).
- Speed: lay out 10,000 glyphs in under 10 ms in release (measure the baseline first in P0).
