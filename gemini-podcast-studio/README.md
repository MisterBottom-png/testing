# Gemini Podcast Studio

The editable application source lives under `src/` and runs as an explicit ES-module application through Vite.

- `src/index.html` is the development entry point.
- `src/styles/` preserves the existing CSS layers and cascade order.
- `src/js/main.js` is the thin composition root.
- `src/js/` contains focused modules with explicit exports and injected dependencies.
- `dist/gemini-podcast-studio.html` is the generated, self-contained distribution.
- The repository-root `podcast-studio.html` remains the original monolithic behavioural reference.

```bash
npm install
npm run dev
npm test
npm run build
npm run verify:single
npm run test:runtime
npm run preview
```

`npm run build` asks Vite to bundle `src/index.html` into `.single-file-build/`, inlines the generated CSS, JavaScript and local assets, writes `dist/gemini-podcast-studio.html`, verifies that it has no runtime application dependencies, and removes the temporary bundle.

Do not edit `dist/gemini-podcast-studio.html` directly. Change `src/`, rebuild and review the generated diff.

## TTS request sizing

The generation chunk target defaults to **24,000 request characters** for
`gemini-3.1-flash-tts-preview`. This value was tested with the complete prompt,
including the global delivery directions and both speaker descriptions. It is
deliberately conservative relative to the model's 8,192-token maximum input
context: character counts are not token counts, and the remaining headroom
allows for tokenisation differences between languages and punctuation-heavy
scripts.

Chunking minimises the number of requests, then favours section changes and
speaker turns when several partitions use the same request count. The advanced
4,000–30,000-character override is intended for troubleshooting. Reducing it
uses more API requests and may reduce voice and conversational continuity.
