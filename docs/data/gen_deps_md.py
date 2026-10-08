import csv, json, sys
D = sys.argv[1]
rows = list(csv.DictReader(open(f"{D}/data/dependencies.csv")))
S = json.load(open(f"{D}/data/summary.json"))
LIC = {
 "MIT OR Apache-2.0": "aes arboard base64 egui eframe egui_extras egui_kittest flate2 getrandom gif half hayro-interpret hayro-syntax image image-webp jpeg-encoder js-sys krilla kurbo linesweeper log md-5 png proptest rayon serde serde_json sha2 skrifa smallvec socket2 subsetter svgtypes sys-locale thiserror toml ron unicode-bidi unicode-script usvg resvg vello_common vello_cpu wasm-bindgen wasm-bindgen-futures web-sys wasmi webbrowser weezl wgpu windows-registry write-fonts x11rb pollster parley muda criterion zune-core zune-jpeg psd memory-stats",
 "MIT": "open rfd schemars tokio tiff objc2 objc2-app-kit objc2-core-graphics objc2-foundation block2 winresource winsafe harfrust ruzstd",
 "Apache-2.0": "winit unicode-general-category",
 "Apache-2.0 WITH LLVM-exception (or MIT/Apache)": "wat cap-std",
 "CC0-1.0 OR Apache-2.0 (or WITH LLVM-exception)": "blake3",
 "BSD-3-Clause": "exr",
 "BSL-1.0": "clipboard-win",
}
lic = {c: l for l, cs in LIC.items() for c in cs.split()}
AREA = {
 "UI and windowing": "egui eframe egui_extras egui_kittest winit wgpu rfd arboard clipboard-win muda webbrowser open sys-locale pollster x11rb",
 "Geometry and rendering": "kurbo vello_cpu vello_common linesweeper usvg resvg svgtypes rayon half smallvec",
 "Text and fonts": "parley skrifa harfrust subsetter write-fonts unicode-bidi unicode-general-category unicode-script",
 "Image codecs and colour": "image image-webp png gif tiff jpeg-encoder zune-jpeg zune-core exr heic-rs moxcms weezl psd",
 "PDF": "krilla hayro-interpret hayro-syntax",
 "File format and storage": "serde serde_json ron toml blake3 ruzstd flate2 base64 sha2 md-5 aes cap-std",
 "Plug-ins and automation": "wasmi wat rmcp tokio schemars socket2",
 "Web build": "wasm-bindgen wasm-bindgen-futures js-sys web-sys getrandom",
 "Platform glue (macOS / Windows)": "objc2 objc2-app-kit objc2-core-graphics objc2-foundation block2 fmv-macos-events windows-registry winresource winsafe",
 "Errors, logging, tests, benchmarks": "thiserror log proptest criterion memory-stats",
}
area = {c: a for a, cs in AREA.items() for c in cs.split()}
d = [r for r in rows if r["direct"] == "yes"]
out = []
w = out.append
w("# Dependencies\n")
w("Everything A-Studio needs to build, test and ship, taken from the two upstream repos on 8 October 2026 (PhotoCraft `e5e3e39`, VectorCraft `8b036df`). Regenerate the data with `python3 docs/data/gen_data.py <dir-with-both-clones> docs/data`.\n")
w("## 1. Toolchain\n")
w("| Tool | Version | Why |\n| --- | --- | --- |")
w("| Rust | 1.95 or newer (edition 2024); both upstream `Cargo.toml` files set `rust-version = \"1.95\"` | Compiler |")
w("| rustup components | `rustfmt`, `clippy` | Format and lint gates |")
w("| rustup target | `wasm32-unknown-unknown` | Web build and the never-break-wasm gate |")
w("| Release targets | `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-msvc`, `i686-pc-windows-msvc`, `aarch64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-unknown-freebsd` | Upstream release matrix |")
w("| trunk | 0.21.14 (VectorCraft release workflow pins this) | Builds the web app |")
w("| cargo-deny | latest | Licence and advisory check in CI (`deny.toml`) |")
w("| cargo-fuzz + nightly Rust | latest | Fuzzing importers, as PhotoCraft's CI does |")
w("| Python 3 + PyYAML | 3.11+ | Packaging checks and the data generator |")
w("| git | any | Upstream sync |\n")
w("## 2. System packages\n")
w("| OS | Install |\n| --- | --- |")
w("| Debian / Ubuntu (build) | `libxkbcommon-dev libwayland-dev libx11-dev libxrandr-dev libxi-dev libgl1-mesa-dev libgtk-3-dev` (from PhotoCraft CI) |")
w("| Debian / Ubuntu (packaging) | `desktop-file-utils appstream python3-yaml zsync flatpak flatpak-builder librsvg2-common`, plus nfpm from its GitHub releases |")
w("| Fedora | `libxkbcommon-devel wayland-devel libX11-devel libXrandr-devel libXi-devel mesa-libGL-devel gtk3-devel` (equivalents; not in upstream CI) |")
w("| macOS | Xcode command-line tools; Developer ID certificate for signing |")
w("| Windows | Visual Studio Build Tools (MSVC, Windows SDK); .NET SDK for `wix` 5.0.2 (VectorCraft's MSI) |")
w("| FreeBSD 14 (runtime) | `libxkbcommon wayland libX11 libXcursor libXrandr libXi libxcb mesa-libs vulkan-loader gtk3 fontconfig freetype2 alsa-lib` (PhotoCraft README) |\n")
w("## 3. Rust crates\n")
w(f"The two lock files hold {S['total']} distinct crates from crates.io: {S['pc']} in PhotoCraft, {S['vc']} in VectorCraft, {S['both']} in both. {S['differ']} appear in both with different versions; those must be unified in the merged lock file. None come from git. {S['direct']} are named directly in a `Cargo.toml`; the rest are pulled in by those. The full list is `docs/data/dependencies.csv`.\n")
w("The licence column is the licence each crate is published under as far as I know; it was not read from crates.io (blocked from this build machine). `cargo deny check licenses` with the `deny.toml` in this kit is the real check and must pass before the first release.\n")
for a in list(AREA) + ["Other"]:
    group = [r for r in d if area.get(r["crate"], "Other") == a]
    if not group: continue
    w(f"### {a}\n")
    w("| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |\n| --- | --- | --- | --- | --- |")
    for r in group:
        u = r["used_by"].replace("photocraft-", "pc:").replace("vectorcraft-", "vc:")
        w(f"| `{r['crate']}` | {r['photocraft'] or '-'} | {r['vectorcraft'] or '-'} | {lic.get(r['crate'], 'check')} | {u} |")
    w("")
w("### Version conflicts to settle in the merge\n")
w("| Crate | PhotoCraft | VectorCraft | Pick |\n| --- | --- | --- | --- |")
pick = {"harfrust": "0.13 (VectorCraft text engine)", "skrifa": "0.47", "usvg": "0.48", "svgtypes": "0.16", "vello_cpu": "0.2", "vello_common": "0.2", "base64": "0.22 (both use it)", "muda": "0.21.1"}
for r in rows:
    if "differ" in r["status"] and r["direct"] == "yes":
        w(f"| `{r['crate']}` | {r['photocraft']} | {r['vectorcraft']} | {pick.get(r['crate'], 'newest that builds')} |")
w("\nTwo crates need a decision rather than an upgrade: `parley` (PhotoCraft text) is retired by the text-engine decision, and `wgpu` (PhotoCraft's GPU compositor) becomes the one compositor; VectorCraft's CPU raster path stays as the reference.\n")
w("## 4. Data and inputs that are not crates\n")
w("| Input | Where | Licence | Required? |\n| --- | --- | --- | --- |")
w("| craft-fonts (Japanese, Chinese, Arabic faces) | https://github.com/storytold/craft-fonts, passed as `CRAFT_FONTS_DIR` | SIL OFL 1.1 per font | Optional; builds work without it |")
w("| PSD test corpus | https://github.com/storytold/photocraft-corpus (pinned by commit + sha256) | per file, see that repo | Tests only |")
w("| psd-tools, ag-psd, PngSuite test sets | fetched by `cargo xtask corpus` upstream | their own | Tests only |")
w("| Adobe CMap resources | compiled in through `hayro-cmap` | BSD-3-Clause, notice must ship | Yes, PDF import |")
w("| egui default fonts | through `epaint_default_fonts` | Ubuntu Font Licence, MIT, OFL | Yes |\n")
w("## 5. Release services and secrets\n")
w("| Need | Service | Cost | Secret names upstream uses |\n| --- | --- | --- | --- |")
w("| macOS signing and notarization | Apple Developer Program, Developer ID certificate | US$99 a year (third-party source) | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD` |")
w("| Windows signing | Azure Artifact Signing (formerly Trusted Signing), or a code-signing certificate | Azure's page does not show a price; use its calculator | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_ENDPOINT`, `AZURE_CERT_PROFILE` or `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` |")
w("| Linux | none (AppImage, deb, rpm, tarball, Flatpak bundle) | free | none |")
w("| Web hosting | any static host; PhotoCraft notes a 25 MiB single-file limit on Cloudflare Pages | free tiers exist | host token |")
w("| CI | GitHub Actions | free for public repos | `GITHUB_TOKEN` |\n")
w("Sources: [Apple Developer Program fee](https://studio.adalo.com/blog/apple-developer-program-guide), [Azure Artifact Signing pricing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/).")
open(f"{D}/03-dependencies.md", "w").write("\n".join(out) + "\n")
miss = [r["crate"] for r in d if r["crate"] not in lic]; print("licence 'check':", miss)
print("other area:", [r["crate"] for r in d if r["crate"] not in area])
