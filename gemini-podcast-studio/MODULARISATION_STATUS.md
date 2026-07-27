# Modularisation status

## Completed

- Preserved `src/index.html` as the Vite development entry point.
- Preserved the five existing CSS layers without selector reordering or redesign.
- Replaced the ordered classic-script list with one ES-module entry point.
- Converted JavaScript responsibilities into focused modules with explicit exports.
- Removed reliance on browser global declarations between source files.
- Kept `main.js` as a thin composition root.
- Passed application state and cross-module services explicitly.
- Kept low-level Gemini transport, persistence, IndexedDB, PCM and WAV code independent of UI modules and the DOM.
- Added tests for module boundaries, source entry-point parity and an acyclic static import graph.
- Preserved the repository-root monolithic reference and frozen `dist/` output.

## Compatibility bridge still present

The application-scoped service registry in `runtime.js` preserves existing late function decoration used by preview and final-review behaviour. It replaces implicit globals but is intentionally not a dependency-injection framework or a reason to rewrite working behaviour. Removing it requires a separate parity-focused refactor.

## Not included

- Model/default changes.
- Retry or cancellation changes.
- New TTS chunking behaviour.
- New caching behaviour.
- UI or wording optimisation.
- Production single-file generation.
