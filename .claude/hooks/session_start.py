#!/usr/bin/env python3
"""SessionStart hook: tells Claude where the project stands. Stdout becomes session context."""
import os, subprocess, sys

root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
os.chdir(root)
lines = ["A-Studio session start."]
if not os.path.exists("docs/data/backlog.csv"):
    lines.append("The project kit is not unpacked here yet. Unzip a-studio-kit.zip so that AGENTS.md and docs/ sit next to CLAUDE.md.")
else:
    up = all(os.path.isdir(f"upstream/{r}/.git") for r in ("photocraft", "vectorcraft"))
    lines.append("Upstream clones: " + ("present." if up else "missing; run scripts/bootstrap.sh first (task P0-02)."))
    try:
        nxt = subprocess.run([sys.executable, ".claude/hooks/backlog.py", "next"], capture_output=True, text=True, timeout=20).stdout.strip()
        lines.append("Ready tasks (first = next):\n" + nxt)
    except Exception as e:
        lines.append(f"backlog check failed: {e}")
    if os.path.exists("docs/status.md"):
        with open("docs/status.md") as f:
            lines.append("Last session status (docs/status.md):\n" + f.read()[:1500])
    try:
        br = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, timeout=10).stdout.strip()
        if br:
            lines.append(f"Current git branch: {br}")
    except Exception:
        pass
print("\n".join(lines))
