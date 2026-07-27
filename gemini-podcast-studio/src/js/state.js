export function installState(ctx) {
  const appState = {
      schemaVersion: ctx.PODCAST_PROJECT_SCHEMA_VERSION,
      currentStage: 'create',
      scriptView: 'editor',
      busy: false,
      lastAction: null,
      connection: {
          apiKey: '', rememberKey: false,
          textModel: 'gemini-3.6-flash', customTextModel: '',
          ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: ''
      },
      podcast: {
          topic: '', durationMinutes: 5, language: 'English', customLanguage: '',
          format: 'Friendly conversation', customFormat: '', tones: ['Informative', 'Casual'], instructions: ''
      },
      speakers: ctx.createDefaultPodcastSpeakers(),
      expandedSpeakers: new Set(),
      script: null,
      originalScript: null,
      history: [],
      historyIndex: -1,
      audio: { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null },
      audioCacheReferences: {},
      lastModified: '',
      settings: { theme: 'light', maxTtsCharacters: ctx.DEFAULT_MAX_TTS_CHARACTERS, speakingRate: 140 }
  };
  ctx.expose("appState", appState);
  const els = Object.fromEntries([
      'saveState', 'connectionChip', 'connectionLabel', 'connectionModels', 'themeButton', 'settingsButton',
      'createStage', 'createForm', 'createStageTitle', 'createErrorSummary', 'createErrorList', 'connectionSetup', 'connectionSetupForm',
      'topic', 'durationChoices', 'customDurationField', 'customDuration', 'targetWords', 'estimatedDuration', 'language', 'customLanguage',
      'podcastFormat', 'customFormat', 'toneChoices', 'instructions', 'createLoading', 'createLoadingMessage', 'createElapsed', 'speakerList',
      'swapCharacters', 'createActionHint', 'generateScriptButton', 'scriptStage', 'scriptStageTitle', 'scriptSummaryText', 'scriptTabs',
      'scriptPanel', 'reorderStatus', 'scriptMetrics', 'scriptValidation', 'refineMenu', 'undoButton', 'redoButton', 'scriptMoreMenu',
      'scriptLoading', 'scriptLoadingTitle', 'scriptLoadingMessage', 'scriptElapsed', 'generateAudioButton', 'backToCreateButton',
      'audioStage', 'audioContent', 'serviceError', 'serviceErrorTitle', 'serviceErrorMessage', 'serviceErrorSuggestion', 'serviceErrorDetails',
      'retryButton', 'dismissErrorButton', 'liveStatus', 'settingsDialog', 'closeSettingsIcon', 'connectionSettingsForm', 'maxTtsCharacters',
      'speakingRate', 'clearStoredDataButton', 'closeSettingsButton'
  ].map(id => [id, document.getElementById(id)]));
  ctx.expose("els", els);
  let progressTimer = null;
  ctx.defineMutable("progressTimer", () => progressTimer, value => { progressTimer = value; });
  let progressMessageTimer = null;
  ctx.defineMutable("progressMessageTimer", () => progressMessageTimer, value => { progressMessageTimer = value; });
  let progressStartedAt = 0;
  ctx.defineMutable("progressStartedAt", () => progressStartedAt, value => { progressStartedAt = value; });
  let saveTimer = null;
  ctx.defineMutable("saveTimer", () => saveTimer, value => { saveTimer = value; });
  let typingHistoryTimer = null;
  ctx.defineMutable("typingHistoryTimer", () => typingHistoryTimer, value => { typingHistoryTimer = value; });
  let dragIndex = null;
  ctx.defineMutable("dragIndex", () => dragIndex, value => { dragIndex = value; });
}
