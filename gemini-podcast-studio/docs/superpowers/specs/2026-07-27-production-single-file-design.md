# Production Single-File Build Design

## Scope

Build the existing modular Gemini Podcast Studio source into exactly one generated runtime artefact: `dist/gemini-podcast-studio.html`. The work changes build, verification and documentation only. It does not alter model choices, retry behaviour, TTS algorithms, cache/storage schemas or UI features.

## Architecture

Vite remains the module bundler and reads `src/index.html` with `root: 'src'`. Production bundling writes to a predictable temporary directory, `.single-file-build/`, with CSS code splitting and source maps disabled. The bundle must contain one JavaScript entry and one CSS asset, with local small assets emitted as data URLs where Vite can do so.

`scripts/build-single-file.mjs` runs Vite programmatically, reads the temporary `index.html`, resolves every generated local stylesheet, script and supported small asset reference inside the temporary directory, inlines them into the document, inserts the generated-file warning, writes the stable output path, verifies it through `scripts/verify-single-file.mjs`, and removes the temporary build directory only after success.

`scripts/verify-single-file.mjs` is independently runnable through `npm run verify:single`. It verifies the exact output path, requires exactly one production file under `dist/`, requires the application root and inline CSS/JavaScript, and rejects local runtime dependencies, dynamic imports, residual ES-module import/export syntax, Vite development paths, local runtime fetches and missing embedded assets. Remote Gemini API requests remain allowed; remote application assets do not.

## Build Flow

1. Remove stale `.single-file-build/` content.
2. Run Vite production build from `src/index.html`.
3. Read `.single-file-build/index.html`.
4. Inline generated CSS in document order.
5. Inline generated JavaScript as a classic script after bundling.
6. Inline remaining local SVG/image/font assets as data URLs or literal SVG where appropriate.
7. Remove all local runtime asset references.
8. Add the generated-file warning immediately after the doctype.
9. Write `dist/gemini-podcast-studio.html` atomically.
10. Run standalone verification.
11. Remove `.single-file-build/` after success.

A failed build or verification leaves the previous valid distribution untouched and retains useful diagnostics. Temporary files are never considered production output.

## Runtime Verification

A Chromium smoke harness opens the generated file through a local HTTP server and directly through `file://`. It checks application startup and core DOM rendering, edits script content, exercises localStorage preference persistence, opens IndexedDB where the browser permits it, validates existing Gemini request construction using network interception, creates and plays a small WAV object URL, and verifies download creation. The harness records browser-specific limitations instead of converting blocked `file://` capabilities into silent success.

The direct-file path is expected to support the self-contained interface and local browser APIs in Chromium. Browsers may apply stricter origin policies to `file://`, particularly around IndexedDB persistence, storage partitioning, downloads or remote API CORS. Any such limitation must be surfaced as an explicit result and must not cause production source changes unrelated to the build.

## Generated Output Policy

`src/` is editable. `dist/gemini-podcast-studio.html` is generated and must never be hand-edited. Source changes require rebuilding the distribution. Diffs under `dist/` represent build results from source and build-tool changes, not hand-authored implementation.

## Acceptance Criteria

- `npm run build` bundles, inlines and verifies the application.
- `npm run verify:single` independently verifies the existing output.
- `dist/` contains exactly `gemini-podcast-studio.html` as the required production output.
- The output has no neighbouring runtime dependencies and opens without Node.js, npm, Vite or a server.
- Existing 83 behavioural tests remain green.
- HTTP and direct-file browser results are reported honestly, including any capability blocked by browser policy.
