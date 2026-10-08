---
name: quality-gate
description: "Run every A-Studio check that must pass before a commit or merge, and fix failures. Use before committing, before merging, or when asked whether the build is green."
allowed-tools: Bash(cargo *) Bash(scripts/rebrand-scan.sh *) Bash(git diff *) Bash(git status *)
---

Run these in order. Stop at the first failure, fix it, and start again from that step.

```sh
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p xtask -- layers
cargo check --workspace --target wasm32-unknown-unknown --exclude a-studio --exclude a-studio-cli --exclude xtask
cargo deny check
scripts/rebrand-scan.sh --shipped
```

How to fix the usual failures:
- clippy `unwrap_used` / `expect_used` / `panic` / `indexing_slicing`: return an error with `?`, use `.get()`; never add `#[allow]` to get past it.
- layers: the crate depends on something in its own or a higher layer. Move the shared code down, or use a trait in the lower crate. Never edit `xtask/src/table.rs` to hide it.
- wasm: file system, threads or native-only crates in L0 to L6. Put them behind `#[cfg(not(target_arch = "wasm32"))]` or move them to L7.
- cargo deny licences: a new dependency's licence is not allowed. Ask the owner; do not edit `deny.toml` alone.
- rebrand: ArtCraft text or `ai.storyteller` ids in shipped files. Replace them per `docs/07-fork-and-rebrand.md`.

If a step cannot run here (no network for `cargo deny`, no wasm target), say so in the report; do not mark it passed.

Report: one line per step, passed or failed, with the fix you made.
