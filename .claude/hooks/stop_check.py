#!/usr/bin/env python3
"""Stop hook: before Claude stops, uncommitted Rust changes must compile and keep the crate layering.
Exit 2 keeps Claude working and shows why."""
import json, os, subprocess, sys

try:
    data = json.load(sys.stdin)
except Exception:
    data = {}
if data.get("stop_hook_active"):
    sys.exit(0)
root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
os.chdir(root)
if not os.path.exists("Cargo.toml"):
    sys.exit(0)
try:
    changed = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, timeout=30).stdout
except Exception:
    sys.exit(0)
if not any(l.rstrip().endswith((".rs", "Cargo.toml")) for l in changed.splitlines()):
    sys.exit(0)

def run(cmd, timeout):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        return 0, ""  # too slow to check here; /quality-gate covers it

code, out = run(["cargo", "check", "--workspace", "--all-targets", "--quiet"], 540)
if code != 0:
    print("Uncommitted Rust changes do not compile. Fix them (or commit them as WIP on a task branch) before stopping:\n" + out[-2500:], file=sys.stderr)
    sys.exit(2)
code, out = run(["cargo", "run", "--quiet", "-p", "xtask", "--", "layers"], 120)
if code != 0:
    print("Crate layering is broken:\n" + out[-1500:], file=sys.stderr)
    sys.exit(2)
sys.exit(0)
