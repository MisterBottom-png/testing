# Validation

## Automated source and build checks

```bash
npm test
npm run build
npm run verify:single
```

`npm test` runs the behavioural suite plus build-policy, malicious-fixture and regression checks. `npm run build` performs Vite bundling, HTML/CSS/JavaScript/asset inlining and final standalone verification. `npm run verify:single` independently validates the existing distribution without rebuilding it.

The standalone verifier fails for local script or stylesheet dependencies, runtime `import()` calls, residual ES-module syntax, local runtime fetches, non-Gemini remote runtime requests, remote application assets, Vite development paths, missing application roots or embedded assets, missing inline CSS or JavaScript, JavaScript placed before the application body, the wrong filename, or more than one production output file.

## Runtime checks

```bash
npm run test:runtime
```

The Chromium smoke harness checks the generated file through a local HTTP server and direct `file://` opening. It covers application startup, UI rendering, preference persistence, IndexedDB access, script editing, existing Gemini request construction, TTS request construction, audio playback and WAV download behaviour. Gemini calls are intercepted with deterministic responses, so the test consumes no API quota.

The harness first verifies that the local server returns the exact generated HTML bytes. Browser-policy restrictions are reported explicitly as `LIMITED`; they are not silently treated as application success.

The managed development sandbox applies a machine-wide Chromium `URLBlocklist` of `*`, so its default browser run blocks both localhost and `file://` navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. GitHub Actions runs the same harness in an unrestricted Chromium environment.

Direct-file browser storage is browser-specific. The harness requires the initial preference write to succeed. When a Chromium build does not retain the `file://` localStorage origin across reload, the result is reported as `LIMITED` with guidance to open the same generated file through a local HTTP server. HTTP preference persistence remains a strict pass/fail check.

## Latest verification

- Node tests: 111 passed, 0 failed.
- Vite production build: 32 modules transformed.
- Output: `dist/gemini-podcast-studio.html`, 169,376 bytes.
- Production files under `dist/`: exactly one.
- Temporary `.single-file-build/` directory after success: absent.
- Independent standalone verification: passed.
- `npm run dev`: HTTP 200; modular entry served from `src/js/main.js`.
- `npm run preview`: HTTP 200; response matched the generated file byte-for-byte.
- Local-server runtime: verified by the unrestricted browser acceptance workflow.
- Direct `file://` runtime: startup, rendering, IndexedDB, request construction, script editing, audio playback and WAV download are checked; preference restoration may be reported as a browser limitation as described above.
- Downloaded smoke-test WAV: 28,844 bytes with valid `RIFF` and `WAVE` headers.
