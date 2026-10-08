#!/usr/bin/env python3
"""Backlog helper for docs/data/backlog.csv.

  backlog.py next          tasks whose dependencies are all Done (first = do this one)
  backlog.py show <id>     one task in full
  backlog.py done <id>     mark a task Done
  backlog.py status        count per phase and status
"""
import csv, os, sys

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PATH = os.path.join(ROOT, "docs", "data", "backlog.csv")

def load():
    with open(PATH, newline="") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)

def ready(rows):
    done = {r["id"] for r in rows if r["status"].strip().lower() == "done"}
    out = []
    for r in rows:
        if r["status"].strip().lower() == "done":
            continue
        deps = [d.strip() for d in r["depends_on"].split(",") if d.strip()]
        if all(d in done for d in deps):
            out.append(r)
    return out

def main(argv):
    if not os.path.exists(PATH):
        print("backlog: docs/data/backlog.csv not found (unzip the project kit first)")
        return 1
    fields, rows = load()
    cmd = argv[1] if len(argv) > 1 else "next"
    if cmd == "next":
        r = ready(rows)
        if not r:
            print("backlog: no task is ready (all done, or waiting on an owner decision)")
        for t in r[:5]:
            print(f"{t['id']} [{t['status']}] {t['title']}  (done when: {t['done_when']})")
    elif cmd == "show" and len(argv) > 2:
        t = next((x for x in rows if x["id"].lower() == argv[2].lower()), None)
        if not t:
            print(f"backlog: no task {argv[2]}"); return 1
        for k in fields:
            print(f"{k}: {t[k]}")
    elif cmd == "done" and len(argv) > 2:
        hit = False
        for t in rows:
            if t["id"].lower() == argv[2].lower():
                t["status"] = "Done"; hit = True
        if not hit:
            print(f"backlog: no task {argv[2]}"); return 1
        with open(PATH, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
        print(f"backlog: {argv[2]} marked Done")
    elif cmd == "status":
        from collections import Counter
        c = Counter((t["phase"], t["status"]) for t in rows)
        for (p, s), n in sorted(c.items()):
            print(f"{p} {s}: {n}")
    else:
        print(__doc__); return 2
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
