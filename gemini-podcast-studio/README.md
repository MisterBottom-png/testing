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
