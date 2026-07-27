# Architecture

`src/` is the editable source of truth. The development application is served and bundled by Vite from `src/index.html`.

```text
src/index.html
  + src/styles/*.css
  + src/js/main.js
          |
          v
  explicit ES-module composition
          |
          v
      Vite dev/build
```

## JavaScript composition

`src/js/main.js` is the composition root. It creates one application-scoped service registry and installs focused ES modules in dependency order. Modules export explicit installer functions; dependencies, mutable application state and configuration are passed through the registry instead of being resolved as browser globals.

The registry is a temporary compatibility bridge for behaviour that previously relied on late global-function decoration. It keeps those substitutions explicit and testable without introducing circular imports. New low-level modules must remain independent of the DOM and UI modules.

## Source responsibilities

- `constants.js`: application constants, defaults, voice catalogue and icons.
- `state.js`: application state and static DOM reference collection.
- `text-utils.js`: pure text, formatting and model-selection helpers.
- `app-helpers.js`: browser-facing generic helpers such as downloads, announcements and object-URL cleanup.
- `preferences.js`: project schema, migration and browser preference persistence.
- `gemini-api.js`: Gemini text request transport and response parsing only.
- `script-validation.js`: script schemas, prompts and validation.
- `script-generation.js`: script generation and refinement coordination.
- `pcm-audio.js`, `wav-encoder.js`: DOM-free PCM and WAV utilities.
- `tts-chunking.js`, `tts-generation.js`: existing TTS request preparation and transport.
- `indexeddb.js`, `media-cache.js`: existing preview database and cache access.
- `generation-jobs.js`: full-episode audio generation coordination.
- `ui-connection.js`, `ui-create.js`, `ui-script.js`, `ui-audio.js`, `ui-status.js`: rendering and UI state by surface.
- `ui-events.js`: event registration and user-action routing.
- `voice-preview.js`, `conversation-preview.js`: existing preview workflows and their UI coordination.
- `final-review.js`: final behaviour-preserving decorators installed after initialisation.

## Generated and reference files

- `dist/gemini-podcast-studio.html` remains a frozen generated/reference artefact and is not edited by this phase.
- The repository-root `podcast-studio.html` remains the original monolithic behavioural reference.
- The legacy single-file scripts under `scripts/` are retained for historical recovery only and are not called by current package scripts.
