# Modularisation status

## Completed

- Kept `src/index.html` as the Vite development entry point.
- Preserved the existing five-file CSS cascade without redesign or selector reordering.
- Replaced ordered classic JavaScript files with one ES-module entry.
- Split JavaScript into responsibility-focused modules for constants, state, text utilities, persistence, API transport, errors, script validation/generation, TTS chunking/generation, PCM/WAV conversion, IndexedDB, media cache, previews and UI concerns.
- Removed reliance on application symbols living in the browser global scope.
- Kept `main.js` limited to creating the application context and installing modules.
- Preserved deliberate late function replacement through the documented application-context bridge.
- Kept the original monolithic and generated single-file references untouched.
- Added module-boundary regression tests.

## Deliberately unchanged

- Model choices and defaults.
- Request payloads and endpoints.
- Retry behaviour.
- Existing TTS chunking and preview-cache behaviour.
- Storage keys and schema.
- UI structure, wording, IDs and styling.
- Production single-file generation.

## Compatibility bridge still present

A small number of baseline functions are intentionally replaceable during startup, including validation, rendering, error mapping and audio invalidation refinements. `app-context.js` preserves those bindings explicitly. This is safer than converting the baseline's late overrides into a broad behavioural rewrite.

## Validation

Run:

```text
npm install --no-audit --no-fund
npm run build
npm test
npm run check
```

Live Gemini script and TTS requests still require an authorised API key and supported model access.
