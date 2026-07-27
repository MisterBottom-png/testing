# Validation

The ES-module extraction is validated against the preserved behaviour and source contracts.

## Automated checks

```bash
npm run check
```

This runs:

- Vite production bundling from `src/index.html`.
- The complete Node test suite.
- Module-entry, module-boundary and import-cycle checks.
- Existing script, TTS, preview, cache, persistence, accessibility and diagnostic tests.

## Vite startup check

```bash
npm run dev -- --port 4173
curl -I http://127.0.0.1:4173/
```

Expected result: Vite starts successfully and the development entry point returns HTTP 200.

## Manual checks still requiring a browser and valid Gemini access

- Compare the rendered UI with the monolithic reference for visual parity.
- Generate a real script with the existing model selection.
- Generate and play full podcast audio.
- Download and externally validate the WAV.
- Reload and confirm preferences and saved script state.
- Confirm there are no browser console errors under normal interaction.

A live Gemini generation result must not be claimed without a valid authorised API key and available models.
