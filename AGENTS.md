# AGENTS.md: rules for people and AI agents

A-Studio merges PhotoCraft and VectorCraft (both MIT OR Apache-2.0, by the ArtCraft team) into one
pixel-and-vector editor. Read `docs/00-decisions.md` and `docs/02-architecture.md` before changing code.

## Start every session

1. `git pull`, then `scripts/sync-upstream.sh` if you are porting upstream code.
2. Find your task in `docs/data/backlog.csv` (id, depends_on, done_when). Work on one task per branch.
3. Check `docs/01-roadmap.md` for the phase's exit test.

## Non-negotiables

- **Never crash.** No `unwrap`, `expect`, `panic!`, `unreachable!`, `todo!`, `unimplemented!` outside
  tests. Use `?`, `ok_or`, `let … else`. Use `.get(i)` for indices that come from data. Cap sizes read
  from files. Every crash fix comes with a test that panicked before.
- **No `unsafe`**, except `astudio-tablet` on Windows (pen input through Wintab / Windows Ink), each block
  with a `SAFETY:` comment.
- **Everything is a command.** User-visible behaviour = a command in `astudio-engine` (id, label, menu
  path, shortcut, params doc, `enabled`, `run`) plus tests. The UI, CLI, control channel and MCP call commands by id.
- **Layers.** A crate depends only on lower layers (`cargo run -p xtask -- layers`). Nothing below L6 uses egui, eframe, winit or rfd.
- **Never break wasm.** L0 to L6 build for `wasm32-unknown-unknown`.
- **No format assumptions.** Bit depth and colour model are runtime data; colour conversions go through `astudio-color`.
- **Clean-room.** No code, icons, presets, profiles, shaders or screenshots from Adobe products. No GPL or
  AGPL code (Krita, GIMP, Inkscape, lib2geom). Ideas from them are fine; code is not. Test programs
  count as code. Allowed by the owner: the PDF reader's built-in data (Adobe's CMap tables, Foxit
  fallback fonts; D9).
- **No ArtCraft marks** in shipped files (`scripts/rebrand-scan.sh --shipped`). Plain-text credit only.
- **Assets.** Every new file under `assets/` gets a row in `ASSETS.md` in the same commit, with its
  licence text beside it. The small bundled UI fonts (Inter, JetBrains Mono, Source Sans 3, Source Serif 4; SIL OFL, owner
  approved 9 October 2026) live in `assets/fonts` with their OFL texts; the large CJK and Arabic
  fonts never go in this repo: they come from `CRAFT_FONTS_DIR`.
- **Upstream code.** When you port a file, keep its licence header and note the upstream path and
  commit in the commit message (`ported from photocraft@e5e3e39 crates/doc/src/lib.rs`).

## Before you finish

```sh
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p xtask -- layers
cargo deny check
```

Commit message: `<task id>: <what changed>`, for example `P1-02: render vector layers into tiles`.
Update the task's `status` in `docs/data/backlog.csv` in the same commit.
