import test from 'node:test';
import assert from 'node:assert/strict';
import { createElementStub, createServices, installServices, withGlobals } from './service-harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

function createHarness() {
  const requests = [];
  const serviceErrors = [];
  const revokedUrls = [];
  let stage = '';
  const appState = {
    currentStage: 'script', busy: false, lastAction: null,
    connection: { apiKey: 'test-key', textModel: 'gemini-3.6-flash', customTextModel: '', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' },
    podcast: { topic: 'Productivity', durationMinutes: 3, language: 'English', customLanguage: '', format: 'conversation', customFormat: '', tones: ['Informative'], instructions: '' },
    speakers: [
      { id: 'host-1', speakerName: 'James', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Iapetus', personality: 'Calm and analytical', deliveryInstructions: 'Natural pace' },
      { id: 'host-2', speakerName: 'Anna', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Sulafat', personality: 'Curious and practical', deliveryInstructions: 'Conversational' }
    ],
    scriptView: 'editor',
    script: { title: 'Episode', summary: '', language: 'English', estimatedWords: 4, segments: [
      { speaker: 'James', direction: '', text: 'Welcome to today’s episode.' },
      { speaker: 'Anna', direction: '', text: 'Today we are discussing practical productivity.' }
    ] },
    originalScript: null, history: [], historyIndex: -1,
    audio: { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null },
    audioCacheReferences: {}, settings: { theme: 'light', maxTtsCharacters: 12000, speakingRate: 140 }
  };
  const services = createServices({
    appState,
    els: {
      scriptLoadingMessage: createElementStub(), scriptMetrics: createElementStub(), scriptValidation: createElementStub(),
      generateAudioButton: createElementStub(), scriptPanel: createElementStub(), undoButton: createElementStub(), redoButton: createElementStub(),
      audioContent: createElementStub(), createStage: createElementStub(), scriptStage: createElementStub(), audioStage: createElementStub(),
      createLoading: createElementStub(), scriptLoading: createElementStub(), createLoadingMessage: createElementStub(), scriptLoadingTitle: createElementStub(),
      createElapsed: createElementStub(), scriptElapsed: createElementStub(), generateScriptButton: createElementStub(), connectionChip: createElementStub()
    },
    hideServiceError() {}, showServiceError(error) { serviceErrors.push(error); return error; }, setBusy() {}, queueSave() {},
    setStage(value) { stage = value; },
    createApiError(status, message, details = '') { const error = new Error(message); error.status = status; error.details = details; return error; },
    handleGenerationError(error) { throw error; }, announce() {}, renderScriptStage() {}
  });
  installServices(services, ['constants', 'textUtilities', 'appHelpers', 'scriptUi', 'scriptValidation', 'pcmAudio', 'wavEncoder', 'ttsChunking', 'ttsTransport']);
  services.setStage = value => { stage = value; };
  services.generateTtsPcm = async ({ transcript, speakerVoiceConfigs }) => {
  requests.push(services.buildTtsRequestBody(transcript, speakerVoiceConfigs));
  return { pcmBytes: new Uint8Array([0, 0, 0, 0]), sampleRate: 24000 };
};
  installServices(services, ['generationJobs']);
  return { services, requests, serviceErrors, revokedUrls, get stage() { return stage; } };
}

async function withAudioGlobals(callback, revokedUrls = []) {
  let now = 0;
  return withGlobals({
    performance: { now: () => (now += 10) },
    URL: { createObjectURL: () => 'blob:generated', revokeObjectURL: url => revokedUrls.push(url) },
    atob: value => Buffer.from(value, 'base64').toString('binary')
  }, callback);
}

test('script generation uses human names and never exposes Gemini voice identifiers as character names', () => {
  const { services } = createHarness();
  assert.deepEqual(plain(services.buildScriptCharacters()), [
    { name: 'James', personality: 'Calm and analytical', role: 'host-1' },
    { name: 'Anna', personality: 'Curious and practical', role: 'host-2' }
  ]);
  const prompt = services.buildScriptPrompt();
  assert.match(prompt, /Name: James/);
  assert.match(prompt, /Name: Anna/);
  assert.doesNotMatch(prompt, /Name: Iapetus/);
  assert.doesNotMatch(prompt, /Name: Sulafat/);
  assert.deepEqual(plain(services.buildScriptSchema().properties.segments.items.properties.speaker.enum), ['James', 'Anna']);
});

test('validated script dialogue preserves configured human names', () => {
  const { services } = createHarness();
  const script = services.validateScript({
    title: 'Human names', summary: '',
    segments: [{ speaker: 'James', direction: '', text: 'Welcome.' }, { speaker: 'Anna', direction: '', text: 'Let us begin.' }]
  });
  assert.deepEqual(script.segments.map(segment => segment.speaker), ['James', 'Anna']);
  assert.ok(script.segments.every(segment => !['Iapetus', 'Sulafat'].includes(segment.speaker)));
});

test('human speakers map deterministically to exact Gemini API voices in configured order', () => {
  const { services } = createHarness();
  assert.deepEqual(plain(services.buildSpeakerVoiceConfigs()), [
    { speaker: 'James', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } },
    { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } }
  ]);
});

test('renaming a speaker updates structured script labels while keeping the selected voice attached', () => {
  const { services } = createHarness();
  const originalVoice = services.appState.speakers[0].geminiVoiceName;
  services.appState.speakers[0].speakerName = 'Jamie';
  assert.equal(services.renameScriptSpeaker('James', 'Jamie'), true);
  assert.equal(services.appState.script.segments[0].speaker, 'Jamie');
  assert.equal(services.appState.speakers[0].geminiVoiceName, originalVoice);
  assert.deepEqual(plain(services.buildSpeakerVoiceConfigs()[0]), { speaker: 'Jamie', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } });
});

test('unknown visible script speakers block TTS before any network request with a clear error', async () => {
  const harness = createHarness();
  harness.services.appState.script.segments[1].speaker = 'Unknown Host';
  await harness.services.generatePodcastAudio();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.serviceErrors.length, 1);
  assert.equal(harness.serviceErrors[0].title, 'Script speaker mismatch');
  assert.match(harness.serviceErrors[0].message, /Unknown Host/);
});

test('long scripts retain segment order and stable speaker-to-voice mapping across every chunk', async () => {
  const harness = createHarness();
  const longText = 'A'.repeat(430);
  harness.services.appState.settings.maxTtsCharacters = 1200;
  harness.services.appState.script.segments = Array.from({ length: 8 }, (_, index) => ({ speaker: index % 2 ? 'Anna' : 'James', direction: '', text: `${index}-${longText}` }));
  const chunks = harness.services.createTtsChunks();
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flatMap(chunk => chunk.script.segments.map(segment => segment.speaker)), harness.services.appState.script.segments.map(segment => segment.speaker));
  await withAudioGlobals(() => harness.services.generatePodcastAudio(), harness.revokedUrls);
  assert.equal(harness.requests.length, chunks.length);
  for (const request of harness.requests) {
    assert.deepEqual(plain(request.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs), [
      { speaker: 'James', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } },
      { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } }
    ]);
  }
  assert.deepEqual(plain(harness.services.appState.audioCacheReferences.chunks.map(chunk => chunk.speakerOrder)), plain(chunks.map(() => ['James', 'Anna'])));
  assert.equal(harness.stage, 'audio');
});

test('changing one voice invalidates completed audio and all dependent chunk references without altering the other speaker', async () => {
  const harness = createHarness();
  const otherSpeakerBefore = plain(harness.services.appState.speakers[1]);
  harness.services.appState.audio = { blob: {}, url: 'blob:old', sampleRate: 24000, generationSeconds: 1, durationSeconds: 2, createdAt: 'now' };
  harness.services.appState.audioCacheReferences = { voiceMappingSignature: 'old', chunks: [{ cacheKey: 'chunk-1' }, { cacheKey: 'chunk-2' }] };
  harness.services.appState.speakers[0].geminiVoiceName = 'Charon';
  await withAudioGlobals(() => {
    assert.equal(harness.services.invalidateAudioForSpeakerMappingChange({
      speakerId: 'host-1', previousSpeakerName: 'James', nextSpeakerName: 'James', previousVoiceName: 'Iapetus', nextVoiceName: 'Charon'
    }), true);
  }, harness.revokedUrls);
  assert.equal(harness.services.appState.audio.url, '');
  assert.equal(harness.services.appState.audio.blob, null);
  assert.deepEqual(plain(harness.services.appState.audioCacheReferences), {});
  assert.deepEqual(plain(harness.services.appState.speakers[1]), otherSpeakerBefore);
  assert.deepEqual(harness.revokedUrls, ['blob:old']);
});

test('speakerName and geminiVoiceName remain independent fields', () => {
  const { services } = createHarness();
  services.appState.speakers[0].speakerName = 'Jonathan';
  assert.equal(services.appState.speakers[0].geminiVoiceName, 'Iapetus');
  services.appState.speakers[0].geminiVoiceName = 'Charon';
  assert.equal(services.appState.speakers[0].speakerName, 'Jonathan');
  assert.equal(services.buildSpeakerVoiceConfigs()[0].speaker, 'Jonathan');
  assert.equal(services.buildSpeakerVoiceConfigs()[0].voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
});
