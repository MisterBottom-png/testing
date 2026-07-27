import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../src/js/app-context.js';
import { installConstants } from '../src/js/constants.js';
import { installTextUtils } from '../src/js/text-utils.js';
import { installUiScript } from '../src/js/ui-script.js';
import { installScriptValidation } from '../src/js/script-validation.js';
import { installScriptGeneration } from '../src/js/script-generation.js';
import { installPcmAudio } from '../src/js/pcm-audio.js';
import { installWavEncoder } from '../src/js/wav-encoder.js';
import { installTtsChunking } from '../src/js/tts-chunking.js';
import { installGeminiErrors } from '../src/js/gemini-errors.js';
import { installGeminiApi } from '../src/js/gemini-api.js';
import { installTtsGeneration } from '../src/js/tts-generation.js';

function createHarness() {
  const requests = [];
  const serviceErrors = [];
  const revokedUrls = [];
  let stage = '';

  globalThis.performance = { now: (() => { let value = 0; return () => (value += 10); })() };
  globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');
  globalThis.URL = {
    createObjectURL: () => 'blob:generated',
    revokeObjectURL: url => revokedUrls.push(url)
  };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.window = { devicePixelRatio: 1, scrollTo() {} };
  globalThis.document = { querySelectorAll: () => [], getElementById: () => null };
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/pcm;rate=24000' } }] } }]
      })
    };
  };

  const appState = {
    currentStage: 'script',
    busy: false,
    lastAction: null,
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
    originalScript: null,
    history: [],
    historyIndex: -1,
    audio: { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null },
    audioCacheReferences: {},
    settings: { theme: 'light', maxTtsCharacters: 12000, speakingRate: 140 }
  };
  const els = {
    scriptLoadingMessage: { textContent: '' },
    scriptMetrics: { innerHTML: '' },
    scriptValidation: { className: '', textContent: '' },
    generateAudioButton: { disabled: false },
    liveStatus: { textContent: '' }
  };
  const context = createAppContext();
  context.expose('appState', appState);
  context.expose('els', els);
  installConstants(context);
  installTextUtils(context);
  installUiScript(context);
  installScriptValidation(context);
  installScriptGeneration(context);
  installPcmAudio(context);
  installWavEncoder(context);
  installTtsChunking(context);
  installGeminiErrors(context);
  installGeminiApi(context);
  context.expose('hideServiceError', () => {});
  context.expose('showServiceError', error => { serviceErrors.push(error); return error; });
  context.expose('setBusy', () => {});
  context.expose('queueSave', () => {});
  context.expose('handleGenerationError', error => { throw error; });
  context.expose('setStage', value => { stage = value; });
  context.expose('formatDuration', seconds => String(seconds));
  context.expose('formatBytes', bytes => String(bytes));
  context.expose('escapeHtml', value => String(value ?? ''));
  context.expose('announce', () => {});
  installTtsGeneration(context);

  return {
    context,
    api: context,
    requests,
    serviceErrors,
    revokedUrls,
    get stage() { return stage; }
  };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('script generation uses human names and never exposes Gemini voice identifiers as character names', () => {
  const { api } = createHarness();
  assert.deepEqual(plain(api.buildScriptCharacters()), [
    { name: 'James', personality: 'Calm and analytical', role: 'host-1' },
    { name: 'Anna', personality: 'Curious and practical', role: 'host-2' }
  ]);
  const prompt = api.buildScriptPrompt();
  assert.match(prompt, /Name: James/);
  assert.match(prompt, /Name: Anna/);
  assert.doesNotMatch(prompt, /Name: Iapetus/);
  assert.doesNotMatch(prompt, /Name: Sulafat/);
  assert.deepEqual(plain(api.buildScriptSchema().properties.segments.items.properties.speaker.enum), ['James', 'Anna']);
});

test('validated script dialogue preserves configured human names', () => {
  const { api } = createHarness();
  const script = api.validateScript({
    title: 'Human names', summary: '', language: 'English', estimatedWords: 4,
    segments: [
      { speaker: 'James', direction: '', text: 'Welcome.' },
      { speaker: 'Anna', direction: '', text: 'Let us begin.' }
    ]
  });
  assert.deepEqual(plain(script.segments.map(segment => segment.speaker)), ['James', 'Anna']);
  assert.ok(script.segments.every(segment => !['Iapetus', 'Sulafat'].includes(segment.speaker)));
});

test('human speakers map deterministically to exact Gemini API voices in configured order', () => {
  const { api } = createHarness();
  assert.deepEqual(plain(api.buildSpeakerVoiceConfigs()), [
    { speaker: 'James', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } },
    { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } }
  ]);
});

test('renaming a speaker updates structured script labels while keeping the selected voice attached', () => {
  const { context, api } = createHarness();
  const originalVoice = context.appState.speakers[0].geminiVoiceName;
  context.appState.speakers[0].speakerName = 'Jamie';
  assert.equal(api.renameScriptSpeaker('James', 'Jamie'), true);
  assert.equal(context.appState.script.segments[0].speaker, 'Jamie');
  assert.equal(context.appState.speakers[0].geminiVoiceName, originalVoice);
  assert.deepEqual(plain(api.buildSpeakerVoiceConfigs()[0]), {
    speaker: 'Jamie', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } }
  });
});

test('unknown visible script speakers block TTS before any network request with a clear error', async () => {
  const harness = createHarness();
  harness.context.appState.script.segments[1].speaker = 'Unknown Host';
  await harness.api.generatePodcastAudio();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.serviceErrors.length, 1);
  assert.equal(harness.serviceErrors[0].title, 'Script speaker mismatch');
  assert.match(harness.serviceErrors[0].message, /Unknown Host/);
});

test('long scripts retain segment order and stable speaker-to-voice mapping across every chunk', async () => {
  const harness = createHarness();
  const longText = 'A'.repeat(430);
  harness.context.appState.settings.maxTtsCharacters = 1200;
  harness.context.appState.script.segments = Array.from({ length: 8 }, (_, index) => ({
    speaker: index % 2 ? 'Anna' : 'James',
    direction: '',
    text: `${index}-${longText}`
  }));

  const chunks = harness.api.createTtsChunks();
  assert.ok(chunks.length > 1);
  assert.deepEqual(
    plain(chunks.flatMap(chunk => chunk.script.segments.map(segment => segment.speaker))),
    harness.context.appState.script.segments.map(segment => segment.speaker)
  );

  await harness.api.generatePodcastAudio();
  assert.equal(harness.requests.length, chunks.length);
  const mappings = harness.requests.map(request => request.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs);
  for (const mapping of mappings) {
    assert.deepEqual(plain(mapping), [
      { speaker: 'James', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } },
      { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } }
    ]);
  }
  assert.deepEqual(
    plain(harness.context.appState.audioCacheReferences.chunks.map(chunk => chunk.speakerOrder)),
    plain(chunks.map(() => ['James', 'Anna']))
  );
  assert.equal(harness.stage, 'audio');
});

test('changing one voice invalidates completed audio and all dependent chunk references without altering the other speaker', () => {
  const { context, api, revokedUrls } = createHarness();
  const otherSpeakerBefore = plain(context.appState.speakers[1]);
  context.appState.audio = { blob: {}, url: 'blob:old', sampleRate: 24000, generationSeconds: 1, durationSeconds: 2, createdAt: 'now' };
  context.appState.audioCacheReferences = { voiceMappingSignature: 'old', chunks: [{ cacheKey: 'chunk-1' }, { cacheKey: 'chunk-2' }] };
  context.appState.speakers[0].geminiVoiceName = 'Charon';

  assert.equal(api.invalidateAudioForSpeakerMappingChange({
    speakerId: 'host-1',
    previousSpeakerName: 'James',
    nextSpeakerName: 'James',
    previousVoiceName: 'Iapetus',
    nextVoiceName: 'Charon'
  }), true);
  assert.equal(context.appState.audio.url, '');
  assert.equal(context.appState.audio.blob, null);
  assert.deepEqual(plain(context.appState.audioCacheReferences), {});
  assert.deepEqual(plain(context.appState.speakers[1]), otherSpeakerBefore);
  assert.deepEqual(revokedUrls, ['blob:old']);
});

test('speakerName and geminiVoiceName remain independent fields', () => {
  const { context, api } = createHarness();
  context.appState.speakers[0].speakerName = 'Jonathan';
  assert.equal(context.appState.speakers[0].geminiVoiceName, 'Iapetus');
  context.appState.speakers[0].geminiVoiceName = 'Charon';
  assert.equal(context.appState.speakers[0].speakerName, 'Jonathan');
  assert.equal(api.buildSpeakerVoiceConfigs()[0].speaker, 'Jonathan');
  assert.equal(api.buildSpeakerVoiceConfigs()[0].voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
});
