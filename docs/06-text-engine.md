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
| T3 | Optical kerning | pc `optical.rs` | `astudio-text::optical` | Same pair adjustments as PhotoCraft on the test strings. P2-07: identical for PhotoCraft's 94-pair sample in six of the bundled fonts (`tests/optical_photocraft.rs`). P2-17: applied in layout between shaping and line breaking (`CharStyle::optical_kerning`, also open to VectorCraft documents); a manual kern replaces automatic kerning in any mode and kerns only between two characters, as in PhotoCraft; PhotoCraft's manual, optical and modes-split-pairs tests pass (`src/tests_kerning.rs`) |
| T4 | Rasterize into tiles | pc `raster.rs`, `render.rs` | `astudio-text::raster` | Text layers composite identically on CPU and GPU. Split (P2-08 plan): drawing over VectorCraft's outlines in P2-08; optical kerning in layout P2-17; mapping gaps P2-18 (done: faces by PostScript name, paragraph boxes from the lowercase ascender, ligatures kept with tracking, any OpenType feature with its value, synthetic bold and 14° oblique, Small Caps synthesised at 70% without `smcp`, vertical underline and strikethrough, forced line breaks U+0003, a 1 GiB raster cap; vertical anchors and auto leading already matched and are tested; hyphenation stays on where a paragraph asks for it, as Photoshop does, where PhotoCraft never hyphenated; corpus: 21 of 21 layers where Photoshop drew them, as PhotoCraft on the same host; `psd_type_bounds`: IoU above 0.97 in all eight cases); PhotoCraft has no GPU text path (text is drawn on the CPU into tiles and blended with text gamma), so CPU/GPU parity is the compositor port P2-19 |
| T5 | Spell check | pc `spell.rs` + SCOWL | `astudio-text::spell` | Edit > Check Spelling works in both modes. P2-09: the checker and the SCOWL list are in (PhotoCraft's tests pass); the Check Spelling command joins the merged command registry (P3-02) |

## Checks

- Latin, Arabic (bidirectional), Japanese (vertical) paragraph rendered by the old and new engines; pixel diff stored as a golden.
- Same font discovery result on Windows and web (D7) (web: bundled fonts only).
- Speed: lay out 10,000 glyphs in under 10 ms in release (measure the baseline first in P0).
