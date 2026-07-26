# Architecture

The application is developed as multiple source files and distributed as one self-contained HTML file.

```text
src/index.html + src/styles/* + src/js/*
                    |
                    v
       scripts/build-single-file.mjs
                    |
                    v
     dist/gemini-podcast-studio.html
```

The current extraction keeps JavaScript as ordered deferred scripts so the working shared-scope behaviour remains unchanged. Explicit ES-module boundaries can be introduced in a later parity-focused refactor.
