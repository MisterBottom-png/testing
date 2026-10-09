# Dependencies

Everything A-Studio needs to build, test and ship, taken from the two upstream repos on 8 October 2026 (PhotoCraft `e5e3e39`, VectorCraft `8b036df`). Regenerate the data with `python3 docs/data/gen_data.py <dir-with-both-clones> docs/data`.

## 1. Toolchain

| Tool | Version | Why |
| --- | --- | --- |
| Rust | 1.95 or newer (edition 2024); both upstream `Cargo.toml` files set `rust-version = "1.95"` | Compiler |
| rustup components | `rustfmt`, `clippy` | Format and lint gates |
| rustup target | `wasm32-unknown-unknown` | Web build and the never-break-wasm gate |
| Release targets | `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-msvc`, `i686-pc-windows-msvc`, `aarch64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-unknown-freebsd` | Upstream release matrix |
| trunk | 0.21.14 (VectorCraft release workflow pins this) | Builds the web app |
| cargo-deny | latest | Licence and advisory check in CI (`deny.toml`) |
| cargo-fuzz + nightly Rust | latest | Fuzzing importers, as PhotoCraft's CI does |
| Python 3 + PyYAML | 3.11+ | Packaging checks and the data generator |
| git | any | Upstream sync |

## 2. System packages

| OS | Install |
| --- | --- |
| Debian / Ubuntu (build) | `libxkbcommon-dev libwayland-dev libx11-dev libxrandr-dev libxi-dev libgl1-mesa-dev libgtk-3-dev` (from PhotoCraft CI) |
| Debian / Ubuntu (packaging) | `desktop-file-utils appstream python3-yaml zsync flatpak flatpak-builder librsvg2-common`, plus nfpm from its GitHub releases |
| Fedora | `libxkbcommon-devel wayland-devel libX11-devel libXrandr-devel libXi-devel mesa-libGL-devel gtk3-devel` (equivalents; not in upstream CI) |
| macOS | Xcode command-line tools; Developer ID certificate for signing |
| Windows | Visual Studio Build Tools (MSVC, Windows SDK); .NET SDK for `wix` 5.0.2 (VectorCraft's MSI) |
| FreeBSD 14 (runtime) | `libxkbcommon wayland libX11 libXcursor libXrandr libXi libxcb mesa-libs vulkan-loader gtk3 fontconfig freetype2 alsa-lib` (PhotoCraft README) |

## 3. Rust crates

The two lock files hold 607 distinct crates from crates.io: 558 in PhotoCraft, 482 in VectorCraft, 433 in both. 17 appear in both with different versions; those must be unified in the merged lock file. None come from git. 86 are named directly in a `Cargo.toml`; the rest are pulled in by those. The full list is `docs/data/dependencies.csv`.

The licence column is the licence each crate is published under as far as I know; it was not read from crates.io (blocked from this build machine). `cargo deny check licenses` with the `deny.toml` in this kit is the real check and must pass before the first release.

### UI and windowing

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `arboard` | 3.6.1 | 3.6.1 | MIT OR Apache-2.0 | photocraft; vectorcraft |
| `clipboard-win` | 5.4.1 | 5.4.1 | BSL-1.0 | vectorcraft |
| `eframe` | 0.36.2 | 0.36.2 | MIT OR Apache-2.0 | photocraft; pc:ui-egui; pc:web; vectorcraft; vc:web |
| `egui` | 0.36.2 | 0.36.2 | MIT OR Apache-2.0 | photocraft; pc:ui-egui; pc:web; vectorcraft; vc:ui-egui; vc:web |
| `egui_extras` | 0.36.2 | 0.36.2 | MIT OR Apache-2.0 | pc:ui-egui; vc:ui-egui |
| `egui_kittest` | 0.36.2 | - | MIT OR Apache-2.0 | pc:ui-egui |
| `muda` | 0.21.1 | 0.21.0 | MIT OR Apache-2.0 | photocraft; vectorcraft |
| `open` | 5.4.4 | - | MIT | photocraft |
| `pollster` | 0.4.0 1.0.1 | 0.4.0 1.0.1 | MIT OR Apache-2.0 | pc:gpu |
| `rfd` | 0.17.2 | 0.17.2 | MIT | photocraft; pc:web; vectorcraft; vc:web |
| `sys-locale` | 0.3.2 | - | MIT OR Apache-2.0 | pc:ui-egui |
| `webbrowser` | - | 1.2.4 | MIT OR Apache-2.0 | vectorcraft |
| `wgpu` | 30.0.1 | 30.0.1 | MIT OR Apache-2.0 | pc:gpu |
| `winit` | 0.30.13 | 0.30.13 | Apache-2.0 | vectorcraft |
| `x11rb` | 0.13.2 | 0.13.2 | MIT OR Apache-2.0 | photocraft; pc:tablet |

### Geometry and rendering

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `half` | 2.7.1 | 2.7.1 | MIT OR Apache-2.0 | pc:codecs; pc:gpu |
| `kurbo` | 0.11.3 0.13.1 | 0.11.3 0.13.1 | MIT OR Apache-2.0 | vc:brush; vc:cad; vc:color; vc:doc; vc:effects; vc:engine; vc:eps; vc:geom; vc:metafile; vc:pathops; vc:pdf; vc:svg; vc:testkit; vc:text; vc:tools; vc:trace |
| `linesweeper` | - | 0.4.0 | MIT OR Apache-2.0 | vc:pathops |
| `rayon` | 1.12.0 | 1.12.0 | MIT OR Apache-2.0 | pc:algo; pc:cms; pc:codecs; pc:compose; pc:engine; pc:gpu; pc:plugins; pc:raw; pc:ui-egui; pc:vector |
| `resvg` | 0.45.1 | 0.45.1 | MIT OR Apache-2.0 | vc:svg |
| `smallvec` | 1.16.2 | 1.16.2 | MIT OR Apache-2.0 | vc:pdf |
| `svgtypes` | 0.15.3 | 0.15.3 0.16.1 | MIT OR Apache-2.0 | vc:svg |
| `usvg` | 0.45.1 | 0.45.1 0.48.1 | MIT OR Apache-2.0 | vc:svg |
| `vello_common` | 0.1.0 | 0.1.0 0.2.0 | MIT OR Apache-2.0 | vc:render |
| `vello_cpu` | 0.1.0 | 0.1.0 0.2.0 | MIT OR Apache-2.0 | vc:render |

### Text and fonts

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `harfrust` | 0.12.0 | 0.12.0 0.13.3 | MIT | vc:text |
| `parley` | 0.11.1 | - | MIT OR Apache-2.0 | pc:text |
| `skrifa` | 0.44.0 | 0.42.1 0.44.0 0.47.0 | MIT OR Apache-2.0 | pc:text; vc:pdf; vc:svg; vc:text |
| `subsetter` | - | 0.2.6 | MIT OR Apache-2.0 | vc:text |
| `unicode-bidi` | - | 0.3.18 | MIT OR Apache-2.0 | vc:text |
| `unicode-general-category` | 1.1.0 | 1.1.0 | Apache-2.0 | vc:text |
| `unicode-script` | - | 0.5.8 | MIT OR Apache-2.0 | vc:text |
| `write-fonts` | - | 0.48.1 | MIT OR Apache-2.0 | vc:text |

### Image codecs and colour

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `exr` | 1.74.2 | - | BSD-3-Clause | pc:codecs |
| `gif` | 0.14.2 | 0.14.2 | MIT OR Apache-2.0 | vc:render |
| `heic-rs` | 0.1.1 | - | check | pc:heif |
| `image` | 0.25.10 | 0.25.10 | MIT OR Apache-2.0 | pc:codecs; vectorcraft; vc:cad; vc:doc; vc:engine; vc:eps; vc:mcp; vc:metafile; vc:pdf; vc:render; vc:svg; vc:testkit; vc:tools; vc:trace; vc:ui-egui |
| `image-webp` | 0.2.4 | 0.2.4 | MIT OR Apache-2.0 | pc:codecs |
| `jpeg-encoder` | 0.6.1 | 0.6.1 | MIT OR Apache-2.0 | pc:codecs; vc:doc; vc:pdf; vc:render |
| `moxcms` | 0.8.1 | 0.8.1 | check | pc:cms; vc:color |
| `png` | 0.17.16 0.18.1 | 0.17.16 0.18.1 | MIT OR Apache-2.0 | pc:codecs; pc:raw |
| `psd` | - | 0.3.5 | MIT OR Apache-2.0 | vc:render |
| `tiff` | 0.11.3 | 0.11.3 | MIT | pc:codecs; vc:doc; vc:render |
| `weezl` | 0.1.12 | 0.1.12 | MIT OR Apache-2.0 | vc:render |
| `zune-core` | 0.5.3 | 0.5.3 | MIT OR Apache-2.0 | pc:codecs |
| `zune-jpeg` | 0.5.15 | 0.5.15 | MIT OR Apache-2.0 | pc:codecs; vc:doc |

### PDF

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `hayro-interpret` | - | 0.7.0 | MIT OR Apache-2.0 | vc:pdf |
| `hayro-syntax` | - | 0.7.2 | MIT OR Apache-2.0 | vc:pdf |
| `krilla` | - | 0.8.2 | MIT OR Apache-2.0 | vc:pdf |

### File format and storage

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `aes` | - | 0.8.4 | MIT OR Apache-2.0 | vc:pdf |
| `base64` | 0.22.1 | 0.22.1 0.23.1 | MIT OR Apache-2.0 | pc:automation; pc:ui-egui |
| `blake3` | 1.8.7 | - | CC0-1.0 OR Apache-2.0 (or WITH LLVM-exception) | pc:engine; pc:format; pc:io |
| `cap-std` | 4.0.3 | - | Apache-2.0 WITH LLVM-exception (or MIT/Apache) | pc:automation |
| `flate2` | 1.1.10 | 1.1.10 | MIT OR Apache-2.0 | pc:codecs; pc:engine; pc:format; pc:psd; pc:text; vc:engine; vc:eps; vc:format; vc:pdf; vc:render; vc:svg |
| `md-5` | - | 0.10.6 | MIT OR Apache-2.0 | vc:pdf |
| `ron` | 0.12.2 | - | MIT OR Apache-2.0 | photocraft |
| `ruzstd` | 0.9.0 | - | MIT | pc:format |
| `serde` | 1.0.229 | 1.0.229 | MIT OR Apache-2.0 | pc:algo; pc:automation; pc:color; pc:doc; pc:engine; pc:format; pc:geom; pc:paint; pc:plugins; pc:psd; pc:raster; pc:ui-egui; vc:brush; vc:color; vc:doc; vc:engine; vc:format; vc:geom; vc:pdf; vc:plugins; vc:svg; vc:tools; vc:trace; vc:ui-egui; xtask |
| `serde_json` | 1.0.151 | 1.0.151 | MIT OR Apache-2.0 | photocraft; pc:algo; pc:automation; pc:cli; pc:doc; pc:engine; pc:format; pc:io; pc:paint; pc:plugins; pc:testkit; pc:ui-egui; vectorcraft; vc:brush; vc:cad; vc:cli; vc:color; vc:doc; vc:effects; vc:engine; vc:format; vc:geom; vc:mcp; vc:pdf; vc:plugins; vc:render; vc:svg; vc:testkit; vc:tools; vc:trace; vc:ui-egui; xtask |
| `sha2` | - | 0.10.9 | MIT OR Apache-2.0 | vc:pdf |
| `toml` | 1.1.6+spec-1.1.0 | 1.1.6+spec-1.1.0 | MIT OR Apache-2.0 | pc:ui-egui; vc:ui-egui; xtask |

### Plug-ins and automation

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `rmcp` | 3.5.0 | - | check | pc:automation |
| `schemars` | 1.2.2 | - | MIT | pc:automation |
| `socket2` | 0.6.5 | 0.6.5 | MIT OR Apache-2.0 | vc:mcp |
| `tokio` | 1.53.1 | 1.53.1 | MIT | pc:automation; pc:cli |
| `wasmi` | 2.0.0 | 2.0.0 | MIT OR Apache-2.0 | pc:plugins; vc:plugins |
| `wat` | 1.261.0 | 1.261.0 | Apache-2.0 WITH LLVM-exception (or MIT/Apache) | pc:engine; pc:plugins; vc:engine; vc:plugins; vc:ui-egui |

### Web build

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `getrandom` | 0.3.4 0.4.3 | 0.3.4 0.4.3 | MIT OR Apache-2.0 | pc:automation |
| `js-sys` | 0.3.106 | 0.3.106 | MIT OR Apache-2.0 | pc:web; vc:web |
| `wasm-bindgen` | 0.2.129 | 0.2.129 | MIT OR Apache-2.0 | pc:web; vc:web |
| `wasm-bindgen-futures` | 0.4.79 | 0.4.79 | MIT OR Apache-2.0 | pc:web; vc:web |
| `web-sys` | 0.3.106 | 0.3.106 | MIT OR Apache-2.0 | pc:web; vc:web |

### Platform glue (macOS / Windows)

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `block2` | 0.5.1 0.6.2 | 0.5.1 0.6.2 | MIT | pc:tablet; vectorcraft |
| `fmv-macos-events` | 0.1.0 | - | check | photocraft |
| `objc2` | 0.5.2 0.6.4 | 0.5.2 0.6.4 | MIT | photocraft; pc:tablet; vectorcraft |
| `objc2-app-kit` | 0.2.2 0.3.2 | 0.2.2 0.3.2 | MIT | photocraft; pc:tablet; vectorcraft |
| `objc2-core-graphics` | 0.3.2 | 0.3.2 | MIT | pc:tablet |
| `objc2-foundation` | 0.2.2 0.3.2 | 0.2.2 0.3.2 | MIT | photocraft; pc:tablet; vectorcraft |
| `windows-registry` | - | 0.6.1 | MIT OR Apache-2.0 | vc:text |
| `winresource` | 0.1.31 | 0.1.31 | MIT | photocraft; vectorcraft |
| `winsafe` | 0.0.29 | - | MIT | photocraft |

### Errors, logging, tests, benchmarks

| Crate | PhotoCraft | VectorCraft | Expected licence | Used by |
| --- | --- | --- | --- | --- |
| `criterion` | 0.5.1 | - | MIT OR Apache-2.0 | pc:compose |
| `log` | 0.4.34 | 0.4.34 | MIT OR Apache-2.0 | photocraft; pc:gpu; pc:ui-egui; pc:web; vectorcraft; vc:engine; vc:mcp; vc:pdf; vc:render; vc:text; vc:ui-egui; vc:web |
| `memory-stats` | 1.2.0 | - | MIT OR Apache-2.0 | pc:testkit |
| `proptest` | 1.11.0 | 1.11.0 | MIT OR Apache-2.0 | pc:codecs; pc:compose; pc:format; pc:io; pc:psd; pc:raster; vc:color; vc:doc; vc:engine; vc:format; vc:geom; vc:mcp; vc:pathops; vc:render; vc:svg; vc:testkit |
| `thiserror` | 1.0.69 2.0.21 | 1.0.69 2.0.21 | MIT OR Apache-2.0 | pc:automation; pc:codecs; pc:engine; pc:format; pc:io; pc:plugins; pc:psd; vc:color; vc:doc; vc:engine; vc:format; vc:geom; vc:pathops; vc:pdf; vc:plugins; vc:svg; vc:trace |

### Version conflicts to settle in the merge

Settled in P2-03 (9 October 2026). The picks are pinned once in the root `Cargo.toml`
(`[workspace.dependencies]`); every ported crate takes them. `deny.toml` sets
`multiple-versions = "deny"`, so CI fails on any second version of a crate unless `deny.toml`'s
`skip` list names it with the reason.

| Crate | PhotoCraft | VectorCraft | Pick | Old versions come from |
| --- | --- | --- | --- | --- |
| `base64` | 0.22.1 | 0.22.1 0.23.1 | 0.22 | 0.23 only through usvg 0.48 (VectorCraft SVG) |
| `harfrust` | 0.12.0 | 0.12.0 0.13.3 | 0.13 (VectorCraft text engine) | 0.12 through egui 0.36's `epaint` |
| `muda` | 0.21.1 | 0.21.0 | =0.21.1 | — |
| `skrifa` | 0.44.0 | 0.42.1 0.44.0 0.47.0 | 0.47 | 0.44 through `epaint` and PhotoCraft text (ported onto 0.47 in P2-04 to P2-08); 0.42 through the PDF crates `krilla` 0.8, `hayro-interpret` 0.7 and `subsetter` 0.2 |
| `svgtypes` | 0.15.3 | 0.15.3 0.16.1 | 0.16 | 0.15 through `resvg` 0.45 |
| `usvg` | 0.45.1 | 0.45.1 0.48.1 | 0.48 | 0.45 through `resvg` 0.45 (VectorCraft `svg` and egui's SVG loader) |
| `vello_common` | 0.1.0 | 0.1.0 0.2.0 | 0.2 | 0.1 through `epaint` |
| `vello_cpu` | 0.1.0 | 0.1.0 0.2.0 | 0.2 | 0.1 through `epaint` |
| `read-fonts`, `font-types`, `glifo`, `imagesize`, `roxmltree`, `tiny-skia-path`, `itertools`, `cpufeatures`, `fax` | | | not named directly | pulled in by the crates above (font stack, resvg 0.45, krilla) |

What this means as crates are ported:

- **Avoidable duplicates** (an A-Studio crate naming another version) are refused by CI. PhotoCraft's
  text moves from skrifa 0.44 to 0.47 when it is ported onto VectorCraft's engine (D3).
- **Expected, for now unavoidable** (forced by crates outside A-Studio), to be added to `deny.toml`'s
  `skip` list with their reason when the crate that brings them is ported:
  egui 0.36 / `epaint` (harfrust 0.12, skrifa 0.44, vello 0.1; L6 UI only), the PDF stack
  (skrifa 0.42 and its font crates), `resvg` 0.45 (usvg/svgtypes 0.45/0.15; VectorCraft's `svg`
  names resvg 0.45 next to usvg 0.48: check at the P2-11 port whether resvg 0.48 can replace it).
  Look again at each upstream sync: newer egui, krilla and resvg releases may remove them.
- **Test-only today:** `getrandom` 0.3 and 0.4, `r-efi` 5 and 6 (both through proptest), `syn` 2 and 3
  (zerocopy-derive through proptest; serde and thiserror use syn 3).

Two crates need a decision rather than an upgrade: `parley` (PhotoCraft text) is retired by the text-engine decision, and `wgpu` (PhotoCraft's GPU compositor) becomes the one compositor; VectorCraft's CPU raster path stays as the reference.

## 4. Data and inputs that are not crates

| Input | Where | Licence | Required? |
| --- | --- | --- | --- |
| craft-fonts (Japanese, Chinese, Arabic faces) | https://github.com/storytold/craft-fonts, passed as `CRAFT_FONTS_DIR` | SIL OFL 1.1 per font | Optional; builds work without it |
| PSD test corpus | https://github.com/storytold/photocraft-corpus (pinned by commit + sha256) | per file, see that repo | Tests only |
| psd-tools, ag-psd, PngSuite test sets | fetched by `cargo xtask corpus` upstream | their own | Tests only |
| Adobe CMap resources | compiled in through `hayro-cmap` | BSD-3-Clause, notice must ship | Yes, PDF import |
| egui default fonts | through `epaint_default_fonts` | Ubuntu Font Licence, MIT, OFL | Yes |

## 5. Release services and secrets

| Need | Service | Cost | Secret names upstream uses |
| --- | --- | --- | --- |
| macOS signing and notarization | Apple Developer Program, Developer ID certificate | US$99 a year (third-party source) | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD` |
| Windows signing | Azure Artifact Signing (formerly Trusted Signing), or a code-signing certificate | Azure's page does not show a price; use its calculator | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_ENDPOINT`, `AZURE_CERT_PROFILE` or `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` |
| Linux | none (AppImage, deb, rpm, tarball, Flatpak bundle) | free | none |
| Web hosting | any static host; PhotoCraft notes a 25 MiB single-file limit on Cloudflare Pages | free tiers exist | host token |
| CI | GitHub Actions | free for public repos | `GITHUB_TOKEN` |

Sources: [Apple Developer Program fee](https://studio.adalo.com/blog/apple-developer-program-guide), [Azure Artifact Signing pricing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/).
