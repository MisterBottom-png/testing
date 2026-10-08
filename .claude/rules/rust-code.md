---
paths:
  - "crates/**/*.rs"
  - "apps/**/*.rs"
  - "xtask/**/*.rs"
---

# Rust code rules

- Non-test code never panics: no `unwrap()`, `expect()`, `panic!`, `unreachable!`, `todo!`, `unimplemented!`.
  Use `?`, `.ok_or(..)?`, `let .. else { return Err(..) }`, `if let`, `unwrap_or*` only when the fallback is correct.
- Indices that come from files, params or arithmetic: `.get(i)`, never `v[i]` or `&s[a..b]`.
- Sizes and counts read from input are capped before allocating; use `checked_*` / `saturating_*`.
- Divisions guard against zero; floats are checked with `is_finite()` before casts or loops.
- Recursion over documents has a depth limit.
- No `unsafe` (only `crates/tablet` may, with a `SAFETY:` comment per block).
- Bit depth and colour model are runtime data; never add a `u8`-only pixel path to a public API; never assume sRGB.
- Every crate root keeps `#![forbid(unsafe_code)]` and the `#![deny(clippy::unwrap_used, ...)]` line.
- New user-visible behaviour is a command in `astudio-engine` with tests. The UI only calls `app.run(id, params)`.
- Below L6, never use egui, eframe, winit or rfd. L0 to L6 must build for `wasm32-unknown-unknown`.
- Every crash fix comes with a test that panicked before the fix.
