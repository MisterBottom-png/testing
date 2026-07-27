export function installConstants(services) {
  const STORAGE_KEY = 'geminiPodcastStudio.preferences.v2';
  const API_KEY_STORAGE_KEY = 'geminiPodcastStudio.apiKey.v1';
  const SESSION_KEY = 'geminiPodcastStudio.sessionKey.v1';
  const PODCAST_PROJECT_SCHEMA_VERSION = 2;
  const DEFAULT_TEXT_MODEL = 'gemini-3.5-flash-lite';
  const QUALITY_TEXT_MODEL = 'gemini-3.6-flash';
  const DEFAULT_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
  const CUSTOM_MODEL_VALUE = 'custom';
  const DEFAULT_DURATION_MINUTES = 3;
  const DEFAULT_SPEAKING_RATE = 140;
const MAX_SEGMENT_WORDS = 90;
const MAX_SCRIPT_OVERAGE_RATIO = 1.15;
const MIN_SCRIPT_LENGTH_RATIO = 0.75;
const SCRIPT_TOKENS_PER_TARGET_WORD = 2.5;
const MIN_SCRIPT_OUTPUT_TOKENS = 2048;
const MAX_SCRIPT_OUTPUT_TOKENS = 8192;
const SCRIPT_SEGMENTS_PER_MINUTE = 10;
const MIN_SCRIPT_SEGMENTS = 16;
const MAX_SCRIPT_SEGMENTS = 100;
const MAX_DIRECTION_WORDS = 12;
const MAX_DIRECTION_CHARACTERS = 120;
  const SUPPORTED_TEXT_MODELS = Object.freeze([DEFAULT_TEXT_MODEL, QUALITY_TEXT_MODEL]);
  const SUPPORTED_TTS_MODELS = Object.freeze([DEFAULT_TTS_MODEL]);
  const TEXT_MODEL_OPTIONS = Object.freeze([
    Object.freeze({ value: DEFAULT_TEXT_MODEL, label: 'Gemini 3.5 Flash-Lite · Recommended' }),
    Object.freeze({ value: QUALITY_TEXT_MODEL, label: 'Gemini 3.6 Flash · Higher quality' }),
    Object.freeze({ value: CUSTOM_MODEL_VALUE, label: 'Custom model ID…' })
  ]);
  const TTS_MODEL_OPTIONS = Object.freeze([
    Object.freeze({ value: DEFAULT_TTS_MODEL, label: 'Gemini 3.1 Flash TTS Preview' }),
    Object.freeze({ value: CUSTOM_MODEL_VALUE, label: 'Custom model ID…' })
  ]);
  function isValidCustomModelId(value) {
    return /^gemini-[a-z0-9][a-z0-9._-]*$/i.test(String(value ?? '').trim());
  }
  function normaliseModelSelection(selection, customValue, supportedModels, fallbackModel) {
    const selected = String(selection ?? '').trim();
    const custom = String(customValue ?? '').trim();
    if (selected === CUSTOM_MODEL_VALUE && isValidCustomModelId(custom)) {
      return { selection: CUSTOM_MODEL_VALUE, customValue: custom };
    }
    if (supportedModels.includes(selected)) return { selection: selected, customValue: '' };
    return { selection: fallbackModel, customValue: '' };
  }
  const DEFAULT_MAX_TTS_CHARACTERS = 12000;
  const MAX_HISTORY = 30;
  const SCRIPT_PROGRESS_MESSAGES = ['Planning the episode…', 'Defining the discussion…', 'Writing the dialogue…', 'Checking the structure…'];
  const AUDIO_PROGRESS_MESSAGES = ['Preparing the transcript…', 'Assigning character voices…', 'Generating the conversation…', 'Processing the audio…'];
  const CHARACTER_TEMPLATES = [{
    speakerName: 'Anna',
    role: 'Astrophysicist',
    personality: 'Enthusiastic, intelligent and optimistic',
    deliveryInstructions: 'Speak warmly and clearly with lively pacing',
    accent: ''
  }, {
    speakerName: 'Mark',
    role: 'Sceptical journalist',
    personality: 'Dry, curious and politely challenging',
    deliveryInstructions: 'Speak calmly with restrained humour',
    accent: ''
  }, {
    speakerName: 'Maya',
    role: 'Science presenter',
    personality: 'Curious, precise and approachable',
    deliveryInstructions: 'Speak clearly with confident conversational energy',
    accent: ''
  }, {
    speakerName: 'Jonas',
    role: 'Critical analyst',
    personality: 'Thoughtful, pragmatic and mildly witty',
    deliveryInstructions: 'Speak evenly with deliberate pacing',
    accent: ''
  }, {
    speakerName: 'Elena',
    role: 'Historian',
    personality: 'Reflective, vivid and intellectually playful',
    deliveryInstructions: 'Speak warmly with measured emphasis',
    accent: ''
  }, {
    speakerName: 'David',
    role: 'Investigative host',
    personality: 'Direct, sceptical and fair-minded',
    deliveryInstructions: 'Speak calmly with crisp articulation',
    accent: ''
  }];
  const DEFAULT_PODCAST_SPEAKERS = Object.freeze([Object.freeze({
    id: 'host-1',
    speakerName: 'Host 1',
    gender: '',
    voiceType: '',
    geminiVoiceName: '',
    personality: '',
    deliveryInstructions: ''
  }), Object.freeze({
    id: 'host-2',
    speakerName: 'Host 2',
    gender: '',
    voiceType: '',
    geminiVoiceName: '',
    personality: '',
    deliveryInstructions: ''
  })]);
  function createDefaultPodcastSpeakers() {
    return DEFAULT_PODCAST_SPEAKERS.map(speaker => ({
      ...speaker
    }));
  }
  const GEMINI_TTS_VOICE_GENDERS = Object.freeze(['female', 'male']);
  const GEMINI_TTS_VOICES = Object.freeze([Object.freeze({
    apiName: 'Zephyr',
    gender: 'female',
    type: 'bright',
    description: 'Bright female voice',
    previewCacheKey: 'zephyr'
  }), Object.freeze({
    apiName: 'Puck',
    gender: 'male',
    type: 'upbeat',
    description: 'Upbeat male voice',
    previewCacheKey: 'puck'
  }), Object.freeze({
    apiName: 'Charon',
    gender: 'male',
    type: 'informative',
    description: 'Informative male voice',
    previewCacheKey: 'charon'
  }), Object.freeze({
    apiName: 'Kore',
    gender: 'female',
    type: 'firm',
    description: 'Firm female voice',
    previewCacheKey: 'kore'
  }), Object.freeze({
    apiName: 'Fenrir',
    gender: 'male',
    type: 'excitable',
    description: 'Excitable male voice',
    previewCacheKey: 'fenrir'
  }), Object.freeze({
    apiName: 'Leda',
    gender: 'female',
    type: 'youthful',
    description: 'Youthful female voice',
    previewCacheKey: 'leda'
  }), Object.freeze({
    apiName: 'Orus',
    gender: 'male',
    type: 'firm',
    description: 'Firm male voice',
    previewCacheKey: 'orus'
  }), Object.freeze({
    apiName: 'Aoede',
    gender: 'female',
    type: 'breezy',
    description: 'Breezy female voice',
    previewCacheKey: 'aoede'
  }), Object.freeze({
    apiName: 'Callirrhoe',
    gender: 'female',
    type: 'easy-going',
    description: 'Easy-going female voice',
    previewCacheKey: 'callirrhoe'
  }), Object.freeze({
    apiName: 'Autonoe',
    gender: 'female',
    type: 'bright',
    description: 'Bright female voice',
    previewCacheKey: 'autonoe'
  }), Object.freeze({
    apiName: 'Enceladus',
    gender: 'male',
    type: 'breathy',
    description: 'Breathy male voice',
    previewCacheKey: 'enceladus'
  }), Object.freeze({
    apiName: 'Iapetus',
    gender: 'male',
    type: 'clear',
    description: 'Clear male voice',
    previewCacheKey: 'iapetus'
  }), Object.freeze({
    apiName: 'Umbriel',
    gender: 'male',
    type: 'easy-going',
    description: 'Easy-going male voice',
    previewCacheKey: 'umbriel'
  }), Object.freeze({
    apiName: 'Algieba',
    gender: 'male',
    type: 'smooth',
    description: 'Smooth male voice',
    previewCacheKey: 'algieba'
  }), Object.freeze({
    apiName: 'Despina',
    gender: 'female',
    type: 'smooth',
    description: 'Smooth female voice',
    previewCacheKey: 'despina'
  }), Object.freeze({
    apiName: 'Erinome',
    gender: 'female',
    type: 'clear',
    description: 'Clear female voice',
    previewCacheKey: 'erinome'
  }), Object.freeze({
    apiName: 'Algenib',
    gender: 'male',
    type: 'gravelly',
    description: 'Gravelly male voice',
    previewCacheKey: 'algenib'
  }), Object.freeze({
    apiName: 'Rasalgethi',
    gender: 'male',
    type: 'informative',
    description: 'Informative male voice',
    previewCacheKey: 'rasalgethi'
  }), Object.freeze({
    apiName: 'Laomedeia',
    gender: 'female',
    type: 'upbeat',
    description: 'Upbeat female voice',
    previewCacheKey: 'laomedeia'
  }), Object.freeze({
    apiName: 'Achernar',
    gender: 'female',
    type: 'soft',
    description: 'Soft female voice',
    previewCacheKey: 'achernar'
  }), Object.freeze({
    apiName: 'Alnilam',
    gender: 'male',
    type: 'firm',
    description: 'Firm male voice',
    previewCacheKey: 'alnilam'
  }), Object.freeze({
    apiName: 'Schedar',
    gender: 'male',
    type: 'even',
    description: 'Even male voice',
    previewCacheKey: 'schedar'
  }), Object.freeze({
    apiName: 'Gacrux',
    gender: 'female',
    type: 'mature',
    description: 'Mature female voice',
    previewCacheKey: 'gacrux'
  }), Object.freeze({
    apiName: 'Pulcherrima',
    gender: 'female',
    type: 'forward',
    description: 'Forward female voice',
    previewCacheKey: 'pulcherrima'
  }), Object.freeze({
    apiName: 'Achird',
    gender: 'male',
    type: 'friendly',
    description: 'Friendly male voice',
    previewCacheKey: 'achird'
  }), Object.freeze({
    apiName: 'Zubenelgenubi',
    gender: 'male',
    type: 'casual',
    description: 'Casual male voice',
    previewCacheKey: 'zubenelgenubi'
  }), Object.freeze({
    apiName: 'Vindemiatrix',
    gender: 'female',
    type: 'gentle',
    description: 'Gentle female voice',
    previewCacheKey: 'vindemiatrix'
  }), Object.freeze({
    apiName: 'Sadachbia',
    gender: 'male',
    type: 'lively',
    description: 'Lively male voice',
    previewCacheKey: 'sadachbia'
  }), Object.freeze({
    apiName: 'Sadaltager',
    gender: 'male',
    type: 'knowledgeable',
    description: 'Knowledgeable male voice',
    previewCacheKey: 'sadaltager'
  }), Object.freeze({
    apiName: 'Sulafat',
    gender: 'female',
    type: 'warm',
    description: 'Warm female voice',
    previewCacheKey: 'sulafat'
  })]);
  function isValidGeminiTtsVoice(voice) {
    return Boolean(voice && typeof voice === 'object' && typeof voice.apiName === 'string' && voice.apiName.trim() && GEMINI_TTS_VOICE_GENDERS.includes(voice.gender) && typeof voice.type === 'string' && voice.type.trim() && typeof voice.description === 'string' && voice.description.trim() && typeof voice.previewCacheKey === 'string' && voice.previewCacheKey.trim());
  }
  function getGeminiTtsVoices(filters = {}, catalogue = GEMINI_TTS_VOICES) {
    const source = Array.isArray(catalogue) ? catalogue : [];
    const gender = typeof filters?.gender === 'string' ? filters.gender.trim().toLowerCase() : '';
    const type = typeof filters?.type === 'string' ? filters.type.trim().toLowerCase() : '';
    return source.filter(isValidGeminiTtsVoice).filter(voice => !gender || voice.gender === gender).filter(voice => !type || voice.type === type);
  }
  function getAvailableVoiceTypes(gender = '', catalogue = GEMINI_TTS_VOICES) {
    return [...new Set(getGeminiTtsVoices({
      gender
    }, catalogue).map(voice => voice.type))].sort();
  }
  function getGeminiTtsVoice(apiName, catalogue = GEMINI_TTS_VOICES) {
    const normalisedApiName = typeof apiName === 'string' ? apiName.trim() : '';
    if (!normalisedApiName) return null;
    return getGeminiTtsVoices({}, catalogue).find(voice => voice.apiName === normalisedApiName) || null;
  }
  function inferGenderFromVoice(apiName) {
    return getGeminiTtsVoice(apiName)?.gender || '';
  }
  function inferTypeFromVoice(apiName) {
    return getGeminiTtsVoice(apiName)?.type || '';
  }
  const ICONS = {
    settings: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.04.08V22h-4v-1.92l-.04-.08a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1l-.08-.04H2v-4h1.92L4 9.92a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6l.04-.08V2h4v1.92l.04.08a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.4.33.75.6 1l.08.04H22v4h-1.92L20 14.08a1.7 1.7 0 0 0-.6.92Z"/></svg>',
    sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>',
    moon: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
    close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>',
    more: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
    grip: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>',
    chevron: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
  };
  Object.assign(services, {
    STORAGE_KEY,
    API_KEY_STORAGE_KEY,
    SESSION_KEY,
    PODCAST_PROJECT_SCHEMA_VERSION,
    DEFAULT_TEXT_MODEL,
    QUALITY_TEXT_MODEL,
    DEFAULT_TTS_MODEL,
    CUSTOM_MODEL_VALUE,
    DEFAULT_DURATION_MINUTES,
    DEFAULT_SPEAKING_RATE,
    MAX_SEGMENT_WORDS,
    MAX_SCRIPT_OVERAGE_RATIO,
    MIN_SCRIPT_LENGTH_RATIO,
    SCRIPT_TOKENS_PER_TARGET_WORD,
    MIN_SCRIPT_OUTPUT_TOKENS,
    MAX_SCRIPT_OUTPUT_TOKENS,
    SCRIPT_SEGMENTS_PER_MINUTE,
    MIN_SCRIPT_SEGMENTS,
    MAX_SCRIPT_SEGMENTS,
    MAX_DIRECTION_WORDS,
    MAX_DIRECTION_CHARACTERS,
    SUPPORTED_TEXT_MODELS,
    SUPPORTED_TTS_MODELS,
    TEXT_MODEL_OPTIONS,
    TTS_MODEL_OPTIONS,
    isValidCustomModelId,
    normaliseModelSelection,
    DEFAULT_MAX_TTS_CHARACTERS,
    MAX_HISTORY,
    SCRIPT_PROGRESS_MESSAGES,
    AUDIO_PROGRESS_MESSAGES,
    CHARACTER_TEMPLATES,
    DEFAULT_PODCAST_SPEAKERS,
    createDefaultPodcastSpeakers,
    GEMINI_TTS_VOICE_GENDERS,
    GEMINI_TTS_VOICES,
    isValidGeminiTtsVoice,
    getGeminiTtsVoices,
    getAvailableVoiceTypes,
    getGeminiTtsVoice,
    inferGenderFromVoice,
    inferTypeFromVoice,
    ICONS
  });
  return services;
}
