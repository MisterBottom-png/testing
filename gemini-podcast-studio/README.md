# Gemini Podcast Studio

Gemini Podcast Studio now runs from focused HTML, CSS and ES-module JavaScript source while preserving the established interface and behaviour.

```bash
npm install
npm run dev
```

Vite serves `src/index.html`. The editable source is organised as follows:

- `src/styles/` retains the existing token, base, layout, component and responsive cascade.
- `src/js/main.js` is the startup coordinator.
- `src/js/app-context.js` carries explicit state and services between modules without browser globals.
- Remaining JavaScript files are separated by constants, state, persistence, API transport, script handling, TTS, PCM/WAV audio, IndexedDB/media cache and UI responsibilities.

Validation commands:

```bash
npm run build
npm test
npm run check
```

The Vite build is written to `.vite-build/`. Existing files under `dist/` are preserved references and must not be edited manually. The portable production single-file builder is deliberately deferred.
