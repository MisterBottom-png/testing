#!/usr/bin/env python3
"""PostToolUse hook for Edit/Write: format Rust files and warn about ArtCraft marks in shipped files.
Exit 2 shows the warning to Claude (the edit has already happened)."""
import json, os, re, subprocess, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
path = (data.get("tool_input") or {}).get("file_path") or ""
if not path or not os.path.isfile(path):
    sys.exit(0)
root = os.environ.get("CLAUDE_PROJECT_DIR", data.get("cwd", ""))
rel = os.path.relpath(os.path.abspath(path), root)
warnings = []

if path.endswith(".rs"):
    try:
        r = subprocess.run(["rustfmt", "--edition", "2024", path], capture_output=True, text=True, timeout=60)
        if r.returncode != 0 and r.stderr:
            warnings.append(f"rustfmt could not format {rel} (syntax error?):\n" + r.stderr[-1200:])
    except FileNotFoundError:
        pass
    except subprocess.TimeoutExpired:
        pass

if rel.startswith(("crates", "apps", "assets", "packaging")):
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            text = f.read()
        hits = sorted(set(re.findall(r"ArtCraft|getartcraft|ai\.storyteller\.[a-z]+|discord\.gg/artcraft", text)))
        allowed_credit = "Based on PhotoCraft and VectorCraft by the ArtCraft team"
        if hits and not (hits == ["ArtCraft"] and allowed_credit in text):
            warnings.append(f"{rel} contains {', '.join(hits)}. Shipped files must not carry ArtCraft marks or upstream app ids; see /rebrand-check.")
    except OSError:
        pass

if warnings:
    print("\n".join(warnings), file=sys.stderr)
    sys.exit(2)
sys.exit(0)
