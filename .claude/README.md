# A-Studio Claude Code package

Unzip on top of the project kit so this `.claude/` folder and `CLAUDE.md` sit next to `AGENTS.md`.

| Part | Files | What it does |
| --- | --- | --- |
| Project memory | `../CLAUDE.md` (imports `AGENTS.md`, `docs/00-decisions.md`) | Loaded every session: rules, layout, commands, when to ask the owner |
| Rules | `rules/rust-code.md`, `porting.md`, `assets.md` | Load only when Claude touches matching files |
| Skills | `/next-task`, `/port-crate`, `/quality-gate`, `/engine-command`, `/rebrand-check`, `/add-asset`, `/benchmark`, `/upstream-sync`, `/go-no-go`, `/session-handoff` | Step-by-step procedures; type the name or Claude picks them by description |
| Agents | `upstream-scout`, `crate-porter`, `rule-reviewer`, `clean-room-auditor`, `test-writer`, `perf-benchmarker`, `ui-builder` | Helpers Claude hands work to; check them with `/agents` |
| Hooks | `hooks/*.py` via `settings.json` | Session start status; block edits in `upstream/` and font files; format Rust after edits; warn on ArtCraft marks; stop only when changed Rust compiles |
| Permissions | `settings.json` | Cargo, git and scripts run without asking; asks before editing decisions, `deny.toml`, or pushing; never force-push or hard-reset |
| Backlog helper | `hooks/backlog.py next / show / done / status` | Reads and updates `docs/data/backlog.csv` |

Needs `python3` and `git` on the machine running Claude Code. Run `/hooks` and `/agents` in a session to
confirm everything loaded; if a session started before the files existed, start a new session.
