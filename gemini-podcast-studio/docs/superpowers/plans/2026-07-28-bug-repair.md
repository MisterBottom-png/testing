# Gemini Podcast Studio Bug Repair Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to continue this plan. Do not mark the branch ready until the complete verification gate succeeds and the standalone distribution is regenerated.

**Goal:** Repair the confirmed audio, editor-state, defaults, settings, persistence and runtime-verification defects in PR #13.

**Architecture:** Install a compatibility repair layer through the existing application-scoped service registry after the original editor, transport and status services, but before UI events. Correct initial connection wording directly in `ui-connection.js`. Keep browser verification as a thin wrapper around the established runtime smoke script.

**Tech Stack:** Browser JavaScript ES modules, Node.js test runner, Vite 7, GitHub Actions, headless Chromium/Chrome.

## Global constraints

- Preserve the existing UI layout and workflow.
- Add no dependencies.
- Retry only transient HTTP `500`, `502`, `503` and `504` responses.
- Use no more than three total TTS attempts.
- Preserve existing audio until replacement generation succeeds.
- Retain storage schema version 2.
- Keep the pull request draft until `dist/gemini-podcast-studio.html` is regenerated and verified.

## Task 1: Repair runtime behaviour

**Files:**
- Create: `src/js/bug-repairs.js`
- Modify: `src/js/main.js`
- Modify: `src/js/ui-connection.js`

- [x] Add editable-script validation and block blank dialogue before TTS.
- [x] Add bounded transient TTS retry.
- [x] Publish replacement audio atomically.
- [x] Preserve previous audio after a failed regeneration.
- [x] Reject impossible segment mutations without side effects.
- [x] Flush pending typing history before undo, redo and structural changes.
- [x] Restore central reset defaults.
- [x] Commit Settings values on every dialog close path.
- [x] Use accurate `Gemini configured` wording.
- [x] Validate current-schema saved projects before loading them.

## Task 2: Add focused regression coverage

**Files:**
- Create: `tests/bug-repairs.test.mjs`
- Modify: `tests/module-boundaries.test.mjs`

- [x] Cover blank-dialogue blocking.
- [x] Cover transient retry and non-retryable quota errors.
- [x] Cover atomic audio failure behaviour.
- [x] Cover no-op segment actions.
- [x] Cover typing-history flushing.
- [x] Cover reset defaults and connection wording.
- [x] Cover Settings close persistence.
- [x] Cover current-schema project rejection.
- [x] Run focused suite: 8 passed, 0 failed.
- [x] Run syntax checks for the repair module and runtime wrapper.

## Task 3: Repair the verification gate

**Files:**
- Create: `scripts/runtime-smoke-repaired.mjs`
- Modify: `package.json`

- [x] Remove fields from the deterministic fixture that violate the strict script schema.
- [x] Prefer Google Chrome when installed and fall back to Chromium.
- [x] Increase the Chrome debugging startup allowance.
- [x] Include standalone verification and runtime smoke testing in `npm run check`.

## Task 4: Complete branch verification

- [ ] Run the complete pre-existing Node test suite.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify:single`.
- [ ] Run `npm run test:runtime`.
- [ ] Run `git diff --check` against the complete repository.
- [ ] Confirm `dist/gemini-podcast-studio.html` was regenerated from the repaired source.
- [ ] Review the final PR diff.
- [ ] Mark PR #17 ready only after every item above passes.

## Current blocker

GitHub Actions jobs on the repair branch are completing without reporting or executing any steps, and the private repository cannot be cloned into the isolated local execution container. The source repair and focused tests are committed, but full branch verification and distribution regeneration remain pending.
