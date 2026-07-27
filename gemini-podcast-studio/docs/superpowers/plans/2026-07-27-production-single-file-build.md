# Production Single-File Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Produce and verify one self-contained `dist/gemini-podcast-studio.html` from the existing Vite ES-module source without changing application features.

**Architecture:** Vite writes a deterministic temporary production bundle with one CSS and one JavaScript entry. A Node post-build script inlines those files and remaining local assets into one HTML document, then an independent verifier rejects any escaped runtime dependency. Chromium smoke checks cover HTTP and direct-file startup plus existing browser capabilities without live Gemini generation.

**Tech Stack:** Vite 7, Node.js ES modules, Node test runner, Chromium headless, local HTTP server.

## Global Constraints

- Configure Vite from `src/index.html`.
- Disable CSS code splitting and source maps.
- Avoid runtime dynamic imports.
- Do not change models, retries, TTS, cache/storage behaviour or UI features.
- `src/` is editable; `dist/` is generated and must not be edited directly.
- Final filename is exactly `dist/gemini-podcast-studio.html`.
- Remote Gemini API requests are allowed; remote application assets are not.
- `npm run build` must bundle, inline and verify.

---

### Task 1: Lock standalone verification requirements

**Files:**
- Create: `tests/single-file-build.test.mjs`
- Replace: `scripts/verify-single-file.mjs`

**Interfaces:**
- Produces: `verifySingleFile(options?)` returning `{ outputPath, sizeBytes }` or throwing a combined verification error.
- CLI: `node scripts/verify-single-file.mjs` exits non-zero on failure.

- [x] Write tests that create temporary invalid HTML fixtures for local script/style references, `import()`, escaped module imports, local fetches, Vite paths, missing root/CSS/JS/assets, wrong filename and extra production files.
- [x] Run `node --test tests/single-file-build.test.mjs` and confirm failures against the legacy verifier.
- [x] Implement the verifier with exported functions and CLI handling.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Configure deterministic Vite production bundling

**Files:**
- Modify: `vite.config.js`
- Modify: `tests/single-file-build.test.mjs`

**Interfaces:**
- Produces: Vite build directory `.single-file-build/`, CSS code splitting disabled, source maps disabled, inline asset threshold configured, one static JavaScript entry.

- [x] Add a test that inspects the Vite configuration source for the required root, output directory, CSS splitting, source-map and asset-inline settings.
- [x] Run the focused test and confirm it fails.
- [x] Implement the minimal Vite configuration.
- [x] Run the focused test and confirm it passes.

### Task 3: Build and inline the standalone document

**Files:**
- Replace: `scripts/build-single-file.mjs`
- Modify: `tests/single-file-build.test.mjs`

**Interfaces:**
- Produces: `buildSingleFile()` returning `{ outputPath, sizeBytes }`.
- Consumes: `.single-file-build/index.html` and generated local assets.
- Writes atomically: `dist/gemini-podcast-studio.html`.

- [x] Add a test that runs the builder and requires the generated warning, inline CSS, inline classic JavaScript, no local runtime references and removal of `.single-file-build/` after success.
- [x] Run the test and confirm it fails against the legacy builder.
- [x] Implement programmatic Vite build, HTML inlining, local asset data-URL conversion, atomic output and post-build verification.
- [x] Run the focused test and confirm it passes.

### Task 4: Wire package scripts and protect generated policy

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `BUILD_OUTPUT_POLICY.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `VALIDATION.md`
- Modify: `MODULARISATION_STATUS.md`
- Modify: `NEXT_PHASES.md`
- Modify: `tests/module-boundaries.test.mjs`
- Modify: `tests/single-file-build.test.mjs`

**Interfaces:**
- Produces scripts: `dev`, `test`, `build`, `preview`, `verify:single`, `check`, `test:runtime`.

- [x] Update tests to require the production build commands and remove the old assertion that `dist` is never refreshed.
- [x] Run affected tests and confirm failure.
- [x] Wire `npm run build` to the single-file builder and verifier; keep Vite development and preview commands.
- [x] Document editable/generated policy and the exact workflow.
- [x] Run affected tests and confirm they pass.

### Task 5: Add browser runtime smoke verification

**Files:**
- Create: `scripts/runtime-smoke.mjs`
- Create: `scripts/runtime-smoke-page.mjs` only if needed for CDP helpers.
- Modify: `package.json`
- Modify: `VALIDATION.md`

**Interfaces:**
- CLI: `npm run test:runtime`.
- Produces: JSON/text summary for HTTP and `file://` modes with explicit pass, fail or browser-policy limitation per capability.

- [x] Create a smoke script that launches installed Chromium with remote debugging and drives it through the Chrome DevTools Protocol.
- [x] Verify HTTP startup, rendered root, script textarea editing, localStorage persistence, IndexedDB opening, intercepted Gemini request construction, WAV object URL playback and download initiation.
- [x] Run equivalent direct-file checks and record unsupported capabilities explicitly.
- [x] Make any harness-only corrections; do not alter feature behaviour to satisfy browser-policy restrictions.

### Task 6: Full verification and publication

**Files:**
- Generated: `dist/gemini-podcast-studio.html`
- Update: PR description and validation documentation with measured results.

- [x] Run `npm test` and confirm all behavioural and build tests pass.
- [x] Run `npm run build` and confirm exactly one verified output file.
- [x] Run `npm run verify:single` independently.
- [x] Run `npm run test:runtime` and capture HTTP and direct-file results.
- [x] Record output byte size and browser limitations.
- [x] Inspect git diff to confirm no model, retry, TTS, cache or UI feature changes.
- [x] Commit, push to `agent/gemini-podcast-modular-source`, and verify GitHub Actions.
