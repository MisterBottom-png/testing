# Fork and rebrand

Both repos carry ArtCraft branding that a fork may not keep. `docs/data/rebrand-hits.csv` lists every
text file that mentions ArtCraft, `getartcraft` or the `ai.storyteller.*` app ids: 177 files, 437
ArtCraft mentions and 501 app-id or `storytold` mentions across both repos (8 October 2026).
Re-run `scripts/rebrand-scan.sh` after every upstream sync.

## What the brand licence requires (docs/brand/LICENSE-brand.txt, both repos)

- A modified version or derived work must remove the ArtCraft marks or replace them with its own.
- It must not be called ArtCraft or presented as an ArtCraft product.
- It may say, in plain text, that it is based on PhotoCraft (and VectorCraft) by the ArtCraft team.

The code licence (MIT OR Apache-2.0) is unaffected: keep `LICENSE-MIT`, `LICENSE-APACHE`, and
`NOTICE` with the original copyright lines, and add A-Studio's own.

## Steps

1. Delete `docs/brand/` from both upstream trees.
2. Replace app icons (`assets/app-icon/` in both): PhotoCraft's kitsune and VectorCraft's dragon are the
   owner's artwork. Their files are MIT OR Apache-2.0, so keeping them is legally possible, but they
   identify the ArtCraft apps; replace them with A-Studio's own icon.
3. Change app ids everywhere (desktop files, metainfo, Flatpak manifests, macOS `Info.plist`, Windows
   resources, MSI product codes):

   | Old | New |
   | --- | --- |
   | `ai.storyteller.photocraft` | `<your reverse domain>.astudio`, for example `io.github.<github-user>.astudio` until you own a domain |
   | `ai.storyteller.vectorcraft` | same id; there is one app now |

   Generate new MSI `UpgradeCode` GUIDs; never reuse upstream ones.
4. Source files with ArtCraft text or links to change:
   - PhotoCraft `crates/ui-egui/src/panels.rs`, `menus.rs`, `links.rs`
   - VectorCraft `crates/ui-egui/src/menus.rs`, `community.rs`, `dialogs/about.rs`, `crates/engine/src/cmd/help.rs`
   - Help menu links (Discord, getartcraft.com) point to A-Studio's own pages instead.
5. About window: product name A-Studio, version, licences, and one line:
   "Based on PhotoCraft and VectorCraft by the ArtCraft team and contributors." Keep upstream
   contributor credits (`contributors/` in both repos) under that line; they are not trademarks.
6. READMEs, docs, `book/`: rewrite; keep the Adobe trademark disclaimer.
7. Packaging (`packaging/` in both): rename bundles, installers, AppImage, deb, rpm, Flatpak, FreeBSD
   tarball names to `a-studio-<version>-<os>-<arch>`.
8. Native format name: `.pcraft` and `.vectorcraft` readers stay; the saver writes `.astudio`.
9. Run `scripts/rebrand-scan.sh`: shipped files (crates, apps, assets, packaging) must report zero
   ArtCraft marks. Mentions in `NOTICE`, credits and history are allowed and expected.

## Keeping up with upstream

- `scripts/sync-upstream.sh` fetches both upstream `main` branches into `upstream/` and prints the
  commit range since the last sync.
- Sync every two weeks. Port fixes crate by crate; record each sync in `docs/upstream-log.md`
  (upstream commits taken, skipped, conflicts).
- Contribute generic fixes back upstream as pull requests; it keeps the fork smaller.
