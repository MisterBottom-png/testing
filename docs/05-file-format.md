# The `.astudio` file format, version 1

An `.astudio` file is a ZIP archive (STORE entries, no compression at the ZIP level) or a folder with
the same layout. It reuses PhotoCraft's `.pcraft` bundle layout so its incremental, content-addressed
writer works unchanged.

```text
mimetype                  the bytes "application/x-astudio", first entry, stored
manifest.json             versioned document tree (below)
tiles/<blake3>.zst        256x256 pixel tiles, zstd, little-endian samples, named by BLAKE3 of the raw tile
blobs/<blake3>.zst        binary data: ICC profiles, EXIF, PSD blocks, smart objects, images used by vector layers, fonts the user chose to embed
thumb.png                 thumbnail, longer side at most 512 px (optional)
composite/preview.png     flattened preview for apps that cannot read the layers (optional)
```

## manifest.json

```json
{
  "format": "astudio",
  "version": 1,
  "generator": "A-Studio 0.1.0",
  "document": {
    "size": [3840, 2160],
    "resolution_ppi": 300,
    "color": { "model": "rgb", "depth": 16, "profile": "blobs/<hash>" },
    "artboards": [ { "name": "Artboard 1", "rect": [0, 0, 3840, 2160] } ],
    "swatches": [], "graphic_styles": [], "char_styles": [], "para_styles": [],
    "layers": [
      { "id": 1, "name": "Background", "kind": "raster", "tiles": { "0,0": "tiles/<hash>" } },
      { "id": 2, "name": "Curves 1", "kind": "adjustment", "adjustment": { "type": "curves" } },
      { "id": 3, "name": "Logo", "kind": "vector",
        "vector": { "format": "vectorcraft", "version": 3, "layers": [ "…VectorCraft nodes…" ] },
        "transform": [1, 0, 0, 1, 0, 0] }
    ]
  },
  "extra": {}
}
```

Rules:

- `kind` is one of `raster`, `group`, `adjustment`, `fill`, `text`, `shape`, `smart`, `vector`.
  The first seven are PhotoCraft's existing `LayerContent` kinds, serialized as `.pcraft` does today.
- A `vector` layer's `vector` object is a VectorCraft v3 `document.layers` array, written by VectorCraft's
  serializer without change. Images it uses move from base64 into `blobs/` and are referenced by
  `"blob": "blobs/<hash>"` instead of `"data"`.
- Vector coordinates are points (1/72 inch). Pixels = points x `resolution_ppi` / 72, then `transform`.
- Unknown keys are kept on load and written back on save (both upstream formats already do this).
- A reader rejects a `version` newer than it supports, with a clear message.

## Compatibility

| File | Open | Save |
| --- | --- | --- |
| `.astudio` | yes | yes |
| `.pcraft` | yes, as a document without vector layers | Save As only, after a warning if vector layers exist (they are rasterized) |
| `.vectorcraft` | yes, as one Vector layer per top-level VectorCraft layer, on one artboard per VectorCraft artboard | Save As, vector layers only |
| PSD / PSB | yes (PhotoCraft path) | yes; Vector layers export as shape layers where possible, else smart objects |
| SVG, PDF, `.ai` (PDF-compatible), EPS | yes (VectorCraft path) | yes |

## Tests

- Round trip: every `.pcraft` and `.vectorcraft` in the corpora opens and saves as `.astudio`, reopens equal.
- Fuzz: `manifest.json` parsing and ZIP reading, as both upstream repos fuzz their importers.
- Size cap: refuse tiles, blobs and layer counts beyond configured limits instead of allocating.
