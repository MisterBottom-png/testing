# Research: Pantone colours for inserts and swing tags

**Date:** 8 October 2026 · **Status:** research only, nothing built · **Decision needed:** see the questions at the end.

## The ask

Designers making inserts (printed fabric or paper slips) and swing tags (printed card tags) need to
pick a Pantone colour, such as `PANTONE 186 C`, see it on screen, use tints of it, and send the
printer a PDF where that colour is a named spot ink, not a CMYK mix. The owner wants this without
paying for Pantone data. The Pantone systems in scope are the print ones: **C** (coated) and **U**
(uncoated).

## What A-Studio already gets from its upstream code

A-Studio is built from PhotoCraft (Pixel mode) and VectorCraft (Vector mode). Inserts and swing tags
are vector artwork, so Vector mode is the one that matters. Almost everything is already there in
VectorCraft; the paths below are in `upstream/vectorcraft` after `scripts/bootstrap.sh`.

| Need | VectorCraft today | Where |
| --- | --- | --- |
| A swatch that is a spot colour | Yes: `Swatch { name, paint, global, spot }`. A spot is a global swatch with `spot: true` | `crates/color/src/swatch.rs:8-18` |
| Define the colour in Lab (how real ink books are defined) or CMYK | Yes: the paint colour can be Lab, CMYK, RGB or Gray | `crates/color/src/lib.rs:26-50` |
| Tints (40 % of a spot) | Yes: art links to the swatch by name with a `tint` 0..1; Lab tints move toward paper white, as in PDF | `crates/color/src/lib.rs:275-292` |
| Swatches panel, New Swatch and Swatch Options dialogs with a Spot Color type | Yes | `crates/ui-egui/src/panels/swatches.rs`, `dialogs/new_swatch.rs`, `dialogs/swatch_options.rs` |
| Swatch libraries panel, Add to Swatches, user library folder | Yes: `swatch.library.*` commands; user folder scans `.vcswatches` and `.gpl` | `crates/engine/src/cmd/swatchlib.rs` |
| Separations preview with one plate per spot | Yes | `crates/ui-egui/src/panels/separations.rs`, `crates/doc/src/inks.rs` |
| Spot in the PDF for the printer | Yes: `/Separation /<Name>` with a CMYK alternate, or a true Lab alternate when "Lab Values" is on (not in PDF/X-1a). PDF/X-1a, X-3, X-4 with output intent | `crates/pdf/src/export.rs:622-650`, `crates/pdf/src/lab_spot.rs`, `crates/pdf/src/pdfx.rs` |
| Spot in EPS | Yes: Level 2 `/Separation` plus `%%CMYKCustomColor` | `crates/eps/src/scene.rs:186-211` |
| Opening a printer's PDF or `.ai` with Pantone spots | Yes: names come back as spot swatches at their tints, Lab alternates kept | `crates/pdf/src/import_color.rs` |
| Print separations, convert spots to process, ink angles | Yes | `crates/ui-egui/src/dialogs/print.rs:664-720` |
| Overprint and overprint preview, spot blacks | Yes | `crates/doc/src/overprint.rs` |

PhotoCraft (Pixel mode) is weaker: spot channels exist (`channel.newSpot`) but the ink is a plain
sRGB colour with no Lab or CMYK definition and no book name, the swatches panel is 40 hard-coded
colours, there is no `/Separation` in its PDF writer, and PSD colour-book spaces are misread as RGB
(`crates/io/src/channel_map.rs:82`). Its own scorecard lists these as missing (FILE-215-14, -17, -21).

## What is missing

1. **No colour-book data.** Neither upstream ships any Pantone-like list, and neither can read the
   common swatch-file formats: ASE (Adobe Swatch Exchange), ACO, ACB, or CSV. VectorCraft reads only
   its own `.vcswatches` JSON and GIMP `.gpl` (which loses the spot flag).
2. **No book identity on a swatch.** A swatch has a name, one colour and two flags. There is no field
   for "which book", "which code", or a separate CMYK alternate next to the Lab definition.
3. **Name clashes make extra plates.** Adding `PANTONE 186 C` twice from a library can produce
   `PANTONE 186 C 2`, which prints as a second ink (`swatchlib.rs:399-451`).
4. **No DeviceN.** A gradient that mixes a spot with process colours, or two spots, exports as process.
   Flat spot colours and single-spot gradients are fine. For tags and inserts this is rarely needed.
5. **Two repo checks will fight the word Pantone.** VectorCraft's `cargo xtask brands` has `pantone`
   on its deny list for shipped strings (`xtask/src/brands.rs:18-33`), and every file under
   `assets/` needs an `ASSETS.md` row with a licence. A-Studio's own xtask does not carry the brand
   list yet, but it will when VectorCraft's xtask is ported (see `docs/02-architecture.md`).

## Getting the colour values without paying

Pantone has no free data. Its website now shows `#XXXXXX` placeholders and points to Pantone
Connect (from about $95 per seat per year). Adobe lost the bundled books in 2022 for the same reason.
Inkscape, Scribus, GIMP and Krita ship no Pantone books, and their developers say Pantone would not
license them. The values of a colour are facts and are not copyrightable, but **PANTONE** is a
trademark, Pantone claims copyright on the *system* and sends cease-and-desist letters to sites that
reproduce it, and its licence wording says any cross-reference to its system "may violate its
rights". So the safe free routes are the ones where the user brings the names and values.

| Route | Cost | Quality | Legal risk | Work in A-Studio |
| --- | --- | --- | --- | --- |
| **A. User imports a swatch file** from the printer or brand guide (ASE is the usual format; printers and brand books hand these out) | Free | As good as the file | None for us: user data | ASE reader (new, about 300 lines plus tests) |
| **B. User types the house colours** from the physical Pantone fan guide (Lab or CMYK printed on each chip) into a "Company colour book" | Free | Exact for the codes they own | None: user data | CSV reader plus a book editor in the Swatches panel |
| **C. Bundle a community list** (for example `adonald/Pantone-CMYK-RGB-Hex`, MIT, about 1,000 PMS codes with CMYK derived from a printer's reference and hex computed; `ajesma/Pantoner`, MIT, 3,238 codes, hex only) | Free | Approximate: not official, no Lab, some values visibly off | Real: shipping "PANTONE" names in the app and in `assets/` is exactly what the brand deny list and Pantone's letters target | Reader plus a licence row; owner's call |
| **D. Repos that extract Adobe's `.acb` books** (for example `unofficial-pantone-solid-coated-2024-v5`, Lab values, no licence) | Free | Best values | Highest: derived from Adobe's licensed asset; breaks the clean-room rule in `AGENTS.md` | Do not use |
| **E. freieFarbe HLC Colour Atlas** (2,040 Lab colours, free ASE and Excel, CC or zlib licence, DIN SPEC 16699) | Free | Exact and printable, but it is **not** Pantone; the printer must mix from Lab | None | Good as a bundled open book and as test data for the ASE reader |

Recommendation: build **A and B** (the app reads ASE and CSV and keeps a book name on each swatch),
bundle **E** as the one open book so the feature ships with real data, and leave **C** as an owner
decision (it can be a separate download the user drops into the library folder rather than a
shipped asset, which keeps A-Studio's shipped files clean of the trademark).

## How it would be built

Stage order follows the roadmap: VectorCraft's `color` crate becomes `astudio-color` in P2-02, the
swatches reach the merged document in P3-01, PDF export in P5-04. The colour-book code can be built
before that as a standalone crate, because it only needs plain structs.

1. **`astudio-colorbooks` (L0 standalone, no workspace deps, builds for wasm).** Readers for ASE
   (`ASEF` header, group start and end blocks, colour entries with UTF-16 names, models `CMYK`,
   `RGB `, `LAB `, `Gray`, type 0 global / 1 spot / 2 normal) and CSV
   (`book,code,name,L,a,b,C,M,Y,K,hex`). Size caps, no panics, fuzz target. Writer for ASE so a
   book can go back to the printer. Done when the freieFarbe ASE and a hand-made ASE round-trip.
2. **Swatch fields (in `astudio-color`, P2-02).** Add `book: Option<String>` and `code:
   Option<String>` with `#[serde(default)]` so v3 `.vectorcraft` files still open; keep the one
   `Color` as the definition (Lab for ink books) and derive the CMYK alternate as today.
3. **Library plumbing (P3-01).** `swatch.library.load` learns `.ase` and `.csv`; a "Colour Books"
   category in the library panel; a library can flag "all spot"; adding a swatch whose book and code
   already exist reuses it instead of making `… 2`.
4. **Company colour book UI.** New Swatch and Swatch Options get Book and Code fields; a "Save as
   book" action writes CSV or ASE to the user library folder.
5. **PDF (P5-04).** No change needed for flat spots. Optional later: DeviceN for mixed gradients,
   and an ink list in the export dialog.
6. **Pixel mode (later).** Let a spot channel point at a book swatch so Lab survives, and fix the
   PSD colour-book space read. Not needed for inserts and swing tags.
7. **Templates (if wanted).** Artboard presets for tag and insert sizes with bleed, and a
   non-printing `Dieline` spot swatch, which is how printers expect cut lines.

Each step is one backlog task with a `done_when` and tests, per `AGENTS.md`.

## Questions for the owner

1. **Where do the values come from?** Does the printer or brand guide give you an ASE or Excel file
   of the colours you use, or do you only have the physical Pantone fan guide to type from?
2. **How many colours?** The handful of house colours used on tags and inserts, or the whole Solid
   Coated and Uncoated books (about 2,300 codes)?
3. **Bundle a community "Pantone" list in the app?** Free and approximate, but it puts the PANTONE
   name in shipped files. Alternatives: ship only the readers, or offer it as a separate download.
4. **Coated only, or coated and uncoated?** Swing tags are usually coated card (C); fabric or
   uncoated inserts use U, which prints visibly different.
5. **Which PDF does the printer want?** PDF/X-1a (CMYK plus spots, most common for tags) or
   PDF/X-4 (keeps Lab spots and transparency)?
6. **When?** Build the book readers now as a standalone crate alongside P2, or wait until swatches
   exist in the merged app (after P3-01)?
7. **Templates?** Should A-Studio come with swing tag and insert artboard presets, bleed and a
   `Dieline` spot colour, or is that for later?

## Sources

- [Pantone Connect pricing](https://support.pantone.com/en/what-is-the-price-of-pantone-connect-license)
- [Pantone colour finder, 186 C](https://www.pantone.com/color-finder/186-C) (values shown as placeholders)
- [Adobe removes Pantone books, NPR interview with A. Perzanowski](https://www.npr.org/transcripts/1134608195)
- [Inkscape developers on Pantone licensing](https://lists.inkscape.org/hyperkitty/list/inkscape-devel@lists.inkscape.org/message/MMFGNCDLQKBL2GZCCEZXVCVBHBPTKY2O)
- [freieFarbe HLC Colour Atlas](https://freiefarbe.de/en/thema-farbe/hlc-colour-atlas/)
- [freieFarbe on Pantone's licence wording](https://freiefarbe.de/wp-content/uploads/2019/07/fFpresentation-lgm2019b.pdf)
- [adonald/Pantone-CMYK-RGB-Hex](https://github.com/adonald/Pantone-CMYK-RGB-Hex), [ajesma/Pantoner](https://github.com/ajesma/Pantoner)
- [Global Graphics licence note on Pantone-named swatch printouts](https://documentation.globalgraphics.com/hqnc/copyright-notices-and-trademarks)
