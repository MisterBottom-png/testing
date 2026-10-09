# Research: Pantone colours for inserts and swing tags

**Date:** 9 October 2026 · **Status:** research done, owner decided, prototype built and passing;
next is the real port after P2-02 and P3-01 (see "Next steps" at the end).

## The ask

Designers making inserts (printed fabric or paper slips) and swing tags (printed card tags) need to
pick a Pantone colour, such as `PANTONE 186 C`, see it on screen, use tints of it, and send the
printer a PDF where that colour is a named spot ink, not a CMYK mix. The owner wants this without
paying for Pantone data.

**Owner's answers (8 October 2026):** no printer files and no physical fan guide are available, so
the app has to come with the colours; the whole Solid Coated (C) and Solid Uncoated (U) books, not
just a house set; prototype it in VectorCraft upstream first, before the merge.

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
rights".

### The free datasets, checked on 8 October 2026

| Dataset | Licence | Sets | Codes | Values | Verdict |
| --- | --- | --- | --- | --- | --- |
| **`pantoner` 1.1.2 on npm** (James Pederson, 2014) | MIT | Coated, Uncoated, Metallics, Pastels & Neons, Skin, Colours of the Year | 1,341 C + 1,341 U + 301 metallic + 210 pastel/neon | sRGB hex only; `186-c` = `#c8102e`, which matches Pantone's own published simulation | **Best free data.** Every C code has its U twin. Pre-2019 book, so the 224 colours added since are missing. Its GitHub page now answers "451 Unavailable For Legal Reasons", which looks like a Pantone takedown; the npm package is still served |
| `pantone-colors` 1.0.3 on npm | MIT | Unlabelled (looks coated) | 907 | sRGB hex; `186` = `#ce1126` | Smaller, older values; all 899 codes it shares with `pantoner` differ by a few points. Not needed |
| `adonald/Pantone-CMYK-RGB-Hex` on GitHub | MIT | Unlabelled | 1,149 | CMYK copied from a printer's chart, RGB computed with the naive formula (`100` = `#FFFF7D`, real is `#F6EB61`) | Screen colours visibly wrong. Not usable |
| `Margaret2/pantone-colors` and forks | none stated | Fashion, Home + Interiors (TCX/TPG) | 2,310 | hex | Textile book, not the print books. Not this task |
| `pantonr`, `aj90909/unofficial-pantone-solid-coated-2024-v5`, `.acb` collections | MIT or none | Solid Coated 2024, with Lab | 3,219 | Lab, best quality | **Not allowed.** All derived from Adobe's or Pantone's own `.ase`/`.acb` library files; breaks the clean-room rule in `AGENTS.md` |
| freieFarbe HLC Colour Atlas | CC / zlib | Not Pantone: an open Lab atlas | 2,040 | Lab, spectral, ASE, Excel | Good as a bundled open book and as test data for the reader; printers can mix from Lab |

### What "sRGB hex only" means for quality

- A hex value is an 8-bit screen simulation. 279 of the 1,341 coated codes (and 125 uncoated) sit on
  a channel limit (0 or 255), which means the real ink is outside the sRGB gamut and the stored
  colour is a clipped, duller version. Oranges, bright blues and greens are the usual victims.
- The ink definition A-Studio stores will be Lab computed from that hex (sRGB → XYZ D50 → Lab),
  and the CMYK alternate will come from the colour management system. Both are approximations.
- For spot printing this is fine: the printer mixes `PANTONE 186 C` from the **name** on the PDF's
  separation; the stored colour only drives the screen, the tint ramps and the fallback if someone
  converts spots to process. Every swatch should carry a note that values are approximate.

### The best possible free solution

1. **Readers, not assets.** Give A-Studio a colour-book importer for CSV (`code,hex` or
   `code,L,a,b`) and ASE, plus a book name and code on each swatch. User files never trip the brand
   scan or the asset rules.
2. **The data comes in as a separate download, not inside the app's files.** A small "Get colour
   books" action fetches the MIT `pantoner` package from the npm registry (or a copy the owner keeps
   in a release of this repo), converts the four CSV files into `.vcswatches` colour books in the
   user library folder, and marks every swatch spot + global. The app's shipped files then contain
   no PANTONE names and no Pantone-derived asset, which is the same line Inkscape and Scribus hold,
   and the takedown of the `pantoner` GitHub page shows why that line matters.
3. **Ship freieFarbe as the built-in open book** so the feature works out of the box and the
   importer has real test data with a clean licence (one `ASSETS.md` row).
4. If the owner prefers to bundle the Pantone lists inside the app anyway, it is one `ASSETS.md` row
   (MIT) and a `brand-ok` exemption, and the trademark exposure is the owner's call; see question 1.

## Prototype in VectorCraft upstream (owner's choice)

Goal: prove, in the unmodified VectorCraft app at `upstream/vectorcraft` (pin `8b036df`), that a
designer can open a swing tag, pick `PANTONE 186 C` and `PANTONE 186 U` from a library, tint them,
and export a PDF/X-1a and a PDF/X-4 where both appear as named separations. The prototype lives in
a scratch branch of the upstream checkout (or `proto/` of this repo, like P1) and is thrown away;
the real work is ported into `astudio-*` crates later.

| Step | What | Done when |
| --- | --- | --- |
| 1 | `crates/color/src/palette_io.rs`: add `PaletteFormat::Csv` (`code,hex` and `code,L,a,b` columns, sniffed by header) and an ASE reader (`ASEF` header, group blocks, colour blocks with UTF-16 names, models `RGB `, `CMYK`, `LAB `, `Gray`, type 0 global / 1 spot / 2 normal), both with size caps and no panics | The four `pantoner` CSV files and the freieFarbe ASE load as libraries with every swatch spot + global |
| 2 | `Swatch`: add `book: Option<String>` and `code: Option<String>` with `#[serde(default)]` | Old `.vectorcraft` v3 files still open; new ones round-trip the fields |
| 3 | A `convert_book` xtask or CLI command: hex → Lab (D50) on import, so the stored definition is Lab like a real ink book | Lab of `186-c` from `#c8102e` is close to L 47, a 68, b 44 |
| 4 | `swatch.library.add`: when a swatch with the same book and code is already in the document, reuse it instead of creating `… 2` | Adding `186 C` twice gives one plate in Separations Preview |
| 5 | Library panel: a "Colour Books" category that lists books from the user folder | Books appear without restarting the app |
| 6 | End-to-end test in `crates/pdf`: document with `186 C` at 100 % and 40 %, `186 U` at 100 %, export X-1a and X-4, read back and assert two `/Separation` names and the tint values | Test green on Windows CI |
| 7 | Measure: library load time for 3,193 swatches and panel scrolling | Under 100 ms to load; no visible lag |

Then the A-Studio tasks (added to `docs/data/backlog.csv` once the prototype passes): the readers
into `astudio-color` (P2-02), the book fields and library category into the merged document
(P3-01), the "Get colour books" command in `astudio-engine`, and the freieFarbe asset with its row.

### Prototype results (9 October 2026)

Built in `proto/colorbooks` against unmodified VectorCraft `8b036df` (`cd proto && cargo test -p
colorbooks`; 11 tests, clippy clean).

| Step | Result |
| --- | --- |
| 1 CSV and ASE readers, ASE writer | Done. Size caps, no panics; damaged and truncated ASE files are refused. The four bundled lists load as 3,193 Lab spot swatches |
| 2 `book` and `code` on `Swatch` | Not possible without editing upstream; the prototype encodes them in the swatch name (`PANTONE 186 C`) and the library name. The real port adds the fields |
| 3 hex → Lab | Done through VectorCraft's colour settings; `#c8102e` gives a Lab red in the expected range |
| 4 No duplicate plates | Done: picking `PANTONE 186 C` twice gives one swatch and one plate; a process swatch that already carries the name is not hijacked |
| 5 Library panel category | Not in the prototype (UI); the libraries load through the existing `swatch.library.load` path |
| 6 PDF end to end | **Passes.** A CMYK swing tag with `186 C` at 100 % and 40 % and `186 U` at 100 % exports as PDF/X-1a, PDF/X-4 and plain PDF; every file carries `/Separation /PANTONE 186 C` and `/PANTONE 186 U`, and reading the file back gives two spot swatches linked at the right tints |
| 7 Speed | All 3,193 swatches load in about 80 ms on the Linux dev machine |

One finding to carry into the port: **Lab alternates only reach plain PDF.** In PDF/X-1a the
alternate is DeviceCMYK (by design). In PDF/X-4 VectorCraft writes the alternate as a reference to
the embedded ICC CMYK profile, and its Lab rewrite (`crates/pdf/src/lab_spot.rs`) only matches
`/DeviceCMYK`, so the Lab definition is dropped there too. The ink name is still correct, which is
what the printer uses; a fix in the port would teach the rewrite about ICC alternates.

## Owner's decisions (8 October 2026)

1. **Where the Pantone lists live:** bundled inside the app, as an MIT asset, accepting the
   trademark exposure (the alternative was a separate download fetched on request).
2. **Pre-2019 books are enough:** 1,341 codes per book plus metallics and pastels.
3. **Prototype first:** done, see above.

## Next steps

- Port for real after P2-02 and P3-01: readers into `astudio-color`, `book` and `code` fields on
  `Swatch`, a "Colour Books" library category, the data under `assets/colorbooks/` with its
  `ASSETS.md` row and a `brand-ok` exemption for the `cargo xtask brands` deny list.
- Teach the Lab rewrite about PDF/X-4 ICC alternates, or write Lab alternates directly in krilla.
- Optional: swing tag and insert artboard presets with bleed and a non-printing `Dieline` spot.

## Sources

- [Pantone Connect pricing](https://support.pantone.com/en/what-is-the-price-of-pantone-connect-license)
- [Pantone colour finder, 186 C](https://www.pantone.com/color-finder/186-C) (values shown as placeholders)
- [Adobe removes Pantone books, NPR interview with A. Perzanowski](https://www.npr.org/transcripts/1134608195)
- [Inkscape developers on Pantone licensing](https://lists.inkscape.org/hyperkitty/list/inkscape-devel@lists.inkscape.org/message/MMFGNCDLQKBL2GZCCEZXVCVBHBPTKY2O)
- [freieFarbe HLC Colour Atlas](https://freiefarbe.de/en/thema-farbe/hlc-colour-atlas/)
- [freieFarbe on Pantone's licence wording](https://freiefarbe.de/wp-content/uploads/2019/07/fFpresentation-lgm2019b.pdf)
- [`pantoner` on npm](https://www.npmjs.com/package/pantoner), [`pantone-colors` on npm](https://www.npmjs.com/package/pantone-colors)
- [adonald/Pantone-CMYK-RGB-Hex](https://github.com/adonald/Pantone-CMYK-RGB-Hex), [Margaret2/pantone-colors](https://github.com/Margaret2/pantone-colors)
- [Global Graphics licence note on Pantone-named swatch printouts](https://documentation.globalgraphics.com/hqnc/copyright-notices-and-trademarks)
