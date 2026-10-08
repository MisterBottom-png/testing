# Release and legal

## Packages per platform (same set as upstream)

| Platform | Packages | Tooling |
| --- | --- | --- |
| macOS | Universal `.dmg` (arm64 + x86_64), signed and notarized; CLI as signed zip | Xcode tools, `codesign`, `notarytool`; `cargo xtask bundle` upstream |
| Windows | MSI (x64, x86, arm64), portable zip | WiX 5.0.2; Azure Artifact Signing or a code-signing certificate |
| Linux | AppImage (with zsync), `.deb`, `.rpm`, tarball, Flatpak bundle | nfpm, flatpak-builder, appstream, desktop-file-utils |
| FreeBSD 14 | tarball laid out like `/usr/local` | upstream `freebsd.yml` |
| Web | static site from `trunk build --release` | trunk 0.21.14; keep each file under 25 MiB if hosted on Cloudflare Pages |

## Accounts and costs

| Item | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program | US$99 a year ([source](https://studio.adalo.com/blog/apple-developer-program-guide)) | Needed for Developer ID signing; unsigned Mac apps are blocked by Gatekeeper |
| Windows signing | Azure Artifact Signing; [pricing page](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/) did not show prices | Basic plan covers 5,000 signatures a month; unsigned installers trigger SmartScreen warnings |
| EU trade mark (EUIPO) | €850 first class, €50 second, €150 each further class ([source](https://www.patentamt.at/en/trademarks/apply-for-trademarks/international-trademark/eu-trademark)) | Classes 9 (software) and 42 (software services) usually cover an app: €900 |
| Domain | about €10 to €40 a year | Needed for a reverse-domain app id and a website |
| GitHub | free for a public repo | Actions minutes are free for public repos |

## Release checklist

1. `cargo xtask ci` and `cargo deny check` green.
2. Version bumped in one place (`cargo xtask version`, upstream pattern).
3. `CHANGELOG.md` updated.
4. Builds signed (macOS, Windows), notarized (macOS), checksums published.
5. `NOTICE` and `ASSETS.md` shipped inside every package with every licence text (OFL fonts, Lucide ISC, SCOWL, CC BY 3.0 credit, Adobe CMap BSD-3 notice from `hayro-cmap`, jpeg-encoder IJG notice).
6. Rebrand scan clean.
7. Web build smoke-tested in Chrome, Firefox and Safari.

## Licences in force

| What | Licence | Obligation |
| --- | --- | --- |
| Upstream code (PhotoCraft, VectorCraft) | MIT OR Apache-2.0 | Keep copyright lines and licence texts; Apache-2.0 asks you to state changes in modified files |
| A-Studio's own code | MIT OR Apache-2.0 | Same |
| ArtCraft brand files | Not open source | Removed (see `07-fork-and-rebrand.md`) |
| Bundled fonts | SIL OFL 1.1 | Ship the OFL text |
| Lucide icons | ISC (Feather-derived: MIT) | Ship `LICENSE-lucide.txt` |
| Magnetic lasso glyph | CC BY 3.0 | Credit Lil' Seal (Noun Project) |
| Rust crates | mostly MIT and/or Apache-2.0; also BSD, ISC, Zlib, BSL-1.0, Unicode-3.0 | Checked by `cargo deny` |
| Krita, GIMP, Inkscape | GPL | Ideas only; never copy code |

## Trademark

- Before the first public build: search "A-Studio" in [TMview](https://www.tmdn.org/tmview/) (EU and national registers, including Estonia) and the USPTO register, in classes 9 and 42.
- Keep the Adobe disclaimer in the README, website and About window.
- I am not a lawyer; for the filing itself, an IP attorney or the Estonian Patent Office can confirm the classes.
