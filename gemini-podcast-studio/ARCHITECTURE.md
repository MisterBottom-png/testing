# Architecture

Gemini Podcast Studio is developed as a Vite application whose editable source lives entirely under `src/`.

```text
src/index.html
├── styles/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── responsive.css
└── js/
    ├── main.js
    ├── app-context.js
    └── responsibility-focused modules
```

`src/index.html` loads only `src/js/main.js` as an ES module. `main.js` creates one application context and installs each module in dependency order. Every source module exports an installer; shared state and services are passed through the context instead of being created as browser globals.

## Dependency direction

- Pure utilities and constants are installed first.
- State and persistence depend only on lower-level utilities and configuration.
- API, PCM, WAV, chunking and IndexedDB modules do not read the DOM.
- UI modules may depend on application services.
- `main.js` performs startup coordination only.

Low-level modules never import UI modules. API transport returns data or throws errors; it does not render messages. Storage modules read browser storage, not form controls. Audio conversion utilities accept values and return values without accessing the page.

## Compatibility context

The baseline relied on ordered classic scripts and a small number of functions that later scripts deliberately replaced. `app-context.js` is a temporary explicit compatibility bridge for those mutable seams. `expose()` registers a service and `defineMutable()` preserves the few bindings that must remain replaceable during startup. This keeps the existing late-validation and accessibility refinements intact without publishing application symbols on `window` or `globalThis`.

The bridge is intentionally narrow and documented. It can be reduced in later parity-safe work, but removing it is not required for this extraction.

## Build outputs

- `npm run dev` starts the modular source through Vite.
- `npm run build` writes a disposable Vite build to `.vite-build/`.
- `dist/gemini-podcast-studio.html` and the repository-root `podcast-studio.html` remain preserved references from the earlier single-file workflow.

The production single-file inlining pipeline is deliberately outside this phase.
