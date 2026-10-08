# P1 go/no-go report

8 October 2026. Prototype in `proto/` (throwaway, as the owner chose). Details: `docs/baseline.md`.

## Result in one sentence

The prototype meets the P1 exit test: a PSD opened in PhotoCraft gets a VectorCraft path as a Vector
layer, which is drawn into tiles, saved and reopened unchanged, and on a 24-megapixel canvas with
1,000 paths a changed path shows up in about 7 ms, well under the 100 ms target.

## Target against measured

| Exit-test item | Target | Measured | Met |
| --- | --- | --- | --- |
| Vector layer in a PhotoCraft document | works | works (P1-01 test) | yes |
| Drawn into 256-px tiles, only changed tiles redrawn | works | works; an edit redraws 1 to 2 tiles (P1-02 tests) | yes |
| Same pixels as VectorCraft | within 1/255 | identical to VectorCraft drawing the same tile (P1-02); see "What did not" | yes, with a note |
| Save and reopen | round trip | identical drawing, position and pixels after reopening (P1-03 test) | yes |
| PSD + vector path, end to end | works | works (exit test) | yes |
| Redraw one changed layer, 24 MP, 1,000 paths | under 100 ms | 7.3 ms (dense paths), 5.7 ms (sparse); Linux dev machine | yes |
| Same on Windows (D7) | under 100 ms | pending: running on GitHub's Windows machine (`p1-measure` workflow) | to be added |

Other numbers: first full drawing of the 1,000-path layer 0.2 to 0.3 s; the vector layer's tile cache
is about 94 MB at 24 MP; keeping an undo step for each edit adds about 1 ms.

## What worked

- PhotoCraft's document took a new "Vector" layer kind with small changes: one new type and six
  code spots. All 239 upstream tests of the four copied PhotoCraft pieces still pass.
- VectorCraft's renderer draws straight into PhotoCraft's tiles; the compositor needed no change to
  show them.
- The `.pcraft` file stores the vector layer in VectorCraft's own file format, inside the file's table
  of contents, as decision D4 planned. A reopened file shows at once (its pixels are stored too).
- Both apps' code was used unchanged; only four PhotoCraft pieces were copied and edited.

## What did not, and why

- **VectorCraft's renderer is not exactly stable when its drawing window moves.** A single edge pixel
  can change its smoothness by up to 45/255 depending on where the window starts (46 pixels out of a
  million in one test drawing; 1 pixel in another). This is VectorCraft's own behaviour, not something
  the merge adds. The prototype avoids its visible effect: every tile is always drawn through the same
  window, so a redrawn tile is identical to a first drawing and no seams appear. But the tiles do not
  match one big whole-canvas VectorCraft render pixel for pixel. The P1-02 bar ("within 1/255 of
  VectorCraft's render") is met against VectorCraft drawing the same tile, not the whole canvas.
- **Only small edits are fast.** Changing the whole vector layer at once (moving or scaling all of it)
  redraws everything: about 0.7 s at 24 MP on the test machine. Dragging a whole layer smoothly
  will need a shortcut in P3/P4, such as sliding the already drawn tiles during the drag and
  redrawing once at the end.
- The Windows numbers come from a GitHub machine, not a typical laptop.

## Risks for P2 and P3

1. **Layer rules.** VectorCraft's effects code needs its plug-in code, which sits higher in the
   A-Studio layer plan. P2 must move that link (for example behind a trait) before porting.
2. **Memory.** A rendered vector layer is a full-size pixel copy (about 94 MB at 24 MP), on top of
   VectorCraft's own data. Many vector layers on big canvases will need the cache to drop tiles that
   are off screen.
3. **Undo.** PhotoCraft's tile undo and VectorCraft's shared node tree both worked inside one
   document here, but one combined history panel (P3) is still untested.
4. **The two geometry and colour libraries** (P2-01, P2-02) are still separate in the prototype; the
   prototype simply used both. Merging them is the bulk of P2.
5. **File format.** PhotoCraft's file reader drops fields it does not know when it saves again, and
   very deep vector drawings could hit its nesting limit; `.astudio` (P5) needs both handled.
6. **Not yet tested in the prototype:** blurs, drop shadows, glows and text that cross tile edges.
   They are drawn consistently (no seams), but on 1 to 2 core machines VectorCraft draws such
   effects only inside its window, so they could look slightly different from VectorCraft's own
   view. P2 should add them to the tests.
7. **Rendering cost of the first draw** (0.2 to 0.3 s for a 24 MP layer) is fine for opening a file,
   but zooming and panning will need the renderer to draw at screen resolution, not full size.

## Recommendation

**GO** (full merge into one app), because every part of the exit test passed, the speed target was
met by more than ten times, and the problems found have clear fixes in P2 and P3. None of them argues
for keeping two apps.

**Decision (owner, 8 October 2026): GO.** Recorded as D6 in `docs/00-decisions.md`.
