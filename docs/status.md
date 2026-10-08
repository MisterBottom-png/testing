# Status

**Date:** 8 October 2026 · **Phase:** P1 finished (decision GO); P2 is next. One P0 task still waits for numbers.

## Start of the next session

1. Unpack the newest handoff zip (or check out branch `a-studio` of `MisterBottom-png/testing`, which
   holds the same history), then run `scripts/bootstrap.sh`. The zip leaves out `upstream/`; bootstrap
   downloads both upstream apps again at the pinned commits in about 10 seconds.
2. Check that `/next-task` and the agents (`rule-reviewer`, `upstream-scout`, `clean-room-auditor`) are
   listed. In the first session they were not, because the files arrived after the session started.
3. Finish P0-03 (below), then start P2 with the owner's go-ahead.

## Where the work lives

- Git: branch `a-studio` of github.com/MisterBottom-png/testing (public). Local `main` = that branch.
  CI (`.github/workflows/ci.yml`) runs on Windows on every push and is green.
- Task branches were merged into `main` with `--no-ff`; none is left unfinished.
- The stray remote branch `a-studio-p0-10` (pushed by mistake) can be deleted on GitHub.

## Done this session

| Task | One line |
| --- | --- |
| P0-01 | Hosted on branch `a-studio` of the owner's testing repo (now public); CI runs on every push |
| P0-02 | Upstream pinned: photocraft@e5e3e39, vectorcraft@8b036df (`upstream.lock`) |
| P0-04/05/06 | Owner chose: upstream stays read-only, branding is removed as code is ported; the CI rebrand scan also blocks brand files, upstream icons, app ids and the upstream MSI GUIDs |
| P0-07/08 | Placeholder icon (owner approved as placeholder) and Windows, document and web icon sets |
| P0-09 | `cargo xtask assets` checks every asset has an `ASSETS.md` row (ported from VectorCraft) |
| P0-10 | All CI gates green on Windows; `cargo deny` passes |
| D7 | Owner decided: Windows-only app. CI, roadmap and docs updated; the web build is unchanged |
| Tablet rule | Owner decided: `unsafe` is allowed in `astudio-tablet` on Windows (was macOS) |
| P1-01 to P1-04 | Prototype in `proto/` (owner chose a throwaway prototype): Vector layer in the PhotoCraft document, drawn into tiles, saved and reopened, PSD exit test; a one-path edit on 24 MP takes 7.3 ms (target under 100 ms) |
| P1-05 | Report `docs/p1-report.md`; owner decided **GO**, recorded as D6 |

## In progress

- **P0-03, Windows baseline:** `.github/workflows/baseline.yml` builds and tests both upstream apps on
  windows-latest. Run 37817543646 was still running at the end of the session (over 1.5 hours). When
  it finishes, take the numbers from its log (artifact `baseline-windows`), fill the table in
  `docs/baseline.md`, and mark P0-03 done.
- P1-04 on Windows is done: 7.2 ms for a one-path edit on GitHub's Windows machine (in `docs/baseline.md`
  and `docs/p1-report.md`); all prototype tests pass on Windows.

## Questions for the owner

- None blocking. Open choices for later: the final app icon and the app id (placeholder
  `io.github.a-studio.astudio`); whether the web build stays (D7 left it unchanged).

## Next task

P0-03 (record the Windows baseline), then **P2-01**: create `astudio-geom` from VectorCraft's `geom`
plus PhotoCraft's pixel types and warp (`/port-crate`). Before P2: fix the layer-rule conflict the P1
report found (VectorCraft effects need its plug-in code, which sits higher in the layer plan).
