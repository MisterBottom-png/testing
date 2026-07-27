# Gemini Podcast Studio safe baseline

Baseline date: 2026-07-27  
Target branch: `agent/gemini-podcast-modular-source`  
Pre-change recovery commit: `52b9f87246d03582a416ca44d21c7f2a2deec110`  
Recovery branch: `recovery/gemini-podcast-safe-baseline-2026-07-27`

## Recovery point and application entry points

The repository already distinguishes editable source from generated output.

- Development entry point: `src/index.html`
- Ordered shared-scope JavaScript: `src/js/*.js`
- Styles: `src/styles/*.css`
- Build command: `npm run build`
- Generated single-file distribution: `dist/gemini-podcast-studio.html`
- Preserved original behavioural reference: `../podcast-studio.html` at the recovery commit/branch above

Do not edit `dist/gemini-podcast-studio.html` manually. The safe-baseline change modifies source and documentation only; generated output is intentionally left untouched until an explicit build-refresh task.

## Current behaviour

### Script generation

`generatePodcastScript()` synchronises the create form, validates the topic, connection and two speaker records, builds a JSON-schema-constrained prompt, calls Gemini `generateContent`, validates the returned speaker names and dialogue, stores the script in application state, resets history, queues local persistence and opens the Script stage.

### TTS generation

`generatePodcastAudio()` validates script-to-speaker mapping and selected voice compatibility, splits the transcript with `createTtsChunks()`, sends each chunk to the selected Gemini TTS model with the API key in the `x-goog-api-key` header, rejects partial/inconsistent results, concatenates PCM16 bytes and creates one mono WAV blob.

### WAV creation

`pcm16ToWavBlob()` writes a 44-byte RIFF/WAVE PCM header and appends the returned PCM16 data. The current default/fallback sample rate is 24,000 Hz, mono, 16-bit.

### Playback

The Audio stage renders a native `<audio id="audioPlayer" controls>` element whose source is an object URL created from the generated WAV blob. Voice and conversation previews also use local object URLs and native audio playback.

### Download

The Audio-stage `download` action passes the WAV blob to `downloadBlob()` and uses `buildEpisodeFilename('wav')` for the timestamped filename.

### Preference persistence

`queueSave()` debounces `savePreferences()`. The saved schema includes episode settings, two speakers, script, selected models, settings, audio cache references and `lastModified`. `loadPreferences()` migrates older project shapes, restores settings and script, and restores the API key from local or session storage according to the remember-key setting. Generated full-episode audio blobs are not persisted across reloads.

## Models

Text-model options:

- `gemini-3.6-flash` (current default)
- `gemini-3.5-flash`
- `gemini-2.5-flash`
- Custom model ID

TTS-model options:

- `gemini-3.1-flash-tts-preview` (current default)
- `gemini-2.5-flash-preview-tts`
- `gemini-2.5-pro-preview-tts`
- Custom model ID

## Browser storage

### localStorage

- `geminiPodcastStudio.preferences.v2`: schema-versioned project and preferences
- `geminiPodcastStudio.preferences.v2.corruptBackup`: unreadable saved-project backup plus capture metadata
- `geminiPodcastStudio.apiKey.v1`: API key only when the user explicitly enables remember-key

### sessionStorage

- `geminiPodcastStudio.sessionKey.v1`: API key for the current browser session when remember-key is off

### IndexedDB

- Database: `geminiPodcastStudio.voicePreviews.v1`
- Version: `1`
- Object store: `previews`
- Key path: `cacheKey`
- Purpose: individual voice previews and two-speaker conversation previews

The API key is not included in preview descriptors, cache keys, cache records, generated URLs, downloaded WAV files or project snapshots.

## Important globals

- Constants: `STORAGE_KEY`, `API_KEY_STORAGE_KEY`, `SESSION_KEY`, `CORRUPT_PROJECT_BACKUP_KEY`, `PODCAST_PROJECT_SCHEMA_VERSION`, `DEFAULT_MAX_TTS_CHARACTERS`, `MAX_HISTORY`
- Voice data: `GEMINI_TTS_VOICES`, `GEMINI_TTS_VOICE_GENDERS`, `DEFAULT_PODCAST_SPEAKERS`, `CHARACTER_TEMPLATES`
- State and DOM: `appState`, `els`
- Timers and editing state: `progressTimer`, `progressMessageTimer`, `progressStartedAt`, `saveTimer`, `typingHistoryTimer`, `dragIndex`
- Preview state: `voicePreviewMemoryCache`, `voicePreviewInFlightRequests`, `voicePreviewSpeakerTasks`, `activeVoicePreviewPlayback`, `voicePreviewDatabasePromise`, `voicePreviewCacheBackend`, `conversationPreviewTask`, `conversationPreviewDuplicateApprovalSignature`, `activeConversationPreviewPlayback`
- Diagnostics: `diagnosticLog()`, `redactDiagnosticString()`, `redactDiagnosticValue()`

## Important helper functions

- General: `deepClone`, `escapeHtml`, `normaliseWhitespace`, `formatDuration`, `formatBytes`, `downloadBlob`, `announce`, `revokeAudioUrl`
- Models/settings: `getTextModel`, `getTtsModel`, `getLanguage`, `getPodcastFormat`, `getTargetWords`
- Persistence/migration: `savePreferences`, `loadPreferences`, `createPodcastProjectSnapshot`, `migratePodcastProject`, `readStoredProjectSafely`, `preserveCorruptProject`
- Script: `buildScriptPrompt`, `buildScriptSchema`, `callGeminiText`, `validateScript`, `generatePodcastScript`, `refineScript`, `buildCleanTranscript`
- TTS/WAV: `buildSpeakerVoiceConfigs`, `buildTtsRequestBody`, `createTtsChunks`, `requestTtsChunk`, `generatePodcastAudio`, `base64ToBytes`, `pcm16ToWavBlob`, `concatPcmBytes`, `sampleRateFromMimeType`
- Voice preview/cache: `buildVoicePreviewDescriptor`, `openVoicePreviewDatabase`, `readVoicePreviewCache`, `writeVoicePreviewCache`, `removeVoicePreviewCache`, `clearVoicePreviewCache`, `generateVoicePreview`
- Conversation preview: `buildConversationPreviewDescriptor`, `requestConversationPreviewRecord`, `generateConversationPreview`, `playConversationPreviewBlob`
- UI/status: `setStage`, `renderCurrentStage`, `renderSpeakerCards`, `renderScriptStage`, `renderAudioStage`, `setBusy`, `showServiceError`, `handleGenerationError`, `resetProject`

## JavaScript DOM IDs

Static IDs collected centrally by `state.js`:

`saveState`, `connectionChip`, `connectionLabel`, `connectionModels`, `themeButton`, `settingsButton`, `createStage`, `createForm`, `createStageTitle`, `createErrorSummary`, `createErrorList`, `connectionSetup`, `connectionSetupForm`, `topic`, `durationChoices`, `customDurationField`, `customDuration`, `targetWords`, `estimatedDuration`, `language`, `customLanguage`, `podcastFormat`, `customFormat`, `toneChoices`, `instructions`, `createLoading`, `createLoadingMessage`, `createElapsed`, `speakerList`, `swapCharacters`, `createActionHint`, `generateScriptButton`, `scriptStage`, `scriptStageTitle`, `scriptSummaryText`, `scriptTabs`, `scriptPanel`, `reorderStatus`, `scriptMetrics`, `scriptValidation`, `refineMenu`, `undoButton`, `redoButton`, `scriptMoreMenu`, `scriptLoading`, `scriptLoadingTitle`, `scriptLoadingMessage`, `scriptElapsed`, `generateAudioButton`, `backToCreateButton`, `audioStage`, `audioContent`, `serviceError`, `serviceErrorTitle`, `serviceErrorMessage`, `serviceErrorSuggestion`, `serviceErrorDetails`, `retryButton`, `dismissErrorButton`, `liveStatus`, `settingsDialog`, `closeSettingsIcon`, `connectionSettingsForm`, `maxTtsCharacters`, `speakingRate`, `clearStoredDataButton`, `closeSettingsButton`.

Important dynamic IDs include `setupApiKey`, `settingsApiKey`, `setupTextModel`, `settingsTextModel`, `setupTtsModel`, `settingsTtsModel`, `speakerName0/1`, `speakerGenderGroup0/1`, `speakerVoiceType0/1`, `speakerVoice0/1`, `speakerPreview0/1`, `conversationPreviewSection`, `conversationPreviewButton`, `conversationPreviewStatus`, `conversationPreviewPlayer`, `conversationPreviewDuplicateWarning`, `audioStageTitle`, `waveformCanvas` and `audioPlayer`.

## Duplicate and overlapping helper review

No new duplicate helper was introduced. Existing overlaps to preserve for later, separate refactoring:

- `hashVoicePreviewValue()` contains a fallback equivalent to `hashTtsCacheValue()`.
- `normaliseVoicePreviewValue()` overlaps partly with `normaliseWhitespace()` but adds Unicode normalisation and optional lower-casing.
- Voice preview, conversation preview and full TTS each contain related fetch/response/audio parsing paths.
- `releaseVoicePreviewPlayback()` and `releaseConversationPreviewPlayback()` perform similar object-URL cleanup.
- `stableProjectValue()` and `stableSerialiseConversationPreview()` both create stable representations for comparison/cache keys.
- Several later scripts intentionally wrap earlier global functions to preserve ordered-script compatibility. These are not accidental duplicate declarations and must not be consolidated during the baseline phase.

## Diagnostic policy

`diagnosticLog()` is an internal console logger. It redacts the configured API key, API-key headers, API-key query parameters, authorization values and fields likely to contain request/response bodies or generated content. Error logging records only a redacted error summary. Technical details shown in the UI are also passed through API-key redaction.

The API key must remain in the request header only. It must never be added to endpoint URLs, cache descriptors, cache metadata, downloaded content or diagnostic exports.

## Verification

Local/source verification to run from `gemini-podcast-studio/`:

```sh
npm install --no-audit --no-fund
for file in src/js/*.js; do node --check "$file"; done
npm run check
```

`npm run check` performs the single-file build, generated-file verification and all Node tests. Live script/TTS verification additionally requires a valid Gemini API key and supported model access.

Remaining manual browser checks when a valid key is available:

1. Generate a JSON script and confirm the configured human speaker names are retained.
2. Generate full podcast audio and confirm native playback works.
3. Download the WAV and confirm it has a RIFF/WAVE header and plays outside the browser.
4. Reload the page and confirm episode/model/theme/speaker/script preferences return.
5. Confirm API keys never appear in console output, request URLs, cache records or downloaded files.

## Known existing constraints and problems

- A real Gemini request cannot be claimed without an authorised API key and available models.
- The application is a browser-side personal testing tool; direct client-side API-key use is unsuitable for public deployment.
- Remember-key intentionally stores the API key in localStorage, which is less secure than session-only storage.
- Full generated episode audio is memory-only and must be regenerated after reload.
- IndexedDB availability and browser autoplay policies can prevent preview caching or immediate playback.
- The current ordered global-script architecture relies on load order and function wrapping; changing boundaries requires a separate parity-focused task.
- Similar request, hashing, stable-serialisation and playback-cleanup helpers remain intentionally unconsolidated in this phase.

## Recovery instructions

To return to the exact state before the baseline logger/documentation changes:

```sh
git fetch origin
git switch recovery/gemini-podcast-safe-baseline-2026-07-27
```

To restore the target branch itself to the preserved commit, only after explicitly deciding to discard later work:

```sh
git switch agent/gemini-podcast-modular-source
git reset --hard 52b9f87246d03582a416ca44d21c7f2a2deec110
git push --force-with-lease
```

Prefer creating a new branch from the recovery branch rather than force-updating shared history.