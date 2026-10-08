# UI specification

Based on the three mockup screens (Pixel, Vector, Layout) made on 8 October 2026. Dark theme by default,
light themes from upstream kept. All colours and radii come from `theme::Tokens` (upstream rule).

## Window

| Zone | Content |
| --- | --- |
| Menu bar | A-Studio mark, menus, mode switch (Pixel / Vector / Layout), command search (Cmd/Ctrl+K), workspace menu |
| Options bar | Settings of the active tool |
| Tool column | Tools of the current mode, grouped; fill/stroke or foreground/background swatches at the bottom |
| Document tabs | One tab per open file |
| Canvas | Document with a floating contextual task bar near the selection |
| Right dock | Panels for the mode (below); collapsible to icons |
| Icon strip | Shortcuts to collapsed panels |
| Status bar | Zoom, colour mode and depth, size, layer count, hint for the active tool |

## Modes

Switching mode changes tools, panels, menus and shortcuts. The document, selection and history stay.

| | Pixel | Vector | Layout (after 1.0) |
| --- | --- | --- | --- |
| Menus | File Edit Image Layer Type Select Filter View Window Help | File Edit Object Type Select Effect View Window Help | File Edit Layout Type Object Table View Window Help |
| Tools | Move, marquees, lassos, wand, quick select, crop, eyedropper, brush, pencil, mixer, clone, healing, eraser, gradient, bucket, blur/sharpen/smudge, dodge/burn/sponge, pen, type, shapes, hand, zoom | Selection, direct selection, pen, curvature, pencil, shapes, type, gradient, mesh, blend, shape builder, perspective, eyedropper, scissors, knife, zoom | Selection, direct selection, text frame, picture frame, rectangle, pen, scissors, hand, zoom |
| Default panels | Properties, Adjustments, Layers, History | Properties, Layers (tree), Swatches, Appearance | Pages, Paragraph styles, Properties, Links |
| Selection | Pixel mask | Objects (node ids) | Frames |

Every tool and menu item is a command id; the UI lists them, the engine runs them.

## Shortcuts

Single-letter shortcuts belong to a mode. Suggested defaults follow upstream, which follow Photoshop
and Illustrator conventions.

| Key | Pixel | Vector |
| --- | --- | --- |
| V | Move | Selection |
| A | Path selection | Direct selection |
| P | Pen | Pen |
| T | Type | Type |
| B | Brush | Blob brush |
| M | Marquee | Rectangle |
| L | Lasso | Ellipse |
| E | Eraser | Eraser |
| G | Gradient | Gradient |
| I | Eyedropper | Eyedropper |
| Tab | Hide panels | Hide panels |
| F1 to F3 | Switch to Pixel / Vector / Layout | same |

Shared keys (undo, redo, save, zoom, command search) stay the same in every mode.

## Sliders (Lightroom-style, both modes)

- Drag the label to change the value (VectorCraft already does this).
- Double-click the label to reset; Alt/Option-click a group title to reset the group.
- Click the number to type; arrow keys nudge, Shift x10.

## Layers panel (one panel for all kinds)

Rows show raster, adjustment, text, shape, smart and vector layers in one list. A Vector layer expands
into its VectorCraft object tree with target dots (Appearance) and locks.

## Accessibility

- Every icon button has a label for screen readers; tab order follows the visual order.
- Text at least 12 px; contrast 4.5:1 for text on panels.
- UI scaling follows the OS; reduced motion honoured.
- Languages: union of upstream translations (both apps ship several); right-to-left layout for Hebrew and Arabic UI.
