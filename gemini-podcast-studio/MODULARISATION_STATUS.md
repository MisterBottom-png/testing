# Modularisation status

## Completed

- Preserved `src/index.html` as the Vite development entry point.
- Preserved the five existing CSS layers without selector reordering or redesign.
- Replaced the ordered classic-script list with one ES-module entry point.
- Converted JavaScript responsibilities into focused modules with explicit exports.
- Kept low-level Gemini transport, persistence, IndexedDB, PCM and WAV code independent of UI modules and the DOM.
- Added module-boundary and import-cycle regression tests.
- Added a deterministic production bundle, HTML inlining and standalone-output verifier.
- Generated one stable distribution at `dist/gemini-podcast-studio.html`.
- Preserved the repository-root monolithic reference.

## Compatibility bridge still present

The application-scoped service registry in `runtime.js` preserves existing late function decoration used by preview and final-review behaviour. Removing it requires a separate parity-focused refactor.

## Not included

- Model/default changes.
- Retry or cancellation changes.
- New TTS chunking behaviour.
- New caching behaviour.
- UI or wording optimisation.
- Free-tier optimisation.
