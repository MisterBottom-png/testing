# Assets

The two upstream repos list 356 asset rows: 37 in PhotoCraft's `ATTRIBUTION.md` and 319 in VectorCraft's `ASSETS.md`. A row can cover one file or a whole folder. Every row is in `docs/data/assets.csv` with an action for A-Studio.

| Action | PhotoCraft rows | VectorCraft rows | Meaning |
| --- | --- | --- | --- |
| KEEP | 30 | 294 | Ship as is; keep its licence file and copy its attribution row into A-Studio's `ASSETS.md` |
| REPLACE | 1 | 17 | Upstream app icon and its folder; A-Studio needs its own |
| REMOVE | 1 | 8 | ArtCraft trademark files; the brand licence forbids them in a fork |
| EXTERNAL | 5 | 0 | Test files fetched by script; never committed or shipped |

## Kept assets by licence

| Licence | Rows | What it asks of A-Studio |
| --- | --- | --- |
| MIT OR Apache-2.0 | 174 | Nothing extra; same licence as the code |
| ISC (Lucide) | 117 | Ship `LICENSE-lucide.txt` |
| other:  | 14 | Read the row in assets.csv |
| SIL OFL 1.1 | 11 | Ship the OFL text; never sell the font alone; do not use the reserved font name for a modified font |
| other: — | 5 | Read the row in assets.csv |
| CC BY 3.0 | 1 | Credit the author in the app or docs (Noun Project magnetic lasso glyph) |
| SCOWL | 1 | Keep the SCOWL notice |
| CC0 | 1 | Nothing |

## Remove and replace

| Repo | Path | Action |
| --- | --- | --- |
| photocraft | `assets/app-icon/` (all files) | REPLACE (upstream app icon / owner artwork) |
| photocraft | `docs/brand/` (all files) | REMOVE (ArtCraft trademark) |
| photocraft | `corpus/photoshop/` (256 PSDs) | EXTERNAL (test input, fetched by script, never shipped) |
| photocraft | `corpus/psd-tools/` (309 files) | EXTERNAL (test input, fetched by script, never shipped) |
| photocraft | `corpus/psd/` (170 files) | EXTERNAL (test input, fetched by script, never shipped) |
| photocraft | `corpus/heif/` (9 files, 0.1 MB) | EXTERNAL (test input, fetched by script, never shipped) |
| photocraft | `corpus/pngsuite/` | EXTERNAL (test input, fetched by script, never shipped) |
| vectorcraft | `docs/brand/artcraft-logo-white.png` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-logo-white.svg` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-logo.png` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-logo.svg` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-mark-black.png` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-mark-black.svg` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-mark.png` | REMOVE (ArtCraft trademark) |
| vectorcraft | `docs/brand/artcraft-mark.svg` | REMOVE (ArtCraft trademark) |
| vectorcraft | `assets/app-icon/LICENSE.txt` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/README.md` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/128x128/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/16x16/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/24x24/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/256x256/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/32x32/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/48x48/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/512x512/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/64x64/apps/ai.storyteller.vectorcraft.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/hicolor/scalable/apps/ai.storyteller.vectorcraft.svg` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/vectorcraft-1024.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/vectorcraft-macos-512.png` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/vectorcraft-small.svg` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/vectorcraft.icns` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/vectorcraft.ico` | REPLACE (upstream app icon / owner artwork) |
| vectorcraft | `assets/app-icon/vectorcraft.svg` | REPLACE (upstream app icon / owner artwork) |

## New assets A-Studio must create

None of these exist yet. Each must be original work (or CC0, OFL or MIT/Apache) and get a row in `ASSETS.md` in the same commit.

| Asset | Sizes and formats | Used where | Notes |
| --- | --- | --- | --- |
| App icon, master | SVG on a 1024 grid, plus a 1024 PNG | Everything below is exported from it | No Adobe-like letter tiles (Ps, Ai). Must read at 16 px |
| macOS icon | `.icns` with 16, 32, 64, 128, 256, 512, 1024 px (1x and 2x) | App bundle | Upstream uses `packaging/icons.sh`; reuse the script, swap the source |
| Windows icon | `.ico` with 16, 24, 32, 48, 64, 128, 256 px | exe, MSI, shortcuts | `xtask ico` upstream builds it |
| Linux icons | hicolor PNGs 16 to 512 and a scalable SVG, named after the new app id | AppImage, deb, rpm, Flatpak | File names change from `ai.storyteller.*` to the A-Studio app id |
| Web icons | favicon 32, apple-touch 180, PWA 192 and 512, maskable 512 | Web build | |
| Document icon for `.astudio` | Same size sets as the app icon | File managers | One icon for the new format; keep upstream document icons out |
| Wordmark | SVG, light and dark | About window, splash, README, website | Text "A-Studio" in an OFL font you ship (Inter is already bundled) |
| Splash / welcome screen art | PNG 2x, under 300 KB | First run | Public-domain or original art only |
| Tool icons | 24 px SVG grid | Toolbox | Merge both icon sets; both already use Lucide (ISC), so one set covers both apps. Draw the few missing glyphs yourself |
| Cursors | Generated in code | Canvas | VectorCraft already draws its cursors in code (`crates/ui-egui/src/cursors.rs`); keep that approach |
| Default swatches, brushes, patterns, styles | Generated in code | Panels | Both upstream policies: generate defaults in code, never ship Adobe libraries |
| README and website screenshots | PNG or JPEG, public-domain art on the canvas | GitHub, website | Upstream uses Wikimedia public-domain paintings; keep doing that |
| Translations | `.tsv` per language | UI | Upstream files are MIT OR Apache-2.0 and can be merged; label keys differ between the apps |
| About-window credits | text | About dialog | Plain-text line: based on PhotoCraft and VectorCraft by the ArtCraft team and contributors |

## Fonts

- Bundled UI fonts that stay: Inter (both apps), JetBrains Mono (both), Source Sans 3 and Source Serif 4 (VectorCraft). All SIL OFL 1.1.
- Optional CJK and Arabic fonts come from `storytold/craft-fonts` through `CRAFT_FONTS_DIR`. They are OFL, so a fork may use them; keep them out of the repo, as upstream does.
- Never commit a font file without its OFL text next to it and a row in `ASSETS.md`.
