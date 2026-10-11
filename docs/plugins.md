# Plug-ins: the WebAssembly plug-in API (ABI v1)

A-Studio does not host native plug-ins built for other apps (`.8BF`, CEP, UXP and the like): that
needs unsafe FFI into arbitrary machine code and cannot work in the web build. Plug-ins are
**WebAssembly modules** run in a sandbox; one `.wasm` file works in the desktop app and on the web.

This page is the contract for plug-in authors and the reference for the host (`crates/plugins`,
`astudio-plugins`). It merges PhotoCraft's and VectorCraft's plug-in guides (photocraft@e5e3e39 and
vectorcraft@8b036df `docs/plugins.md`): A-Studio runs the plug-ins of both apps, unchanged.

There are three kinds of plug-in, in two ABIs. A module implements exactly one ABI, which the host
tells from its exports:

| ABI | Exports | Kind | What it does | Menu |
| --- | --- | --- | --- | --- |
| Pixel | `pc_*` | `filter` | Filters a layer's pixels in place, in bands, in the document's own colour model | Filter › Plug-ins |
| Vector | `vc_*` | `filter` (object filter) | Reads the selected paths and compound paths as JSON and returns the objects to keep, change or add; one undo step | Object › Plug-ins |
| Vector | `vc_*` | `effect` (live effect) | Rewrites one object's geometry each time it is drawn, from its appearance stack; the art stays editable | Effect › Plug-ins |

Both ABIs are version 1 and share the sandbox, the manifest and the parameter schema.

## Using plug-ins

The `plugin.*` commands come with the two engines (P3-15, P3-16), and P3-02 merges their command
registries (ids that clash, such as `plugin.run`, are settled there). What the upstream apps
offer, and A-Studio keeps:

- **Install, list, remove, reload**: `plugin.install {"path"}` (desktop) or from bytes (web),
  `plugin.list`, `plugin.remove {"id"}`, `plugin.reload {"path"?}` (every `*.wasm` in a folder; a
  bad module is reported and skipped). Installing a module with an id already installed replaces it.
- **Pixel filters**: `plugin.run {"id", "params"}` on the active pixel layer, targeted alpha
  channel / Quick Mask, or smart object; one undo step. A smart filter recorded from a plug-in
  re-runs on re-render while that plug-in is installed; without it, the filter is skipped and the
  cached pixels stay.
- **Object filters**: `plugin.run {"id", "params"?, "ids"?}` on the selection (or `ids`); one undo
  step, the result is selected.
- **Live effects**: applied like any effect, `effect.apply {"effect": "plugin.<id>", "params"}`;
  edited with `effect.setParams`, baked by Object › Expand Appearance. Documents store the effect
  record (`{"id": "plugin.<id>", "params"}`): without the plug-in, the object is drawn as if the
  effect weren't there and the record is kept for when it comes back.
- A plug-in with parameters gets a dialog generated from its schema (numbers, whole numbers,
  checkboxes, dropdowns) with a live preview; without parameters it runs at once.
- **Plug-ins folder**: a preference; every `*.wasm` directly in that folder is installed at startup
  and when the preference changes (desktop; the web build installs from bytes, for example by
  opening a `.wasm` file).

Plug-ins are installed **per process**, not per document (`astudio_plugins::registry`): live
effects are drawn from every open document, and previews and smart filters run on scratch
sessions, which must find the same plug-ins.

## The sandbox

The host is [`wasmi`](https://github.com/wasmi-labs/wasmi), a pure-Rust WebAssembly interpreter
(MIT OR Apache-2.0). It builds for `wasm32-unknown-unknown` too, so plug-ins also run in the web
build. Limits (`astudio_plugins::Limits`, defaults):

| Limit | Default | On violation |
| --- | --- | --- |
| Host imports | none: no WASI, file system, network, clock or randomness | module rejected at install |
| Module size | 32 MiB | rejected |
| Linear memory | 512 MiB per instance (a pixel band, or the input and parameters JSON: at most half) | `memory.grow` returns -1; an oversized band, input or initial memory fails |
| Output (vector) | 64 MiB of JSON | `Limit("output size")` |
| Instructions (fuel) | 50 M per call, plus 4,000 per sample for `pc_filter` or per input byte for `vc_run` | `Limit("instruction budget")` |
| Wall clock | 60 s per run (a pixel filter: all its bands); 5 s per live-effect run (desktop; checked every 20 M instructions) | `Limit("time budget")` |
| Call depth | 1,024 frames | trap |
| Module shape | wasmi's strict limits (≤ 10,000 functions, 1 memory, …) | rejected |

Every run (every band, for a pixel filter) gets a **fresh instance**, so no state survives between
calls and parallel bands never share memory. Traps, exhausted budgets, malformed modules, bad
manifests, out-of-range pointers, error return codes and invalid output all become errors, and the
document is left untouched: a filter's output is checked completely before one edit applies it. A
live effect that fails draws the object's geometry unchanged. When one band of a pixel filter
fails, the others stop.

wasmi is built with its *portable* (loop) dispatcher: the default tail-call dispatcher relies on
LLVM sibling-call optimisation, and when that doesn't happen a long-running module overflows the
host stack, which aborts the process instead of returning an error.

## ABI v1

A plug-in is a core WebAssembly module (MVP + the usual post-MVP features: bulk memory, sign
extension, multi-value, saturating conversions; no SIMD, no memory64) with **no imports**. Integers
are `i32` unless noted; pointers are offsets into the module's memory. It exports `memory` and one
of these two sets (a module exporting both `pc_abi_version` and `vc_abi_version`, or neither, is
refused):

| Pixel export | Vector export | Signature | Meaning |
| --- | --- | --- | --- |
| `pc_abi_version` | `vc_abi_version` | `() -> i32` | Must return `1`. |
| `pc_manifest` | `vc_manifest` | `() -> i64` | `(len << 32) \| ptr` of the UTF-8 manifest JSON (≤ 64 KiB). |
| `pc_alloc` | `vc_alloc` | `(size) -> ptr` | A block of `size` bytes the host may write, or `0` on failure. Never freed: each run gets a fresh instance. |
| `pc_filter` | | `(buf, buf_len, width, height, channels, format, params, params_len) -> i32` | Filters the pixels in place; `0` = success, anything else is an error code. |
| | `vc_run` | `(input, input_len, params, params_len) -> i64` | Runs on the input JSON with the parameters JSON; returns `(len << 32) \| ptr` of the output JSON, or a negative error code. |

### Manifest

```json
{
  "id": "org.example.tone",
  "name": "Tone…",
  "version": "1.0.0",
  "kind": "filter",
  "author": "Example",
  "description": "What it does.",
  "params": {
    "amount": {"type": "number", "min": 0, "max": 100, "default": 50},
    "steps":  {"type": "int", "min": 1, "max": 16, "default": 4},
    "mono":   {"type": "bool", "default": false},
    "mode":   {"type": "choice", "options": ["soft", "hard"], "default": "soft"}
  },
  "overlap": 0,
  "area": "content"
}
```

- `id`: 1–64 characters from `A-Z a-z 0-9 . _ -` (reverse-DNS recommended). A live effect's effect
  id is `plugin.<id>`.
- `name`: the menu label (1–64 printable characters). `kind`: `"filter"`, or for the vector ABI
  also `"effect"` (a live effect). A pixel plug-in is always a `"filter"`.
- `params`: in dialog order, each name declared once. Names are `[A-Za-z0-9_]`, not starting with
  `_`; pixel filters may not use `id` or `layer`, vector plug-ins not `id`, `ids`, `params` or
  `preview`. Choices are 1–64 non-empty strings (pixel: without `|` or `"`; vector: printable, up
  to 64 bytes). The host validates the user's values before calling: missing values take the
  default, numbers are clamped to `min..max` (ints rounded), a wrong type or an unknown choice is
  an error.
- `overlap` (pixel filters, 0–256): pixels of context the filter needs around each output pixel (a
  blur radius). The host pads each band by `overlap` on every side, repeating the edge pixels of
  the canvas (or of off-canvas layer content), and keeps only the inner rectangle of the result.
- `area` (pixel filters): `"content"` (default) filters the layer's non-transparent bounds grown by
  `overlap`; `"canvas"` filters the whole canvas, including transparent pixels (for generators).

## Pixel filters

### Pixels

`buf` holds `width × height × channels` **little-endian `f32` samples**, interleaved, row-major,
normalised to 0–1 at every bit depth (32-bit documents may hold values above 1). The buffer is
`width × height` including the overlap margins. Channels are the document's own colour model, with
no conversion:

`format` = `depth | alpha << 8 | mode << 16` (`astudio_plugins::format_code`)

- `depth` (bits 0–7): the document's bit depth, 8, 16 or 32 (informational: samples are always
  `f32`).
- `alpha` (bit 8): 1 when the last channel is (straight, not premultiplied) alpha.
- `mode` (bits 16–23): the colour mode, numbered as in the PSD file format: 0 Bitmap, 1 Grayscale,
  2 Indexed (stored as RGB), 3 RGB, 4 CMYK, 7 Multichannel, 8 Duotone (stored as gray), 9 Lab.

Alpha channels and Quick Mask targets arrive as one grayscale channel.

The host cuts the layer into bands (tile-aligned blocks of at most ~4 MiB of `f32`), runs them in
parallel on desktop builds, writes the results back in the layer's format, then blends with the
selection: `out = original + (filtered − original) × coverage`, as built-in filters do. A plug-in
never sees the selection and needs nothing special to support it. Output samples that are NaN or
infinite keep their original value; integer-depth documents and alpha are clamped to 0–1.

### Parameters

`params` points at `params_len` bytes of UTF-8 JSON: the validated parameters, plus `_image` with
the band's geometry:

```json
{"amount": 50, "mode": "soft",
 "_image": {"x": 0, "y": 256, "width": 1024, "height": 256, "overlap": 0,
            "canvasWidth": 6000, "canvasHeight": 4000,
            "mode": "rgb", "depth": 8, "alpha": true, "channels": 4}}
```

`x, y` is the document position of the buffer's top-left sample (including the margins), so
position-dependent filters (gradients, vignettes) are seamless across bands.

## Object filters and live effects

### Input

`input` is UTF-8 JSON: `{"objects": [...]}`. An object filter gets the selected paths and compound
paths in paint order (bottom first): the selected ones and those inside selected groups and
layers; hidden, locked, guide and clipping paths are left out, and so are other kinds of object
(type, images, symbols, live blends…), which a filter never touches. With nothing selected the list
is empty (a generator then adds its own objects). A live effect gets one object, holding only
geometry (`type`, `path`, `fillRule`, `bounds`).

```json
{"objects": [
  {"id": 12, "type": "path", "name": "Leaf",
   "path": {"subpaths": [{"closed": true, "anchors": [
     {"p": [10, 10]},
     {"p": [60, 10], "in": [45, 0], "out": [75, 20], "kind": "Smooth"},
     {"p": [35, 60]}]}]},
   "fillRule": "nonzero",
   "fills": [{"type": "solid", "color": {"model": "rgb", "r": 0.9, "g": 0.2, "b": 0.1}}],
   "strokes": [{"paint": {"type": "gradient", "gradient": {"kind": "Linear", "stops": [
       {"offset": 0, "color": {"model": "gray", "k": 0}},
       {"offset": 1, "color": {"model": "cmyk", "c": 0, "m": 0.5, "y": 1, "k": 0}}]}, "angle": 0},
     "width": 2}],
   "opacity": 1,
   "bounds": [10, 0, 75, 60]}
]}
```

- `type`: `"path"` or `"compound"` (a compound path: `path` holds its members' subpaths, painted
  as one).
- `path`: the vector document's own path form. Each subpath is a run of anchors; `p` is the anchor,
  `in` / `out` its handles (absent: no handle), `kind` `"Smooth"` when the handles stay collinear.
  Coordinates are points, y down.
- `fills`, `strokes`: the object's fills and strokes in paint order (bottom first); `null` is no
  paint. Paints use the `.vectorcraft` file format's form: `{"type": "solid", "color", "swatch"?,
  "tint"?}`, `{"type": "gradient", "gradient": {"kind": "Linear"|"Radial"|"Freeform", "stops":
  [{offset, color, opacity, midpoint}]}, "geom"?, "angle", "freeform"?}`, `{"type": "pattern",
  "pattern", "xf"?}`. Colours are `{"model": "rgb", r, g, b}`, `{"model": "cmyk", c, m, y, k}`,
  `{"model": "gray", k}` (ink: 0 white, 1 black) or `{"model": "lab", l, a, b}`; components 0–1
  except Lab's.
- `bounds`: `[x0, y0, x1, y1]`, the geometric bounds (read only).

### Parameters

`params` points at `params_len` bytes of UTF-8 JSON: the validated parameters, plus `_context`:

```json
{"amount": 50, "mode": "soft",
 "_context": {"mode": "filter", "bounds": [10, 0, 75, 60], "artboard": [0, 0, 612, 792]}}
```

`mode` is `"filter"` or `"effect"`; `bounds` the selection's geometric bounds (a live effect: the
reference box of the effect, the object's bounds or those of the previous effect's result);
`artboard` (filters) the artboard under the selection's centre, else the first.

### Output

The output is UTF-8 JSON in the input's shape: `{"objects": [...]}`. To decline with a message for
the user, return `{"error": "Select two paths."}`.

For an **object filter**, the output is the new state of the input objects:

- An object with the `id` of an input object updates it; keys it leaves out keep their value
  (`{"id": 12}` keeps the object as it is). `fills` and `strokes` set the object's fills and
  strokes in order: extra entries add fills (above the last one) or strokes, missing ones are
  removed; each stroke keeps its weight unless `width` is given (a new one: 1 pt).
- An object without an `id` is new and needs a `path`. It goes just above the object listed before
  it, or, listed before any input object, just below the first one listed after it. New objects
  take a path's defaults: no fills or strokes, full opacity.
- Input objects missing from the output are deleted. The order of the input objects themselves
  doesn't change.
- `type` turns a path into a compound path (one member per subpath) or back; `name: ""` clears the
  name.

The host validates everything before the document changes: coordinates must be finite and within
±4,000,000 pt, at most 100,000 objects and 4,000,000 anchors, 256 fills, strokes or gradient stops;
colours, opacities and offsets are clamped into range, stroke weights to 0–1,000 pt; a pattern must
exist in the document. A paint returned unchanged keeps its swatch link; any other paint is
unlinked.

For a **live effect**, the geometry of every returned object's `path` (their subpaths, in order)
replaces the object's; the rest is ignored (the object keeps its own appearance). An empty list
removes the geometry. Drawing evaluates effects often, so live-effect results are cached by
plug-in installation, parameters and input geometry: a plug-in runs again only when one of them
changes.

## Writing a plug-in in Rust

Two complete examples, each built outside the workspace for `wasm32-unknown-unknown`:

- [`crates/plugins/example-invert`](../crates/plugins/example-invert): **Invert**, a pixel filter
  in about 70 lines of `no_std` Rust (no allocator, under 1 KiB built), from PhotoCraft's example.
- [`crates/plugins/example`](../crates/plugins/example): **Desaturate**, an object filter that
  moves every colour of the selection towards grey in each colour's own model, using `serde_json`,
  from VectorCraft's example.

```sh
rustup target add wasm32-unknown-unknown
crates/plugins/example-invert/build.sh   # cargo build --release --target wasm32-unknown-unknown
crates/plugins/example/build.sh
```

Each script also refreshes its test fixture (`crates/plugins/tests/fixtures/invert.wasm`,
`desaturate.wasm`). The upstream builds of the same two plug-ins are kept in
`crates/plugins/tests/fixtures/upstream/`, and the tests check that they still load and run.

Any language that targets core WebAssembly works (C, Zig, AssemblyScript, WAT…), as long as the
module has no imports: in Rust, `no_std`, or `std` on `wasm32-unknown-unknown` that never touches
WASI. A Rust plug-in reads the blocks the host wrote through raw pointers, so its entry points are
`unsafe extern "C"` functions with a `# Safety` contract; that code runs inside the sandbox, not in
A-Studio. `astudio_plugins::wat::module` is the skeleton of a vector plug-in in WebAssembly text,
which the tests build their plug-ins from; `cargo run -p astudio-plugins --example wat2wasm --
plugin.wat plugin.wasm` compiles a WAT plug-in of either ABI and checks that it loads.

## Performance

The interpreter costs roughly 10–100× native speed per instruction, so pixel plug-ins suit
per-pixel and small-neighbourhood filters; bands run in parallel. Upstream measured the example
Invert on a 6000 × 4000 RGBA 8-bit layer (24 MP, release, 14-core Apple Silicon under heavy load)
at 1.1–1.6 s, against 3.6–5.1 s for the single-threaded built-in Invert
(`cargo run --release -p astudio-plugins --example bench_invert` times the plug-in alone). Peak
extra memory is about three bands per worker thread (input, original for the selection blend, and
the instance's memory), about 12 MiB per thread.

Object filters handle a selection in one call, so a plug-in that parses and writes JSON with
`serde_json` takes milliseconds for hundreds of paths. Live effects run once per change of their
input, not per frame.

## Not in v1

- Panel, tool and UI plug-ins; plug-ins that read other layers or documents; host callbacks
  (progress, cancel); plug-in file formats.
- Live effects that change paint (they reshape geometry; an object filter recolours), and object
  filters on type, images or symbols.
- Filter › Last Filter does not repeat pixel plug-in runs, and there is no "last filter" for
  object filters yet; Apply Last Effect works for plug-in effects.
