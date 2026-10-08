import tomllib, glob, os, re, csv, sys, collections, json
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
REPOS = ["photocraft", "vectorcraft"]
lock, direct, used_by, dkind, feats = {}, {}, collections.defaultdict(set), {}, collections.defaultdict(set)
for r in REPOS:
    L = tomllib.load(open(f"{SRC}/{r}/Cargo.lock", "rb"))
    d = collections.defaultdict(set)
    for p in L["package"]:
        if "source" in p: d[p["name"]].add((p["version"], p["source"].split("+")[0]))
    lock[r] = d
    direct[r] = set()
    ws = tomllib.load(open(f"{SRC}/{r}/Cargo.toml", "rb"))
    for f in glob.glob(f"{SRC}/{r}/crates/*/Cargo.toml") + glob.glob(f"{SRC}/{r}/apps/*/Cargo.toml") + [f"{SRC}/{r}/xtask/Cargo.toml"]:
        t = tomllib.load(open(f, "rb")); crate = t["package"]["name"]
        secs = []
        for k in ("dependencies", "dev-dependencies", "build-dependencies"):
            secs.append((k, t.get(k, {})))
        for tg in t.get("target", {}).values():
            for k in ("dependencies", "dev-dependencies", "build-dependencies"):
                secs.append((k, tg.get(k, {})))
        for k, deps in secs:
            for name, spec in deps.items():
                real = spec.get("package", name) if isinstance(spec, dict) else name
                if real.startswith(("photocraft", "vectorcraft", "xtask")): continue
                direct[r].add(real); used_by[(r, real)].add(crate)
                kind = "runtime" if k == "dependencies" else ("dev/test" if k == "dev-dependencies" else "build")
                prev = dkind.get((r, real)); dkind[(r, real)] = "runtime" if "runtime" in (prev, kind) else kind
alln = sorted(set(lock["photocraft"]) | set(lock["vectorcraft"]))
def vs(r, n): return " ".join(sorted(v for v, _ in lock[r].get(n, ())))
rows = []
for n in alln:
    isdir = any(n in direct[r] for r in REPOS)
    src = sorted({s for r in REPOS for _, s in lock[r].get(n, ())})
    a, b = vs("photocraft", n), vs("vectorcraft", n)
    rows.append(dict(crate=n, photocraft=a, vectorcraft=b,
        direct="yes" if isdir else "no",
        kind_pc=dkind.get(("photocraft", n), ""), kind_vc=dkind.get(("vectorcraft", n), ""),
        used_by="; ".join(sorted(used_by[("photocraft", n)] | used_by[("vectorcraft", n)])),
        source=" ".join(src),
        status=("both" if a and b else "photocraft only" if a else "vectorcraft only") + (" / versions differ" if a and b and a != b else "")))
with open(f"{OUT}/dependencies.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
# assets
arows = []
def parse_table(path, repo):
    for line in open(path):
        if not line.startswith("|") or line.startswith("|---") or line.startswith("| Path") or line.startswith("| Asset"): continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if repo == "photocraft": p, title, author, source, lic = (c + [""] * 5)[:5]; notes = ""
        else: p, author, source, lic, notes = (c + [""] * 5)[:5]; title = ""
        low = (p + lic + author).lower()
        if "app-icon" in p or "storyteller" in p: action = "REPLACE (upstream app icon / owner artwork)"
        elif "artcraft" in low or "brand" in p: action = "REMOVE (ArtCraft trademark)"
        elif "corpus" in p: action = "EXTERNAL (test input, fetched by script, never shipped)"
        elif "ofl" in lic.lower(): action = "KEEP (keep licence file + attribution row)"
        elif "app-icon" in p or "storyteller" in p or "owner's original" in (notes + author).lower(): action = "REPLACE (upstream app icon / owner artwork)"
        elif "adobe" in low and "cmap" not in low: action = "REVIEW"
        else: action = "KEEP (keep licence file + attribution row)"
        arows.append(dict(repo=repo, path=p, title=title, author=author, source=source, licence=lic, notes=notes, a_studio_action=action))
parse_table(f"{SRC}/photocraft/ATTRIBUTION.md", "photocraft")
parse_table(f"{SRC}/vectorcraft/ASSETS.md", "vectorcraft")
with open(f"{OUT}/assets.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(arows[0])); w.writeheader(); w.writerows(arows)
# rebrand hits
pat = re.compile(r"ArtCraft|artcraft|getartcraft|ai\.storyteller|storytold|PhotoCraft|VectorCraft|photocraft|vectorcraft|drawcraft")
hits = []
for r in REPOS:
    for root, ds, fs in os.walk(f"{SRC}/{r}"):
        ds[:] = [d for d in ds if d not in (".git", "target")]
        for f in fs:
            p = os.path.join(root, f)
            try: txt = open(p, encoding="utf-8").read()
            except Exception:
                if pat.search(f): hits.append(dict(repo=r, file=os.path.relpath(p, f"{SRC}/{r}"), artcraft=0, storyteller_id=0, product_name=0, note="binary file, name matches")); 
                continue
            a = len(re.findall(r"ArtCraft|artcraft|getartcraft", txt)); s = len(re.findall(r"ai\.storyteller|storytold", txt))
            n = len(re.findall(r"PhotoCraft|VectorCraft|photocraft|vectorcraft|drawcraft", txt))
            if a or s: hits.append(dict(repo=r, file=os.path.relpath(p, f"{SRC}/{r}"), artcraft=a, storyteller_id=s, product_name=n, note=""))
with open(f"{OUT}/rebrand-hits.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(hits[0])); w.writeheader(); w.writerows(hits)
# summary json
summ = dict(total=len(rows), pc=len(lock["photocraft"]), vc=len(lock["vectorcraft"]),
    both=sum(1 for x in rows if x["photocraft"] and x["vectorcraft"]),
    differ=sum(1 for x in rows if "differ" in x["status"]),
    direct=sum(1 for x in rows if x["direct"] == "yes"),
    git=[x["crate"] for x in rows if "git" in x["source"]],
    assets=len(arows), assets_by_action=collections.Counter(a["a_studio_action"] for a in arows),
    hits_files=len(hits), hits_artcraft=sum(h["artcraft"] for h in hits))
json.dump(summ, open(f"{OUT}/summary.json", "w"), indent=1, default=dict)
print(json.dumps(summ, indent=1, default=dict))
