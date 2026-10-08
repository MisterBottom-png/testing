# Feature backlog after the merge

Krita, GIMP and Inkscape are GPL: rebuild the idea, never copy their code.

## From the gaps both upstream apps report

| Gap | Source | Phase |
| --- | --- | --- |
| About 56 Photoshop-style raster effects (Effect Gallery) on vector art; VectorCraft has about 1 | VectorCraft ROADMAP.md | P6, reuse PhotoCraft filters |
| PSD placement as layers in vector work | VectorCraft ROADMAP.md | P5 |
| SVG, PDF, `.ai` open in pixel work | PhotoCraft lacks them | P5, reuse VectorCraft importers |
| About 20 missing Photoshop tools, deeper typography, plug-in compatibility | PhotoCraft README | after 1.0 |
| 3D and Materials, Variables (data merge), scripting | VectorCraft ROADMAP.md | after 1.0 |
| Generative AI | Neither app | Out of scope; MCP lets outside models drive A-Studio |

## Ideas from other editors (first ten in order)

| # | Feature | From | Notes |
| --- | --- | --- | --- |
| 1 | Non-destructive filters on every layer, group and channel; toggle, merge, revert | GIMP 3.0 and 3.2 | Make PhotoCraft smart filters the default |
| 2 | Link layers: embed an external file (SVG, image) that refreshes when it changes | GIMP 3.2 | |
| 3 | Vector layers drawn from paths, re-rendered as the path changes | GIMP 3.2 | Same idea as A-Studio's Vector layer |
| 4 | Filter search and a filter browser listing every parameter | GIMP 3.0 and 3.2 | Extends command search |
| 5 | Plug-in API promised stable across a major version | GIMP 3.x | Write it in `docs/plugin-abi.md` before 1.0 |
| 6 | Three stroke stabilizers and a dynamic brush (drag, mass) | Krita | PhotoCraft has one stabilizer |
| 7 | Wrap-around mode for seamless textures | Krita | Neither app has it |
| 8 | One guide system: vanishing points, ellipses, fisheye | Krita | VectorCraft has a perspective grid |
| 9 | Live path effects: power stroke, pattern along path, hatching, roughen, symmetry | Inkscape | |
| 10 | Trace pixels to vectors and back | Inkscape | Both apps have tracing code |
| 11 | Clones and pattern-along-path | Inkscape | Extends symbols |
| 12 | Read-only document tree view | Inkscape (XML editor) | Helps agents and power users |
| 13 | Modular, isometric and axonometric grids | Inkscape 1.4 | |
| 14 | Brush tagging and shareable resource bundles | Krita | |
| 15 | Shift+X swaps the last two tools; System colour scheme | GIMP 3.2 | Small |

Sources: [Krita features](https://krita.org/en/features/), [GIMP 3.0](https://gimp.org/release-notes/gimp-3.0.html),
[GIMP 3.2](https://www.gimp.org/release-notes/gimp-3.2.html), [Inkscape features](https://inkscape.org/about/features/).
