---
name: session-handoff
description: "End an A-Studio work session cleanly so the next session can continue from a zip. Use when the owner says stop, wrap up, end session, or asks for the project zip."
disable-model-invocation: true
---

1. Commit or stash nothing half-done on `main`. Unfinished work stays on its task branch, committed with
   `WIP <task id>: <state>`.
2. Write `docs/status.md` (replace it each time), in plain words:
   - date and current phase;
   - tasks done this session (ids and one line each);
   - task in progress, its branch, and what is left;
   - blockers and questions for the owner;
   - the next task.
3. Commit `docs/status.md` on `main`.
4. Make the handoff zip of the whole repo including `.git` but without build output:
   `cd .. && zip -qr a-studio-$(date +%Y%m%d-%H%M).zip a-studio -x 'a-studio/target/*' 'a-studio/upstream/*/target/*'`
   (keep `upstream/` so the next session needs no re-clone; drop it with `-x 'a-studio/upstream/*'` if the zip is too big).
5. Send the zip to the owner and tell him: attach this zip (not the older ones) next time.
