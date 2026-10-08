# A-Studio

A-Studio is one desktop and web app for pixel and vector work, built by merging two open-source
Rust projects: [PhotoCraft](https://github.com/storytold/photocraft) (a Photoshop-style image editor)
and [VectorCraft](https://github.com/storytold/vectorcraft) (an Illustrator-style vector editor), both
by the ArtCraft team and contributors, both MIT OR Apache-2.0.

This repository is the starting kit: every plan, decision, dependency, asset and script needed to
begin. The code from the two upstream projects is pulled in by `scripts/bootstrap.sh`; nothing here
is merged yet.

A-Studio is not affiliated with the ArtCraft team or with Adobe. Adobe, Photoshop and Illustrator are
trademarks of Adobe Inc., used only to describe compatible workflows.

## Start here

1. Read [`docs/00-decisions.md`](docs/00-decisions.md): the five settled decisions.
2. Install what [`docs/08-dev-setup.md`](docs/08-dev-setup.md) lists, then run `scripts/bootstrap.sh`.
3. Build both upstream apps once to get a baseline (`scripts/baseline.sh`).
4. Work through [`docs/01-roadmap.md`](docs/01-roadmap.md) phase by phase. Tasks are in
   [`docs/data/backlog.csv`](docs/data/backlog.csv).

## What is in this kit

| Path | What it is |
| --- | --- |
| `docs/00-decisions.md` | Fork, scope, text engine, file format, name: what was decided and why |
| `docs/01-roadmap.md` | Phases P0 to P8 with exit criteria and a go/no-go gate |
| `docs/02-architecture.md` | Target crate map, layers, how each upstream crate is merged |
| `docs/03-dependencies.md` | Toolchain, system packages, every Rust crate, release services and secrets |
| `docs/04-assets.md` | Every upstream asset with keep, replace or remove, and the new assets to make |
| `docs/05-file-format.md` | The `.astudio` file format, version 1 |
| `docs/06-text-engine.md` | Text engine plan: VectorCraft core plus four PhotoCraft ports |
| `docs/07-fork-and-rebrand.md` | Step-by-step fork, removal of ArtCraft marks, new app ids |
| `docs/08-dev-setup.md` | Machine setup on Linux, macOS and Windows |
| `docs/09-quality-and-ci.md` | Rules, tests, fuzzing, CI gates |
| `docs/10-release-and-legal.md` | Packaging, signing, licences, trademark |
| `docs/11-ui-spec.md` | Modes, panels, tools and shortcuts, from the mockup |
| `docs/12-feature-backlog.md` | Features to build after the merge, including ideas from Krita, GIMP and Inkscape |
| `docs/data/*.csv` | Generated inventories: dependencies, assets, rebrand hits; plus the task backlog |
| `AGENTS.md` | Rules for people and AI agents working in this repo |
| `Cargo.toml`, `crates/`, `apps/`, `xtask/` | Workspace skeleton with the target crates as empty stubs, and a layer checker |
| `scripts/` | Bootstrap, baseline build, upstream sync, rebrand scan |
| `.github/workflows/ci.yml`, `deny.toml` | CI and licence policy |

## Licence

MIT OR Apache-2.0, at your option, the same as both upstream projects. See `LICENSE-MIT`,
`LICENSE-APACHE` and `NOTICE`.
