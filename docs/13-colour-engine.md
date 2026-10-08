# Colour engine study (for P2-02)

Asked by the owner on 8 October 2026: research the colour-management engines, borrow the best parts,
and combine them into one A-Studio engine. Default print colour for new documents: **PhotoCraft
Coated CMYK** (owner, same day).

## In short

- **Recommendation:** one A-Studio engine, built on PhotoCraft's `cms` (the most complete and the most
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

## Open points

- If the fast paths miss the target, moxcms could run display-only conversions. That would bring
  back a second engine, with small colour differences between screen and export, so it needs the
  owner's decision then.
- `tintbox` (a new pure-Rust port of LittleCMS's pipeline, seen in pdf_oxide issue 749) claims
  bit-identical output to LittleCMS. Not used: too new, licence and maintenance unverified. Look again
  at the next upstream sync.

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
