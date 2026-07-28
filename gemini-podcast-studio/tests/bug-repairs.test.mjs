import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServices, installServices, createElementStub, withGlobals } from './service-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

function voice(name, gender, type) {
  return { apiName: name, gender, type, description: `${type} ${gender} voice`, previewCacheKey: name.toLowerCase() };
}

function audioState(url = 'blob:old') {
  return {
    blob: new Blob(['old-audio'], { type: 'audio/wav' }),
    url,
    sampleRate: 24000,
    generationSeconds: 1,
    durationSeconds: 1,
    createdAt: '2026-07-28T00:00:00.000Z'
  };
}

test('failed audio regeneration preserves the previous playable audio and cache references', async () => {
  const speakers = [
    { id: 'host-1', speakerName: 'Host 1', gender: 'female', voiceType: 'bright', geminiVoiceName: 'Zephyr' },
    { id: 'host-2', speakerName: 'Host 2', gender: 'male', voiceType: 'upbeat', geminiVoiceName: 'Puck' }
  ];
  const oldAudio = audioState();
  const oldRefs = { voiceMappingSignature: 'old', chunks: [{ index: 0, cacheKey: 'old-key' }] };
  let revoked = 0;
  const services = createServices({
    appState: {
      script: { title: 'Episode', summary: '', segments: [
        { speaker: 'Host 1', direction: '', text: 'Hello.' },
        { speaker: 'Host 2', direction: '', text: 'Hi.' }
      ] },
      speakers,
      audio: oldAudio,
      audioCacheReferences: oldRefs,
      currentStage: 'audio',
      connection: { apiKey: 'key' },
      settings: { maxTtsCharacters: 12000 }
    },
    els: { scriptLoadingMessage: createElementStub() },
    validateScriptSpeakers: () => [],
    getEditableScriptIssues: () => [],
    getGeminiTtsVoice: name => name === 'Zephyr' ? voice('Zephyr', 'female', 'bright') : voice('Puck', 'male', 'upbeat'),
    createTtsChunks: () => [{ index: 0, transcript: 'Host 1: Hello.' }],
    buildSpeakerVoiceConfigs: () => [],
    getSpeakerVoiceMappingSignature: () => 'new',
    generateTtsPcm: async () => { throw new Error('temporary failure'); },
    createApiError: (status, message, details) => Object.assign(new Error(message), { status, details }),
    concatPcmBytes: () => new Uint8Array(),
    pcm16ToWavBlob: () => new Blob(['new-audio']),
    queueSave() {},
    setStage() {},
    setBusy() {},
    hideServiceError() {},
    handleGenerationError() {},
    revokeAudioUrl() {
      revoked += 1;
      this.appState.audio = { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null };
    }
  });
  installServices(services, ['generationJobs']);

  await services.generatePodcastAudio();

  assert.equal(services.appState.audio.url, 'blob:old');
  assert.equal(services.appState.audio.blob, oldAudio.blob);
  assert.deepEqual(services.appState.audioCacheReferences, oldRefs);
  assert.equal(revoked, 0);
});

test('audio generation blocks edited scripts containing blank dialogue', async () => {
  let ttsCalls = 0;
  let shownError = null;
  const speakers = [
    { id: 'host-1', speakerName: 'Host 1', gender: 'female', voiceType: 'bright', geminiVoiceName: 'Zephyr' },
    { id: 'host-2', speakerName: 'Host 2', gender: 'male', voiceType: 'upbeat', geminiVoiceName: 'Puck' }
  ];
  const services = createServices({
    appState: {
      script: { segments: [
        { speaker: 'Host 1', direction: '', text: '' },
        { speaker: 'Host 2', direction: '', text: 'Valid text.' }
      ] },
      speakers,
      audio: audioState(''),
      audioCacheReferences: {},
      currentStage: 'script',
      connection: { apiKey: 'key' },
      settings: { maxTtsCharacters: 12000 }
    },
    els: { scriptLoadingMessage: createElementStub() },
    validateScriptSpeakers: () => [],
    getEditableScriptIssues: () => [{ code: 'EMPTY_SEGMENT_TEXT', index: 0, message: 'Segment 1 has no spoken text.' }],
    getGeminiTtsVoice: name => name === 'Zephyr' ? voice('Zephyr', 'female', 'bright') : voice('Puck', 'male', 'upbeat'),
    createTtsChunks: () => [{ index: 0, transcript: 'x' }],
    buildSpeakerVoiceConfigs: () => [],
    getSpeakerVoiceMappingSignature: () => 'sig',
    generateTtsPcm: async () => { ttsCalls += 1; return { pcmBytes: new Uint8Array([0, 0]), sampleRate: 24000 }; },
    concatPcmBytes: parts => parts[0],
    pcm16ToWavBlob: () => new Blob(['audio']),
    queueSave() {},
    setStage() {},
    setBusy() {},
    hideServiceError() {},
    handleGenerationError() {},
    revokeAudioUrl() {},
    showServiceError(error) { shownError = error; }
  });
  installServices(services, ['generationJobs']);

  await services.generatePodcastAudio();

  assert.equal(ttsCalls, 0);
  assert.match(shownError?.message || '', /Segment 1 has no spoken text/i);
});

test('editable script validation reports blank dialogue before TTS', () => {
  const services = createServices({
    appState: {
      speakers: [{ speakerName: 'Host 1' }, { speakerName: 'Host 2' }],
      script: null
    },
    normaliseWhitespace: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    getMaxScriptSegments: () => 30,
    getLanguage: () => 'English',
    getWordCount: () => 0,
    getTargetWords: () => 420,
    getLanguageLocale: () => 'en',
    countWords: () => 0,
    MAX_SCRIPT_OVERAGE_RATIO: 1.15,
    MIN_SCRIPT_LENGTH_RATIO: 0.75,
    MAX_SEGMENT_WORDS: 90,
    MAX_DIRECTION_WORDS: 12,
    MAX_DIRECTION_CHARACTERS: 120
  });
  installServices(services, ['scriptValidation']);

  const issues = services.getEditableScriptIssues({ segments: [
    { speaker: 'Host 1', direction: '', text: '   ' },
    { speaker: 'Host 2', direction: '', text: 'Hello.' }
  ] });

  assert.equal(issues[0]?.code, 'EMPTY_SEGMENT_TEXT');
  assert.equal(issues[0]?.index, 0);
});

test('TTS transport retries transient server failures and then returns audio', async () => {
  let attempts = 0;
  const services = createServices({
    appState: { connection: { apiKey: 'key' } },
    deepClone: value => JSON.parse(JSON.stringify(value)),
    createApiError: (status, message, details) => Object.assign(new Error(message), { status, details }),
    base64ToBytes: value => Uint8Array.from(Buffer.from(value, 'base64')),
    sampleRateFromMimeType: () => 24000
  });
  installServices(services, ['ttsTransport']);

  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response(JSON.stringify({ error: { message: 'temporary server failure' } }), { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } }] } }] }), { status: 200 });
  };

  const result = await services.requestTtsChunk('https://example.invalid', 'Transcript', [], {
    fetchImpl,
    sleep: async () => {},
    maxAttempts: 3
  });

  assert.equal(attempts, 2);
  assert.equal(result.sampleRate, 24000);
  assert.equal(result.pcmBytes.byteLength, 2);
});

test('segment action guard rejects impossible mutations', () => {
  const services = createServices({
    appState: { history: [], historyIndex: -1, script: null },
    els: { undoButton: createElementStub(), redoButton: createElementStub() },
    deepClone: value => JSON.parse(JSON.stringify(value)),
    MAX_HISTORY: 30
  });
  installServices(services, ['scriptUi']);
  const segments = [{}, {}];

  assert.equal(services.canPerformSegmentAction(segments, 0, 'up'), false);
  assert.equal(services.canPerformSegmentAction(segments, 1, 'down'), false);
  assert.equal(services.canPerformSegmentAction(segments, 0, 'delete'), false);
  assert.equal(services.canPerformSegmentAction(segments, 0, 'insert'), true);
});

test('flushing typing history records the current edit before delayed history can race', () => {
  const services = createServices({
    appState: {
      history: [{ segments: [{ text: 'before' }] }],
      historyIndex: 0,
      script: { segments: [{ text: 'after' }] },
      busy: false
    },
    els: { undoButton: createElementStub(), redoButton: createElementStub() },
    deepClone: value => JSON.parse(JSON.stringify(value)),
    MAX_HISTORY: 30,
    typingHistoryTimer: setTimeout(() => {}, 60_000)
  });
  installServices(services, ['scriptUi']);

  const flushed = services.flushTypingHistory();

  assert.equal(flushed, true);
  assert.equal(services.typingHistoryTimer, null);
  assert.equal(services.appState.historyIndex, 1);
  assert.equal(services.appState.history[1].segments[0].text, 'after');
});

test('reset project uses central duration, model and speaking-rate defaults', async () => {
  const services = createServices({
    PODCAST_PROJECT_SCHEMA_VERSION: 2,
    DEFAULT_DURATION_MINUTES: 3,
    DEFAULT_TEXT_MODEL: 'gemini-3.5-flash-lite',
    DEFAULT_TTS_MODEL: 'gemini-3.1-flash-tts-preview',
    DEFAULT_SPEAKING_RATE: 140,
    DEFAULT_MAX_TTS_CHARACTERS: 12000,
    createDefaultPodcastSpeakers: () => [{ id: 'host-1' }, { id: 'host-2' }],
    appState: {
      connection: {}, settings: {}, podcast: {}, speakers: [],
      expandedSpeakers: new Set(), audio: audioState(), audioCacheReferences: {}
    },
    els: { settingsDialog: createElementStub() },
    revokeAudioUrl() {}, populateInputsFromState() {}, renderConnectionForms() {}, renderSpeakerCards() {}, applyTheme() {}, savePreferences() {}, renderCurrentStage() {}, clearValidation() {}, announce() {}
  });
  installServices(services, ['statusUi']);

  await withGlobals({ matchMedia: () => ({ matches: false }) }, () => services.resetProject({ preserveConnection: false, preservePreferences: false }));

  assert.equal(services.appState.podcast.durationMinutes, services.DEFAULT_DURATION_MINUTES);
  assert.equal(services.appState.connection.textModel, services.DEFAULT_TEXT_MODEL);
  assert.equal(services.appState.connection.ttsModel, services.DEFAULT_TTS_MODEL);
  assert.equal(services.appState.settings.speakingRate, services.DEFAULT_SPEAKING_RATE);
});

test('connection status says configured rather than claiming an unverified connection', () => {
  const services = createServices({
    appState: { connection: { apiKey: 'key' } },
    els: {
      connectionChip: createElementStub(),
      connectionLabel: createElementStub(),
      connectionModels: createElementStub()
    },
    getTextModel: () => 'gemini-text',
    getTtsModel: () => 'gemini-tts'
  });
  installServices(services, ['connectionUi']);

  services.renderConnectionStatus();

  assert.equal(services.els.connectionLabel.textContent, 'Gemini configured');
});

test('current-schema saved projects reject blank dialogue instead of loading unsafe state', () => {
  const services = createServices();
  installServices(services, ['constants', 'textUtilities', 'preferences']);
  const project = services.createDefaultPodcastProject();
  project.speakers = [
    { id: 'host-1', speakerName: 'Host 1', gender: 'female', voiceType: 'bright', geminiVoiceName: 'Zephyr', personality: '', deliveryInstructions: '' },
    { id: 'host-2', speakerName: 'Host 2', gender: 'male', voiceType: 'upbeat', geminiVoiceName: 'Puck', personality: '', deliveryInstructions: '' }
  ];
  project.script = {
    title: 'Broken', summary: '', segments: [
      { speaker: 'Host 1', direction: '', text: '' },
      { speaker: 'Host 2', direction: '', text: 'Hello.' }
    ]
  };

  assert.throws(() => services.migratePodcastProject(project), /blank spoken text|no spoken text/i);
});

test('settings closing routes share one commit helper and runtime verification is part of check', async () => {
  const [events, packageJson, runtime] = await Promise.all([
    read('src/js/ui-events.js'), read('package.json'), read('scripts/runtime-smoke.mjs')
  ]);
  const pkg = JSON.parse(packageJson);

  assert.match(events, /function commitSettingsFromDialog\(/);
  assert.match(events, /settingsDialog\.addEventListener\('close', commitSettingsFromDialog\)/);
  assert.match(pkg.scripts.check, /test:runtime/);
  assert.doesNotMatch(runtime, /estimatedWords:\s*18/);
  assert.doesNotMatch(runtime, /language:\s*'English'/);
  assert.match(runtime, /google-chrome/);
});
