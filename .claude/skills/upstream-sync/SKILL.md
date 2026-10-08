---
name: upstream-sync
description: "Check PhotoCraft and VectorCraft upstream for new commits and bring wanted fixes into A-Studio. Use every two weeks, or when asked to sync, update upstream, or check upstream changes."
disable-model-invocation: true
---

1. `scripts/sync-upstream.sh` lists new upstream commits since `upstream.lock`.
2. Sort them into three groups: bug and crash fixes, features, and changes to files A-Studio has removed
   (branding, packaging names). Use the `upstream-scout` agent to read large diffs.
3. For each fix in a crate A-Studio has already ported, apply the same change to the astudio crate
   (`git -C upstream/<repo> show <sha>` then adapt). One commit per upstream commit, message
   `sync: <repo>@<sha> <subject>`.
4. Features: list them for the owner; do not port unasked.
5. Move the pins: check out `origin/main` in each `upstream/<repo>` and rewrite `upstream.lock`.
6. Add a row to `docs/upstream-log.md`: date, ranges, taken, skipped, conflicts.
7. `/quality-gate`, then commit `sync: upstream to photocraft@<sha> vectorcraft@<sha>`.
