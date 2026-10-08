---
name: port-crate
description: "Bring one upstream PhotoCraft or VectorCraft crate into the A-Studio workspace as an astudio-* crate. Use when a task says port, move, adopt or merge an upstream crate."
argument-hint: "<upstream>/<crate> <astudio-name>   e.g. vectorcraft/geom geom"
---

Port `$ARGUMENTS`.

1. Find the target in `docs/02-architecture.md`: its layer and what it is built from. If two upstream
   crates merge into one target, port the first fully, then merge the second in a separate commit.
2. Record the source commit: `git -C upstream/<repo> rev-parse --short HEAD`.
3. Copy `upstream/<repo>/crates/<crate>/src` (and `tests/`, `benches/`, `build.rs`) over the stub in
   `crates/<astudio-name>/`. Keep licence headers. Keep the stub's crate-root lint lines.
4. Rename in code: `photocraft_<x>` / `vectorcraft_<x>` -> `astudio_<x>` for every crate already ported;
   leave references to not-yet-ported crates failing, and list them.
5. `Cargo.toml`: copy the upstream `[dependencies]`; external crates go into `[workspace.dependencies]`
   in the root `Cargo.toml` with the version `docs/03-dependencies.md` says to pick.
   Internal deps use `astudio-<x> = { path = "../<x>" }`.
6. If the target crate is new, add it to `xtask/src/table.rs` with its layer, and to the root `members`.
7. `cargo run -p xtask -- layers` must pass. A violation means the port pulls in a higher layer: stop and
   report it rather than moving the crate.
8. Port the upstream tests and test fixtures. Large binary fixtures are fetched, never committed.
9. Run `/quality-gate`. The upstream tests of this crate must pass here.
10. Run `/rebrand-check` on the new files.
11. Commit: `<task id>: port <repo>/<crate> to astudio-<name> (ported from <repo>@<sha> crates/<crate>)`.
