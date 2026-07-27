# Generated output policy

Files under `src/` are the editable source of truth.

`npm run build` uses Vite and writes generated development output to `.vite-build/`. The directory is ignored and must not be edited or committed as source.

The existing `dist/gemini-podcast-studio.html` is retained as a temporary behavioural reference from the previous workflow. It must not be edited manually or refreshed during this modular-extraction phase. The original repository-root `podcast-studio.html` is also retained until browser and live Gemini parity checks are accepted.

The previous single-file scripts remain available only as explicitly named legacy commands:

```text
npm run legacy:build-single-file
npm run legacy:verify-single-file
```

They are not part of `npm run build` or `npm run check`. A production single-file inlining pipeline belongs to a separate task.
