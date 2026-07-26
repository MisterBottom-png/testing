const appState = {
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
  characters: [
    { id: 'speaker-a', ...CHARACTER_TEMPLATES[0], voice: 'Aoede' },
    { id: 'speaker-b', ...CHARACTER_TEMPLATES[1], voice: 'Charon' }
  ],
  expandedSpeakers: new Set(),
  script: null,
  originalScript: null,
  history: [],
  historyIndex: -1,
  audio: { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null },
  settings: { theme: 'light', maxTtsCharacters: DEFAULT_MAX_TTS_CHARACTERS, speakingRate: 140 }
};

const els = Object.fromEntries([
  'saveState','connectionChip','connectionLabel','connectionModels','themeButton','settingsButton',
  'createStage','createForm','createStageTitle','createErrorSummary','createErrorList','connectionSetup','connectionSetupForm',
  'topic','durationChoices','customDurationField','customDuration','targetWords','estimatedDuration','language','customLanguage',
  'podcastFormat','customFormat','toneChoices','instructions','createLoading','createLoadingMessage','createElapsed','speakerList',
  'swapCharacters','createActionHint','generateScriptButton','scriptStage','scriptStageTitle','scriptSummaryText','scriptTabs',
  'scriptPanel','reorderStatus','scriptMetrics','scriptValidation','refineMenu','undoButton','redoButton','scriptMoreMenu',
  'scriptLoading','scriptLoadingTitle','scriptLoadingMessage','scriptElapsed','generateAudioButton','backToCreateButton',
  'audioStage','audioContent','serviceError','serviceErrorTitle','serviceErrorMessage','serviceErrorSuggestion','serviceErrorDetails',
  'retryButton','dismissErrorButton','liveStatus','settingsDialog','closeSettingsIcon','connectionSettingsForm','maxTtsCharacters',
  'speakingRate','clearStoredDataButton','closeSettingsButton'
].map(id => [id, document.getElementById(id)]));

let progressTimer = null;
let progressMessageTimer = null;
let progressStartedAt = 0;
let saveTimer = null;
let typingHistoryTimer = null;
let dragIndex = null;
