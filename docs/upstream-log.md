# Upstream sync log

| Date | PhotoCraft range | VectorCraft range | Taken | Skipped | Conflicts |
| --- | --- | --- | --- | --- | --- |
| 2026-10-08 | baseline e5e3e39 | baseline 8b036df | - | - | - |

## A-Studio additions inside ported crates

Code A-Studio added to a crate ported from upstream; keep it when merging an upstream sync.

| Crate | Addition | Why |
| --- | --- | --- |
| `astudio-vdoc` (VectorCraft `doc`) | `Document::draws_like` | P3-01: vector layers' pixels are cached until the shared vector space changes in a way that is drawn; it must live in the crate because `next_id` is private. A new upstream field must be sorted into it (the full destructuring stops the build otherwise) |
