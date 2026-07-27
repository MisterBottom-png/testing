# Gemini Podcast Studio

The editable application source lives under `src/` and runs as an explicit ES-module application through Vite.

- `src/index.html` is the development entry point.
- `src/styles/` preserves the existing CSS layers and cascade order.
- `src/js/main.js` is the thin composition root.
- `src/js/` contains focused modules with explicit exports and injected dependencies.
- `dist/gemini-podcast-studio.html` is a frozen generated artefact and must not be edited manually in this phase.
- The repository-root `podcast-studio.html` remains the temporary monolithic behavioural reference.

```bash
npm install
npm run dev
npm run check
npm run preview
```

`npm run build` creates a normal Vite development bundle under `.vite-build/`. It does not refresh `dist/` or build a production single-file application.
