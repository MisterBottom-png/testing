# Gemini Podcast Studio Bug Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the confirmed audio, editor-state, defaults, settings, persistence and runtime-verification defects in PR #13.

**Architecture:** Keep the existing module boundaries. Add validation and retry helpers to the modules that own those responsibilities, make audio publication transactional inside `generation-jobs.js`, and repair event/state sequencing without redesigning the UI.

**Tech Stack:** Browser JavaScript ES modules, Node.js test runner, Vite 7, GitHub Actions, headless Chromium/Chrome.

## Global Constraints

- Preserve the current UI appearance and DOM structure unless a behavioural fix requires wording or disabled state changes.
- Keep the production output as one generated standalone HTML file.
- Do not add dependencies.
- Do not retry HTTP 400, 401, 403 or 429 responses.
- Use no more than three total attempts for transient TTS server errors.
- Preserve existing audio until replacement generation succeeds.
- Retain storage schema version 2.

---

### Task 1: Add regression tests and verify RED

**Files:**
- Create: `tests/bug-repairs.test.mjs`
- Modify: `tests/runtime-smoke.test.mjs` only if an existing focused test file is more appropriate

**Interfaces:**
- Consumes: existing installer functions and service harness.
- Produces: regression coverage for atomic audio, blank dialogue, no-op actions, reset defaults, settings close, typing-history flushing, configured wording, saved-project rejection, retry policy and runtime fixture compatibility.

- [ ] **Step 1: Write focused tests against current behaviour**
- [ ] **Step 2: Run `node --test tests/bug-repairs.test.mjs`**
- [ ] **Step 3: Confirm the suite fails for the audited defects rather than syntax or harness errors**
- [ ] **Step 4: Save the RED output as workflow evidence**

### Task 2: Make TTS generation resilient and atomic

**Files:**
- Modify: `src/js/tts-generation.js`
- Modify: `src/js/generation-jobs.js`

**Interfaces:**
- Produces: `isRetryableTtsStatus(status)`, bounded retry behaviour in `requestTtsChunk()`, and transactional publication in `generatePodcastAudio()`.

- [ ] **Step 1: Add transient-status classification and three-attempt retry**
- [ ] **Step 2: Move audio invalidation to the successful publication boundary**
- [ ] **Step 3: Remove failure-path invalidation of previously valid audio**
- [ ] **Step 4: Run the focused tests and confirm the audio/retry cases pass**

### Task 3: Validate edited scripts and prevent no-op mutations

**Files:**
- Modify: `src/js/script-validation.js`
- Modify: `src/js/ui-script.js`
- Modify: `src/js/generation-jobs.js`

**Interfaces:**
- Produces: `getEditableScriptIssues(script, speakers)` and `flushTypingHistory()`.

- [ ] **Step 1: Add editable-script issue detection for segment count, speakers and blank text**
- [ ] **Step 2: Block audio generation and disable readiness when issues exist**
- [ ] **Step 3: Return early from impossible segment actions without side effects**
- [ ] **Step 4: Flush pending typing history before undo, redo, structural actions and drag reorder**
- [ ] **Step 5: Run focused editor tests**

### Task 4: Repair defaults, settings and connection wording

**Files:**
- Modify: `src/js/ui-status.js`
- Modify: `src/js/ui-events.js`
- Modify: `src/js/ui-connection.js`

**Interfaces:**
- Produces: `commitSettingsFromDialog()` and reset behaviour sourced exclusively from central constants.

- [ ] **Step 1: Replace hard-coded reset values with defaults**
- [ ] **Step 2: Commit settings from Done, X and Escape/close paths**
- [ ] **Step 3: Change unverified connection copy to `Gemini configured`**
- [ ] **Step 4: Run focused defaults/settings/wording tests**

### Task 5: Validate current-schema persistence

**Files:**
- Modify: `src/js/preferences.js`
- Test: `tests/bug-repairs.test.mjs`

**Interfaces:**
- Produces: current-schema normalisation and script-shape validation before saved data enters application state.

- [ ] **Step 1: Normalise current-schema speakers, settings and selected models**
- [ ] **Step 2: Reject current-schema scripts with invalid segment arrays, speakers or blank dialogue**
- [ ] **Step 3: Verify the existing corrupt backup path captures rejected data**
- [ ] **Step 4: Run focused persistence tests**

### Task 6: Repair runtime verification and rebuild

**Files:**
- Modify: `scripts/runtime-smoke.mjs`
- Modify: `package.json`
- Regenerate: `dist/gemini-podcast-studio.html`

**Interfaces:**
- Produces: a strict-schema runtime fixture, Chrome executable fallback and a complete `npm run check` gate.

- [ ] **Step 1: Remove disallowed fields from the runtime fake script**
- [ ] **Step 2: Prefer `/usr/bin/google-chrome` when available, then Chromium**
- [ ] **Step 3: Add `verify:single` and `test:runtime` to `npm run check`**
- [ ] **Step 4: Run focused tests**
- [ ] **Step 5: Run `npm test`**
- [ ] **Step 6: Run `npm run build`**
- [ ] **Step 7: Run `npm run verify:single`**
- [ ] **Step 8: Run `npm run test:runtime`**
- [ ] **Step 9: Run `git diff --check` and confirm the generated output is current**
