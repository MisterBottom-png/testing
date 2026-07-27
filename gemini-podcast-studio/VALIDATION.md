# Validation

The modular development source is verified through Vite and the Node test suite.

Automated checks cover:

- One ES-module browser entry with no ordered classic scripts.
- Vite production compilation from `src/index.html`.
- JavaScript syntax for every source and test file.
- Preservation of the Create, Script and Audio stages.
- Existing model selection, speaker mapping, script editing, TTS chunk assembly, WAV encoding, persistence, migration, previews and cache behaviour.
- Diagnostic API-key redaction.
- DOM independence for API, storage, PCM, WAV, chunking and IndexedDB modules.
- Absence of application assignments to `window` or `globalThis`.
- Existing accessibility and responsive protections.

Commands:

```bash
npm install --no-audit --no-fund
npm run build
npm test
npm run check
```

Manual browser checks against the preserved monolithic reference remain appropriate for visual comparison. Live script and TTS generation cannot be claimed without a valid Gemini API key.
