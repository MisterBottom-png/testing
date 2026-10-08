---
name: next-task
description: "Do the next A-Studio backlog task end to end. Use when the owner says \"continue\", \"next task\", \"keep going\", or names a task id like P1-02."
argument-hint: "[task-id]"
---

Do one backlog task, completely.

1. Pick the task.
   - If `$ARGUMENTS` names a task id, use it.
   - Otherwise run `python3 .claude/hooks/backlog.py next` and take the first task it lists.
   - If a task it depends on is not Done, stop and say which.
2. Read the task row (`python3 .claude/hooks/backlog.py show <id>`), the roadmap section for its phase
   (`docs/01-roadmap.md`), and any doc its area needs (format: 05, text: 06, rebrand: 07, UI: 11).
3. Branch: `git switch -c <id-lowercase>-<short-name>` from `main`.
4. Plan in five lines or fewer: what changes, which upstream files are the source, how you will prove `done_when`.
   Use the `upstream-scout` agent to locate upstream code instead of reading large trees yourself.
5. Do the work. For an upstream crate, follow `/port-crate`. For a new command, follow `/engine-command`.
6. Prove it: run the exact check in `done_when`, then `/quality-gate`. Fix until both pass.
7. Ask the `rule-reviewer` agent to review the diff (`git diff main...HEAD`). Fix what it reports.
8. Mark the task done: `python3 .claude/hooks/backlog.py done <id>`.
9. Commit (`<id>: <what changed>`), merge into `main` with `git merge --no-ff`, delete the branch.
10. Tell the owner in two or three plain sentences what now works and what is next.

Stop and ask the owner if the task needs a decision listed under "Stop and ask" in CLAUDE.md.
