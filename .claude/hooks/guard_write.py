#!/usr/bin/env python3
"""PreToolUse hook for Edit/Write: block writes the project rules forbid. Exit 2 = blocked, reason on stderr."""
import json, os, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
path = (data.get("tool_input") or {}).get("file_path") or (data.get("tool_input") or {}).get("notebook_path") or ""
root = os.environ.get("CLAUDE_PROJECT_DIR", data.get("cwd", ""))
rel = os.path.relpath(os.path.abspath(path), root) if path else ""

def block(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)

if rel.startswith("upstream" + os.sep) or rel == "upstream":
    block("Blocked: upstream/ is a read-only clone of PhotoCraft/VectorCraft. Copy code into crates/ instead (see /port-crate).")
if rel.lower().endswith((".ttf", ".otf", ".woff", ".woff2", ".ttc")):
    block("Blocked: font files never go in this repo. Fonts come from CRAFT_FONTS_DIR (storytold/craft-fonts).")
if rel.startswith(("crates", "apps", "assets", "packaging")) and "brand" in rel.split(os.sep) and "artcraft" in rel.lower():
    block("Blocked: ArtCraft brand files may not be part of A-Studio (fork rule, docs/07-fork-and-rebrand.md).")
sys.exit(0)
