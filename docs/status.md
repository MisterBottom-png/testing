# Status

**Date:** 9 October 2026 · **Phase:** P2 (shared core) under way: P2-00, P2-01 and P2-02 done.

## Start of the next session

1. Check out branch `a-studio` of `MisterBottom-png/testing`, then run `scripts/bootstrap.sh`.
2. Check that `/next-task` and the agents (`rule-reviewer`, `upstream-scout`, `clean-room-auditor`) are
   listed.
3. Next task: see the end of this file.

## Where the work lives

- Git: this session worked on branch `ccr-bdfb1782-6gges2` (the session's branch); the owner had it
  fast-forwarded into `a-studio` on 9 October 2026, so both hold the same history.
- Task branches were merged into the session branch with `--no-ff`; none is left unfinished.
- CI (`.github/workflows/ci.yml`) runs on Windows on every push.

## Done this session

| Task | One line |
| --- | --- |
| P0-03 | Windows baseline recorded (`docs/baseline.md`): both upstream apps build and pass all their tests (PhotoCraft 3,980, VectorCraft 3,997). The baseline workflow now runs four jobs in parallel on a Dev Drive with Defender off: 37 minutes instead of 3 h 21 |
| P2-00 | Layer-rule conflict from the P1 report fixed: `astudio-plugins` moved to L2 below `astudio-effects` |
| P2-01 | `astudio-geom`: VectorCraft's geometry plus PhotoCraft's pixel types and warp; crash fixes from review |
| Colour study | `docs/13-colour-engine.md`: five engines compared, PhotoCraft's and moxcms measured; owner chose one engine, recorded as **D8** (default CMYK: PhotoCraft Coated) |
| P2-02 | `astudio-color`: PhotoCraft's colour types and engine plus VectorCraft's colour layer, all on one engine; moxcms only a test oracle; crash and hang fixes from review |
| Proof | `scripts/upstream-compat.sh` builds both upstream apps with their geometry and colour crates replaced by the A-Studio ones: both build |

## In progress

- Nothing half-done.

## Questions for the owner

- Decided: renaming upstream names in colour profile names waits for the P3 rebrand (task P3-06).
- Open for later: the final app icon and the app id (placeholder `io.github.a-studio.astudio`);
  whether the web build stays (D7 left it unchanged).

## Next task

**P2-03**: unify the 17 crates whose versions differ between the two upstream apps (harfrust,
skrifa, usvg, vello_cpu, ...), then P2-04 (VectorCraft's text engine as `astudio-text`). P2-12 (the
colour engine's fast paths) can run alongside.
