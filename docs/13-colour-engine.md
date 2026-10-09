# Colour engine study (for P2-02)

Asked by the owner on 8 October 2026: research the colour-management engines, borrow the best parts,
and combine them into one A-Studio engine. Default print colour for new documents: **PhotoCraft
Coated CMYK** (owner, same day).

## In short

- **Decided (D8, owner, 8 October 2026):** one A-Studio engine, built on PhotoCraft's `cms` (the most complete and the most
  accurate of the options we can ship), with VectorCraft's colour layer on top (colour model kept per
  value, Lab and Delta E 2000, its Generic CMYK model as a named profile, proof setups, swatches), and
  new fast paths so it is not slower than moxcms where it matters.
- **Not chosen:** LittleCMS (C library: breaks the web build and adds a C toolchain), qcms (8-bit only,
  no black point compensation), moxcms as the engine (fast, but no black point compensation, less
  accurate on print profiles, and its speed comes from `unsafe` code we may not write ourselves).
- **moxcms stays as a test oracle** (a dev-dependency only, as in PhotoCraft today): every engine
  change is checked against it.

## What each engine has

| | PhotoCraft `cms` | VectorCraft `color::cms` | moxcms 0.8.1 | LittleCMS 2.17 | qcms |
| --- | --- | --- | --- | --- | --- |
| Language | Rust, no `unsafe` | Rust (wraps moxcms) | Rust, 356 `unsafe` (SIMD) | C | Rust |
| Licence | MIT OR Apache-2.0 | MIT OR Apache-2.0 | BSD-3-Clause OR Apache-2.0 | MIT | MIT |
| Web build (`wasm32-unknown-unknown`) | yes | yes | yes | no (C) | yes |
| Reads ICC v2 and v4 | yes | through moxcms | yes | yes (v4.4) | partly |
| LUT profiles (mft1, mft2, mAB, mBA), CMYK | yes | through moxcms | yes | yes | no CMYK |
| Writes ICC profiles | yes (v4, byte-exact) | built-ins only | yes | yes | no |
| Rendering intents | 4 | 4 | 4 | 4 + black-preserving | partly |
| Black point compensation | yes | no | no (commented out in 0.8.1) | yes | no |
| 8, 16-bit and float pixels | yes | f32 | yes | yes | 8-bit |
| Soft proof, gamut check | yes (`Transform::proof`, `GamutCheck`) | yes (`ProofSetup`, gamut error) | no | yes | no |
| 3D LUT for the GPU canvas | yes (`Lut3d`) | no | no | no | no |
| LUT files (.cube) | yes | no | no | no | no |
| Built-in profiles | sRGB, P3, Adobe RGB-compatible, ProPhoto-compatible, linear sRGB, Rec. 2020, gray, Lab, coated CMYK | sRGB-family RGB, Generic CMYK model | sRGB, P3, Rec. 2020 and more | many | sRGB |
| Lab, Delta E 2000 | Lab | Lab, Delta E 2000 | Lab, Oklab, Oklch, Jzazbz, ICtCp | Lab, Delta E 2000, CIECAM02 | no |
| HDR (CICP, PQ, HLG) | no | no | yes | reads the tag only | no |

## Measured: speed and accuracy

`scripts/cms-bench` (run on 8 October 2026, Linux, Intel Xeon 2.1 GHz, 4 threads): the same profile
bytes through PhotoCraft `cms` and moxcms 0.8.1, a 24-megapixel image of random 8-bit pixels,
medians of five runs. Error is measured against PhotoCraft's exact floating-point pipeline, in 8-bit
steps (1 = the smallest visible step of an 8-bit value).

| Conversion | PhotoCraft, 1 thread | moxcms, 1 thread | PhotoCraft, 4 threads | moxcms, 4 threads | Error, PhotoCraft (mean / max) | Error, moxcms (mean / max) |
| --- | --- | --- | --- | --- | --- | --- |
| sRGB to Display P3 | 1,098 ms | 49 ms | 287 ms | 14 ms | 0.000 / 1 | 0.038 / 1 |
| sRGB to Coated CMYK | 1,057 ms | 542 ms | 297 ms | 142 ms | 0.27 / 31 | 1.24 / 52 |
| Coated CMYK to sRGB | 2,173 ms | 414 ms | 574 ms | 101 ms | 0.21 / 6 | 0.80 / 15 |

What this says:

- PhotoCraft's engine is 4 to 5 times more accurate on print (CMYK) conversions, and about equal on
  screen (RGB to RGB) conversions.
- moxcms is 2 to 22 times faster. The biggest gap is RGB to RGB: PhotoCraft sends every pixel through
  a general 3D lookup table, while moxcms has a dedicated path for these simple profiles.
- Building a conversion takes milliseconds in both.
- The reference is PhotoCraft's own exact pipeline, which favours PhotoCraft slightly. PhotoCraft's
  tests already found one moxcms error checked by hand (a dark green that moxcms turns red 19 instead
  of 0.73 out of 255).
- On the canvas, colour conversion for the screen already runs on the GPU through a 3D LUT, so CPU
  speed matters for mode conversion, export, thumbnails and CMYK documents. Per 256-pixel tile,
  PhotoCraft's slowest case is about 1.5 ms on 4 threads.

## The combined A-Studio engine

One engine, `astudio-color` (L0), in this order:

1. **Core: PhotoCraft `cms`**, unchanged: parsing, writing, intents, black point compensation,
   proofing, gamut check, LUT files, the GPU 3D LUT, and the synthetic coated CMYK profile (the
   default, owner's choice).
2. **PhotoCraft `color`**: runtime bit depth, the eight PSD colour modes, blend modes (28, with the
   PSD keys).
3. **VectorCraft `color`** as a module: colour model kept per value, gradients, freeform gradients,
   swatches, harmony, recolour. Its ICC work (`IccProfile`, `register_icc`, proof LUTs) moves onto the
   core engine, so there is one engine. Its **Generic CMYK** model stays as a named profile, so
   VectorCraft files open with the same colours. Its Delta E 2000 joins the Lab code.
4. **Fast paths (new, safe code)**, borrowing moxcms's ideas but not its `unsafe` code:
   - a matrix-shaper path for RGB and gray to RGB and gray (linearize by table, 3 by 3 matrix,
     encode by table), instead of the general 3D table;
   - integer (fixed-point) tetrahedral interpolation for 8 and 16-bit LUT conversions;
   - written to let the compiler vectorise; the `wide` crate (Zlib licence, allowed) only if needed.
   Targets: within 2 times moxcms's speed on the table above, with PhotoCraft's accuracy unchanged
   (checked by tests against the exact pipeline and against moxcms).
5. **Later, from other engines' ideas** (backlog, after P2): black-preserving CMYK to CMYK intents
   (LittleCMS idea), Oklab and Oklch for colour pickers and smooth gradients (moxcms, CSS Color 4),
   per-document soft-proof settings and a gamut warning overlay (Krita and GIMP ideas), HDR profiles
   (CICP, PQ, HLG).

What is dropped: nothing a user sees. moxcms leaves the shipped app (it stays as a test oracle).

## Fast paths so far (P2-12, in progress)

Measured 9 October 2026 with `scripts/cms-bench` (now also running A-Studio's engine; fastest of seven
runs, same machine as above, 24 MP of random 8-bit pixels):

| Conversion | A-Studio, 1 thread | PhotoCraft, 1 thread | moxcms, 1 thread | A-Studio / moxcms (1 thread, 4 threads) | Error, A-Studio (mean / max) |
| --- | --- | --- | --- | --- | --- |
| sRGB to Display P3 | 204 ms | 822 ms | 49 ms | 4.2, 4.1 | 0.000 / 1 (unchanged) |
| sRGB to Coated CMYK | 597 ms | 992 ms | 468 ms | 1.3, 1.7 (target met) | 0.27 / 31 (unchanged) |
| Coated CMYK to sRGB | 930 ms | 1,839 ms | 312 ms | 3.0, 2.5 | 0.21 / 6 (unchanged) |

What changed, all in safe code in `astudio-color` (`cms/transform.rs`, `cms/clut.rs`):

- **Exact 8-bit output encoding.** Output curves were evaluated through a table indexed by `x^(1/4)`
  (two square roots and an interpolation per channel). Now a table indexed by the bits of the float
  (log-spaced, fine near black) holds each bucket's 8-bit code and where in the bucket it steps up,
  so the result is the exactly rounded curve. Tests: every value of a million, for sRGB, gamma 2.2,
  gamma 1.8 and linear curves.
- **Fixed loops** for the common cases: RGB/gray matrix-shaper to RGB (3 to 3), RGB to CMYK (3 to 4)
  and CMYK to RGB (4 to 3), with whole grid nodes read at once and no general-size loops.
- Tests (`tests/fast_paths.rs`): RGB to CMYK is bit-identical to the general path; RGB to RGB and
  CMYK to RGB are never further from the exact pipeline than before (at most one value in 100,000
  more often one step off); absolute colorimetric equals relative colorimetric between the built-in
  D50-white profiles (the note below).

Where the rest of the gap is:

- **RGB to RGB** runs at about 70 machine instructions per pixel (profiled with valgrind): clamps,
  table indexing and the exact rounding, scalar. moxcms reaches 2 to 3 processor cycles per pixel with
  hand-written vector instructions (`unsafe` code A-Studio does not allow). Within 2 times needs
  vector code (the `wide` crate, safe, Zlib licence, allowed above) or an approximate output table
  (smaller and faster, but no longer exact near black for pure-gamma profiles).
- **CMYK to RGB** is limited by memory: its 17x17x17x17 grid is 1 MB of floats, and random pixels
  miss the cache. Halving it (16-bit or half-float nodes) changes accuracy slightly or needs hardware
  conversion instructions the default Windows build does not assume.
- On the canvas the screen conversion runs on the GPU (3D LUT); these CPU paths serve mode
  conversion, export and thumbnails. At 4 threads a 24 MP image now takes 54 ms (RGB to RGB) to 259 ms
  (CMYK to RGB).

## Open points

- If the fast paths miss the target, moxcms could run display-only conversions. That would bring
  back a second engine, with small colour differences between screen and export, so it needs the
  owner's decision then.
- `tintbox` (a new pure-Rust port of LittleCMS's pipeline, seen in pdf_oxide issue 749) claims
  bit-identical output to LittleCMS. Not used: too new, licence and maintenance unverified. Look again
  at the next upstream sync.

## Notes from the port (P2-02)

- The **absolute colorimetric** intent can give slightly different numbers from VectorCraft's old
  moxcms path for Wide Gamut RGB and Display P3: moxcms stored a D65 media white for them, the
  engine's built-in profiles store D50 (ICC v4). The other three intents are unchanged; no test
  covered absolute colorimetric (P2-12 adds one: between the built-in D50-white profiles it equals
  relative colorimetric).
- Built-in profile descriptions still name the upstream apps ("... (Photocraft)", "VectorCraft
  Generic CMYK (SWOP-like)"). They are written into exported files and used to match profiles
  again on import, so renaming them is a file-format change: decide with the rebrand work (P3).

## Sources

- PhotoCraft `crates/cms` (photocraft@e5e3e39), VectorCraft `crates/color` (vectorcraft@8b036df),
  moxcms 0.8.1 source.
- moxcms README and benchmarks: <https://github.com/awxkee/moxcms>, <https://crates.io/crates/moxcms>
- oxcms comparison of moxcms, LittleCMS, qcms and skcms: <https://github.com/imazen/oxcms>
- LittleCMS Rust wrapper: <https://lib.rs/crates/lcms2>
- qcms and tintbox gaps for print workflows: <https://github.com/yfedoseev/pdf_oxide/issues/749>
- moxcms vs LittleCMS cross-check: <https://github.com/sqzer-dev/sqzer/pull/19>
- Krita colour management and soft proofing: <https://docs.krita.org/en/reference_manual/preferences/color_management_settings.html>
- GIMP image colour management: <https://docs.gimp.org/2.99/en/gimp-image-color-management.html>
