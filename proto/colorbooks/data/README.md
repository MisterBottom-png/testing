# Bundled colour-book data (prototype)

| File | Rows | Source | Licence |
| --- | --- | --- | --- |
| `pantone-coated.csv` | 1,341 | `pantoner` 1.1.2 on npm, `csv/pantone-coated.csv` | MIT (`LICENSE-pantoner.md`) |
| `pantone-uncoated.csv` | 1,341 | same package, `csv/pantone-uncoated.csv` | MIT |
| `pantone-metallic.csv` | 301 | same package, `csv/pantone-metallic.csv` | MIT |
| `pantone-pastels-neons.csv` | 210 | same package, `csv/pantone-pastels-neons.csv` | MIT |

Copied unchanged on 8 October 2026 from https://registry.npmjs.org/pantoner/-/pantoner-1.1.2.tgz
(author James Pederson, MIT). Each row is `code,hex`: the code of a Pantone Matching System ink
and its sRGB screen simulation as the community recorded it around 2014 to 2019. The values are
approximate (8-bit, clipped to sRGB), not Pantone's licensed ink data; the ink name is what the
printer uses.

PANTONE is a trademark of Pantone LLC. The owner decided on 8 October 2026 to bundle these lists
inside A-Studio (see `docs/research/pantone-spot-colours.md`, question 1). If the real port keeps
them, they move under `assets/` with a row in `ASSETS.md` and the `cargo xtask brands` exemption.
