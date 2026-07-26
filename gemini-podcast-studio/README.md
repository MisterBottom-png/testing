# Gemini Podcast Studio

Maintainable development source extracted from the working single-file application.

- `src/index.html` contains markup.
- `src/styles/` contains the original CSS layers.
- `src/js/` contains JavaScript split by responsibility in preserved execution order.
- `dist/gemini-podcast-studio.html` is generated and must not be edited manually.

The extraction deliberately uses ordered deferred scripts to preserve baseline behaviour. Converting the shared scope to explicit ES-module imports is a separate refactor after parity is confirmed, rather than mixing architecture and functional changes in one hazardous blob.

```bash
npm install
npm run dev
npm run check
```
