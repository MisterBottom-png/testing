# Changelog

## ES-module source extraction

- Replaced shared-scope classic scripts with one ES-module entry.
- Added an explicit application context for state, services and documented mutable compatibility seams.
- Split API, error, script, TTS, PCM, WAV, IndexedDB, media-cache and UI responsibilities into focused modules.
- Changed the default build command to Vite output under `.vite-build/`.
- Preserved the existing single-file outputs as behavioural references.
- Added module-boundary and parity tests.

No model, request, retry, TTS, caching, storage, wording or visual behaviour was intentionally changed.
- Updated central Gemini model defaults and selectors, set three-minute/420-word session defaults, and added safe saved-model migration.
