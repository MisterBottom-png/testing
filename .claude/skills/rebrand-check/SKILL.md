---
name: rebrand-check
description: "Find and remove ArtCraft names, logos, links and ai.storyteller app ids from A-Studio code and assets. Use after porting code, before a release, or when the rebrand scan fails."
---

1. `scripts/rebrand-scan.sh --shipped` lists shipped files with marks. `scripts/rebrand-scan.sh` (no flag)
   lists what is still left in `upstream/` for reference.
2. Replace, using `docs/07-fork-and-rebrand.md`:
   - product names in UI text: `PhotoCraft` / `VectorCraft` -> `A-Studio` (keep them in credits and NOTICE);
   - `ai.storyteller.photocraft` / `ai.storyteller.vectorcraft` -> `io.github.a-studio.astudio` (placeholder until the owner picks a domain);
   - getartcraft.com and the ArtCraft Discord links -> remove, or the A-Studio repo URL;
   - ArtCraft logos and upstream app icons -> the A-Studio icon (placeholder until the owner approves one).
3. Allowed mentions: `NOTICE`, `LICENSE-*`, About-window credit line ("Based on PhotoCraft and VectorCraft
   by the ArtCraft team and contributors"), `ASSETS.md`, docs that explain the fork, commit messages.
4. Re-run the scan until it prints `rebrand: clean`.
