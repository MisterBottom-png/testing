---
name: add-asset
description: "Add an icon, image, translation, font reference or other non-code file to A-Studio with correct attribution. Use whenever a file goes under assets/ or a packaging icon changes."
---

1. Check the licence is allowed (`.claude/rules/assets.md`). If unclear, stop and ask the owner.
2. Put the file under `assets/<kind>/`. Original A-Studio work is MIT OR Apache-2.0.
3. Put the licence text next to it if it is third-party (`assets/<kind>/LICENSE-<source>.txt`).
4. Add a row to `ASSETS.md`: path, title, author, source URL, licence.
5. Third-party: add or update its line in `NOTICE`.
6. Upstream assets: copy the row from `docs/data/assets.csv` only if its `a_studio_action` is KEEP.
7. Icons: export every size from one master SVG (see the new-assets table in `docs/04-assets.md`).
8. Commit the file, the licence text and both rows together.
