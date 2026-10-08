# Quality and CI

## Gates on every pull request (`.github/workflows/ci.yml`)

| Gate | Command | Fails when |
| --- | --- | --- |
| Format | `cargo fmt --all --check` | Any file is not formatted |
| Lint | `cargo clippy --workspace --all-targets -- -D warnings` | Any warning, including the no-panic lints |
| Tests | `cargo test --workspace` | Any test fails |
| Layers | `cargo run -p xtask -- layers` | A crate depends on its own or a higher layer, or UI below L6 |
| Web | `cargo check --workspace --target wasm32-unknown-unknown --exclude a-studio --exclude a-studio-cli --exclude xtask --exclude astudio-testkit` | L0 to L6 stop building for the web (the test-only `astudio-testkit` is left out, as upstream does) |
| Licences | `cargo deny check` | A dependency licence is not on the allow list, or has a known advisory |
| Assets | `cargo xtask assets` | A file under `assets/` has no row in `ASSETS.md` |
| Rebrand | `scripts/rebrand-scan.sh --shipped` | ArtCraft marks in shipped files |

## No-panic lints (same as both upstream repos)

`clippy.toml` allows these in tests only; every non-test crate carries:

```rust
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]
```

## Test kinds to keep from upstream

- Round trip on real files: PSD corpus (PhotoCraft 307 of 309 psd-tools files render the same after re-save), SVG/PDF corpus (VectorCraft).
- Compositor oracle: CPU and GPU results within 1/255.
- Property tests: file formats (proptest).
- Fuzzing: importers, command sweep with adversarial params, MCP protocol.
- UI snapshot tests: egui_kittest, offscreen renders compared to goldens.
- Benchmarks: `criterion` plus the upstream perf budgets (24 to 36 MP images; 20,000 shapes in about 27 ms in VectorCraft).

## New tests A-Studio needs

- Vector layer: render into tiles equals VectorCraft's own render of the same tree (pixel diff 1/255).
- `.astudio` round trip for every `.pcraft` and `.vectorcraft` corpus file.
- Mode switch: every command in each mode runs on documents that mix pixel and vector layers.
- Text: golden paragraphs in Latin, Arabic, Japanese vertical (see `06-text-engine.md`).
