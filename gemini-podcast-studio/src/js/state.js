export function installState(services) {
  const appState = {
    schemaVersion: services.PODCAST_PROJECT_SCHEMA_VERSION,
    currentStage: 'create',
    scriptView: 'editor',
    busy: false,
    lastAction: null,
    connection: {
      apiKey: '',
      rememberKey: false,
      textModel: services.DEFAULT_TEXT_MODEL,
      customTextModel: '',
      ttsModel: services.DEFAULT_TTS_MODEL,
      customTtsModel: ''
    },
    podcast: {
      topic: '',
      durationMinutes: services.DEFAULT_DURATION_MINUTES,
      language: 'English',
      customLanguage: '',
      format: 'Friendly conversation',
      customFormat: '',
      tones: ['Informative', 'Casual'],
      instructions: ''
    },
    speakers: services.createDefaultPodcastSpeakers(),
    expandedSpeakers: new Set(),
    script: null,
    originalScript: null,
    history: [],
    historyIndex: -1,
    audio: {
      blob: null,
      url: '',
      sampleRate: 24000,
      generationSeconds: 0,
      durationSeconds: 0,
      createdAt: null
    },
    audioCacheReferences: {},
    lastModified: '',
    settings: {
      theme: 'light',
      maxTtsCharacters: services.DEFAULT_MAX_TTS_CHARACTERS,
      speakingRate: services.DEFAULT_SPEAKING_RATE
    }
  };
  const els = Object.fromEntries(['saveState', 'connectionChip', 'connectionLabel', 'connectionModels', 'themeButton', 'settingsButton', 'createStage', 'createForm', 'createStageTitle', 'createErrorSummary', 'createErrorList', 'connectionSetup', 'connectionSetupForm', 'topic', 'durationChoices', 'customDurationField', 'customDuration', 'targetWords', 'estimatedDuration', 'language', 'customLanguage', 'podcastFormat', 'customFormat', 'toneChoices', 'instructions', 'createLoading', 'createLoadingMessage', 'createElapsed', 'speakerList', 'swapCharacters', 'createActionHint', 'generateScriptButton', 'scriptStage', 'scriptStageTitle', 'scriptSummaryText', 'scriptTabs', 'scriptPanel', 'reorderStatus', 'scriptMetrics', 'scriptValidation', 'refineMenu', 'undoButton', 'redoButton', 'scriptMoreMenu', 'scriptLoading', 'scriptLoadingTitle', 'scriptLoadingMessage', 'scriptElapsed', 'generateAudioButton', 'backToCreateButton', 'audioStage', 'audioContent', 'serviceError', 'serviceErrorTitle', 'serviceErrorMessage', 'serviceErrorSuggestion', 'serviceErrorDetails', 'retryButton', 'dismissErrorButton', 'liveStatus', 'settingsDialog', 'closeSettingsIcon', 'connectionSettingsForm', 'maxTtsCharacters', 'speakingRate', 'clearStoredDataButton', 'closeSettingsButton'].map(id => [id, document.getElementById(id)]));
  let progressTimer = null;
  let progressMessageTimer = null;
  let progressStartedAt = 0;
  let saveTimer = null;
  let typingHistoryTimer = null;
  let dragIndex = null;
  Object.assign(services, {
    appState,
    els,
    progressTimer,
    progressMessageTimer,
    progressStartedAt,
    saveTimer,
    typingHistoryTimer,
    dragIndex
  });
  return services;
}
