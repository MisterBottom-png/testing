---
paths:
  - "assets/**"
  - "ASSETS.md"
  - "NOTICE"
  - "packaging/**"
---

# Asset rules

- Every file under `assets/` has a row in `ASSETS.md` (path, title, author, source, licence) added in the same commit.
- Allowed: original work (MIT OR Apache-2.0), OSI licences, CC0, public domain, CC licences that allow redistribution, SIL OFL for fonts.
- Licence texts sit next to the assets they cover and are summarised in `NOTICE`.
- No font files in the repo: fonts come from `CRAFT_FONTS_DIR` (storytold/craft-fonts).
- No Adobe icons, presets, swatches, brushes, profiles or screenshots. No ArtCraft logos or icons.
- Upstream assets to keep, replace or remove are listed in `docs/data/assets.csv`.
