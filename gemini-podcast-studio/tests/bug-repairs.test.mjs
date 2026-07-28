import test from 'node:test';
import assert from 'node:assert/strict';
import { installBugRepairs } from '../src/js/bug-repairs.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const element = overrides => ({
  classList: { toggle() {}, add() {}, remove() {} },
  addEventListener() {},
  querySelector() { return null; },
  textContent: '',
  value: '',
  disabled: false,
  ...overrides
});

function createServices(overrides = {}) {
  const services = {
    DEFAULT_DURATION_MINUTES: 3,
    DEFAULT_TEXT_MODEL: 'gemini-3.5-flash-lite',
    DEFAULT_TTS_MODEL: 'gemini-3.1-flash-tts-preview',
    DEFAULT_SPEAKING_RATE: 140,
    DEFAULT_MAX_TTS_CHARACTERS: 12000,
    PODCAST_PROJECT_SCHEMA_VERSION: 2,
    AUDIO_PROGRESS_MESSAGES: [],
    STORAGE_KEY: 'project',
    appState: {
      script: null,
      speakers: [],
      audio: { blob: null, url: '' },
      audioCacheReferences: {},
      connection: { apiKey: '', textModel: '', ttsModel: '' },
      podcast: { durationMinutes: 3 },
      settings: { maxTtsCharacters: 12000, speakingRate: 140 },
      history: [],
      historyIndex: -1,
      currentStage: 'create'
    },
    els: {
      settingsDialog: element(),
      maxTtsCharacters: element({ value: '12000' }),
      speakingRate: element({ value: '140' }),
      connectionChip: element(),
      connectionLabel: element(),
      connectionModels: element(),
      scriptValidation: element(),
      generateAudioButton: element(),
      scriptLoadingMessage: element(),
      scriptPanel: element(),
      reorderStatus: element()
    },
    normaliseWhitespace: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    deepClone: clone,
    getMaxScriptSegments: () => 100,
    buildTtsRequestBody: (transcript, configs) => ({ transcript, configs }),
    createApiError: (status, message, details) => Object.assign(new Error(message), { status, details }),
    base64ToBytes: value => Uint8Array.from(Buffer.from(value, 'base64')),
    sampleRateFromMimeType: () => 24000,
    buildSpeakerVoiceConfigs: () => [],
    getTtsModel: () => 'gemini-tts',
    getTextModel: () => 'gemini-text',
    getTtsSpeakerValidationIssue: () => null,
    getGeminiTtsVoice: () => ({ gender: 'female', type: 'clear' }),
    createTtsChunks: () => [],
    getSpeakerVoiceMappingSignature: () => 'mapping',
    hideServiceError() {},
    showServiceError(value) { services.shownError = value; },
    setBusy() {},
    concatPcmBytes: parts => parts[0] || new Uint8Array(),
    pcm16ToWavBlob: bytes => new Blob([bytes], { type: 'audio/wav' }),
    invalidatePodcastAudio() {},
    buildTtsChunkCacheKey: () => 'key',
    queueSave() {},
    setStage() {},
    handleGenerationError(error) { services.handledError = error; },
    snapshotScript() {},
    renderScriptStage() {},
    announce() {},
    getWordCount: () => 0,
    renderScriptMetrics() {},
    resetProject() {},
    populateInputsFromState() {},
    renderConnectionForms() {},
    savePreferences() {},
    renderCurrentStage() {},
    updateTargetSummary() {},
    normaliseProjectSpeaker: (speaker, index) => ({ ...speaker, speakerName: String(speaker?.speakerName || `Host ${index + 1}`).trim() }),
    createDefaultPodcastSpeakers: () => [{ speakerName: 'Host 1' }, { speakerName: 'Host 2' }],
    migratePodcastProject: project => ({ project, migrated: false }),
    loadPreferences: () => ({ migrated: false }),
    preserveCorruptProject() {},
    ...overrides
  };
  if (overrides.appState) services.appState = { ...services.appState, ...overrides.appState };
  if (overrides.els) services.els = { ...services.els, ...overrides.els };
  return installBugRepairs(services);
}

test('editable script issues block blank dialogue', () => {
  const services = createServices({
    appState: {
      speakers: [{ speakerName: 'Anna' }, { speakerName: 'Mark' }]
    }
  });
  const issues = services.getEditableScriptIssues({ segments: [
    { speaker: 'Anna', direction: '', text: '   ' },
    { speaker: 'Mark', direction: '', text: 'Hello.' }
  ] });
  assert.equal(issues[0].code, 'EMPTY_SEGMENT_TEXT');
  assert.equal(issues[0].index, 0);
});

test('TTS retries transient server errors but not quota errors', async () => {
  const services = createServices({ appState: { connection: { apiKey: 'key' } } });
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { message: 'temporary' } }), { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] } }] }), { status: 200 });
  };
  const result = await services.requestTtsChunk('https://example.invalid', 'Text', [], { fetchImpl, sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.pcmBytes.byteLength, 2);

  let quotaCalls = 0;
  await assert.rejects(() => services.requestTtsChunk('https://example.invalid', 'Text', [], {
    fetchImpl: async () => {
      quotaCalls += 1;
      return new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    },
    sleep: async () => {}
  }));
  assert.equal(quotaCalls, 1);
});

test('failed regeneration preserves existing audio', async () => {
  const oldBlob = new Blob(['old']);
  const oldAudio = { blob: oldBlob, url: 'blob:old' };
  const oldRefs = { chunks: [{ cacheKey: 'old' }] };
  let invalidations = 0;
  const services = createServices({
    appState: {
      script: { segments: [
        { speaker: 'Anna', direction: '', text: 'Hello.' },
        { speaker: 'Mark', direction: '', text: 'Hi.' }
      ] },
      speakers: [
        { speakerName: 'Anna', gender: 'female', voiceType: 'clear', geminiVoiceName: 'A' },
        { speakerName: 'Mark', gender: 'male', voiceType: 'clear', geminiVoiceName: 'B' }
      ],
      audio: oldAudio,
      audioCacheReferences: oldRefs,
      connection: { apiKey: 'key' }
    },
    getGeminiTtsVoice: name => ({ gender: name === 'A' ? 'female' : 'male', type: 'clear' }),
    createTtsChunks: () => [{ index: 0, transcript: 'text' }],
    requestTtsChunk: async () => { throw new Error('temporary'); },
    invalidatePodcastAudio() { invalidations += 1; }
  });
  services.generateTtsPcm = async () => { throw new Error('temporary'); };

  await services.generatePodcastAudio();

  assert.equal(services.appState.audio, oldAudio);
  assert.equal(services.appState.audioCacheReferences, oldRefs);
  assert.equal(invalidations, 0);
  assert.ok(services.handledError);
});

test('no-op segment actions have no side effects', () => {
  let snapshots = 0;
  let invalidations = 0;
  const services = createServices({
    appState: {
      script: { segments: [
        { speaker: 'A', direction: '', text: 'One' },
        { speaker: 'B', direction: '', text: 'Two' }
      ] },
      speakers: [{ speakerName: 'A' }, { speakerName: 'B' }]
    },
    snapshotScript() { snapshots += 1; },
    invalidatePodcastAudio() { invalidations += 1; }
  });
  assert.equal(services.performSegmentAction(0, 'up'), false);
  assert.equal(services.performSegmentAction(1, 'down'), false);
  assert.equal(services.performSegmentAction(0, 'delete'), false);
  assert.equal(snapshots, 0);
  assert.equal(invalidations, 0);
});

test('typing history is flushed before undo', () => {
  let snapshots = 0;
  const services = createServices({
    appState: {
      script: { segments: [{ text: 'after' }] },
      history: [{ segments: [{ text: 'before' }] }, { segments: [{ text: 'after' }] }],
      historyIndex: 1
    },
    snapshotScript() { snapshots += 1; }
  });
  services.typingHistoryTimer = setTimeout(() => {}, 60_000);
  assert.equal(services.undo(), true);
  assert.equal(services.typingHistoryTimer, null);
  assert.equal(snapshots, 1);
  assert.equal(services.appState.script.segments[0].text, 'before');
});

test('reset applies central defaults and connection wording is accurate', () => {
  const services = createServices({
    appState: {
      connection: { apiKey: 'key', textModel: 'old', ttsModel: 'old' },
      podcast: { durationMinutes: 5 },
      settings: { maxTtsCharacters: 12000, speakingRate: 180 }
    }
  });
  services.resetProject({ preserveConnection: false, preservePreferences: false });
  assert.equal(services.appState.podcast.durationMinutes, 3);
  assert.equal(services.appState.connection.textModel, 'gemini-3.5-flash-lite');
  assert.equal(services.appState.connection.ttsModel, 'gemini-3.1-flash-tts-preview');
  assert.equal(services.appState.settings.speakingRate, 140);

  services.renderConnectionStatus();
  assert.equal(services.els.connectionLabel.textContent, 'Gemini configured');
});

test('settings close commits visible values', () => {
  let closeListener;
  const services = createServices({
    appState: { currentStage: 'create', settings: { maxTtsCharacters: 12000, speakingRate: 140 } },
    els: {
      settingsDialog: element({ addEventListener(type, listener) { if (type === 'close') closeListener = listener; } }),
      maxTtsCharacters: element({ value: '27500' }),
      speakingRate: element({ value: '175' })
    }
  });
  closeListener();
  assert.equal(services.appState.settings.maxTtsCharacters, 27500);
  assert.equal(services.appState.settings.speakingRate, 175);
});

test('current-schema saved projects reject blank dialogue', () => {
  const services = createServices();
  const project = {
    schemaVersion: 2,
    speakers: [{ speakerName: 'Anna' }, { speakerName: 'Mark' }],
    script: { segments: [
      { speaker: 'Anna', direction: '', text: '' },
      { speaker: 'Mark', direction: '', text: 'Hello.' }
    ] }
  };
  assert.throws(() => services.migratePodcastProject(project), /no spoken text/i);
});
