---
paths:
  - "crates/**"
  - "apps/**"
  - "upstream/**"
---

# Porting upstream code

- `upstream/` is read-only. Copy from it; never edit it.
- Keep every upstream licence header and copyright line.
- Commit message names the source: `ported from photocraft@<sha> crates/doc/src/lib.rs`.
- Rename crates and paths `photocraft-*` / `vectorcraft-*` to `astudio-*`; register each new crate in `xtask/src/table.rs`.
- Port the upstream tests with the code; a port is done when the upstream tests pass in this workspace.
- Do not copy ArtCraft names, links, logos, app ids (`ai.storyteller.*`) or Discord/getartcraft links into shipped code.
- Never copy code from GPL or AGPL projects (Krita, GIMP, Inkscape, lib2geom) or anything from Adobe products.
