# Architecture

`src/` is the editable source of truth. Development is served by Vite from `src/index.html`; production is distributed as one generated HTML file.

```text
src/index.html
  + src/styles/*.css
  + src/js/main.js
          |
          v
    Vite production bundle
          |
          v
 .single-file-build/index.html
  + assets/style.css
  + assets/app.js
          |
          v
 scripts/build-single-file.mjs
          |
          v
 dist/gemini-podcast-studio.html
```

## JavaScript composition

`src/js/main.js` is the composition root. It creates one application-scoped service registry and installs focused ES modules in dependency order. Modules export explicit installer functions; dependencies, mutable application state and configuration are passed through the registry instead of being resolved as browser globals.

The registry remains a compatibility bridge for behaviour that previously relied on late global-function decoration. New low-level modules remain independent of the DOM and UI modules.

## Production build

Vite builds from `src/index.html` with CSS code splitting and source maps disabled. Rollup emits one IIFE JavaScript entry and one CSS asset into `.single-file-build/`. The post-build script inlines generated CSS, converts remaining local assets to embedded data URLs and moves the bundled JavaScript to the end of `<body>` so startup occurs after the application DOM exists. JavaScript is inserted through a replacement callback so bundle text such as `$&` is preserved byte-for-byte instead of being interpreted as HTML replacement syntax.

The builder adds the generated-file warning and independently verifies a candidate before replacing `dist/gemini-podcast-studio.html`. The temporary bundle is removed only after successful final verification. The output does not require Node.js, npm, Vite, a development server or neighbouring local files at runtime.

## Generated and reference files

- `dist/gemini-podcast-studio.html` is generated and must not be hand-edited.
- The repository-root `podcast-studio.html` remains the original monolithic behavioural reference.
