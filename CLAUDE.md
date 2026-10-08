# A-Studio

A-Studio merges PhotoCraft (Photoshop-style) and VectorCraft (Illustrator-style), two Rust apps by
the ArtCraft team (MIT OR Apache-2.0), into one pixel-and-vector editor. This is a fork.

@AGENTS.md
@docs/00-decisions.md

## Where things are

- Plan: `docs/01-roadmap.md` (phases P0 to P8, each with an exit test).
- Tasks: `docs/data/backlog.csv` (id, phase, depends_on, done_when, status).
- Target crates and layers: `docs/02-architecture.md`; layer table in `xtask/src/table.rs`.
- Upstream code: `upstream/photocraft`, `upstream/vectorcraft` (cloned by `scripts/bootstrap.sh`, never edited; pins in `upstream.lock`).
- Measurements: `docs/baseline.md`. Upstream syncs: `docs/upstream-log.md`.

## How to work here

- Use the skills: `/next-task` to do the next backlog task, `/port-crate` to bring an upstream crate in,
  `/quality-gate` before every commit, `/session-handoff` at the end of a session.
- Delegate: `upstream-scout` to find code in upstream, `rule-reviewer` to review a finished task with
  fresh eyes, `clean-room-auditor` before merging anything that adds files or dependencies.
- One task per branch, named after its id (`p1-02-vector-tiles`). Commit as `<task id>: <what changed>`.
- Speak to the owner in plain, simple words. He is not a Rust developer; explain results, not internals.

## Commands

```sh
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p xtask -- layers
cargo deny check
scripts/rebrand-scan.sh --shipped
```

## Stop and ask the owner before

- changing `docs/00-decisions.md`;
- choosing the app id (placeholder: `io.github.a-studio.astudio`) or the final app icon;
- adding a dependency whose licence is not in `deny.toml`;
- dropping an upstream feature instead of porting it;
- the P1 go/no-go decision (task P1-05).
