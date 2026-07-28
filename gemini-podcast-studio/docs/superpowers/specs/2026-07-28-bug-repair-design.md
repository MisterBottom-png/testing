# Gemini Podcast Studio Bug Repair Design

## Scope

Repair the confirmed defects found during the PR #13 audit without changing the visual design or adding unrelated product features.

## Behavioural design

### Atomic audio generation

Keep the currently playable WAV and cache references until every replacement TTS chunk has succeeded. Publish the new WAV atomically, revoking the previous object URL only at the successful hand-off. Failed generation must leave the previous episode playable and downloadable.

### Editable-script validation

Treat the editor as an untrusted input boundary. Before enabling or starting TTS, require at least two segments, configured speaker names, and non-empty spoken text in every segment. Display the first blocking issue in the existing service-error surface and show all readiness problems in the script status area.

### Bounded transient retry

Retry TTS requests only for transient server responses (`500`, `502`, `503`, `504`). Use at most three total attempts with a short increasing delay. Do not retry authentication, validation, quota or rate-limit errors.

### Editor state integrity

No-op actions such as moving the first segment upward, moving the final segment downward, or deleting when two segments remain must not create history, invalidate audio, save, rerender or announce a successful mutation. Pending typing history must be flushed before undo, redo and structural operations.

### Defaults and settings

All reset paths must use central constants: three minutes, the recommended text model, the configured TTS model and the default speaking rate. Every Settings dialog closing route, including Done, X and Escape, commits the visible generation settings consistently.

### Connection wording

The connection chip reports `Gemini configured` when an API key and model identifiers are present. It must not claim that network access or credentials were verified without an API request.

### Stored-project validation

Current-schema saved projects are normalised and validated before use. Invalid current-schema script structures are preserved through the existing corrupt-project backup path and replaced with the safe default project rather than reaching later editor or TTS paths.

### Runtime verification

Update the deterministic runtime fixture to match the strict script schema, select an available Chrome executable, and include runtime smoke verification in `npm run check`.

## Testing strategy

Add focused regression tests for each behaviour. The implementation workflow must first run the new tests against the unmodified branch and record the expected failures, then apply production changes and rerun the focused suite, the complete Node suite, the standalone build, standalone verification and browser runtime smoke test.

## Non-goals

- No UI redesign.
- No automatic voice recommendation.
- No general API retry framework.
- No storage schema version increase.
- No server-side API-key handling.
