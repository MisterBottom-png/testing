import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, installServices, createElementStub, withGlobals } from './service-harness.mjs';
import { installState } from '../src/js/state.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); }
  };
}

async function createHarness(savedProject = null) {
  const localStorage = createStorage(savedProject ? { 'geminiPodcastStudio.preferences.v2': JSON.stringify(savedProject) } : {});
  const sessionStorage = createStorage();
  const globals = {
    document: { getElementById() { return createElementStub(); } },
    localStorage,
    sessionStorage,
    matchMedia: () => ({ matches: false })
  };
  return withGlobals(globals, () => {
    const services = installServices(createServices(), ['constants', 'textUtilities']);
    installState(services);
    installServices(services, ['appHelpers', 'preferences', 'connectionUi']);
    return {
      services,
      localStorage,
      loadPreferences: () => withGlobals(globals, () => services.loadPreferences())
    };
  });
}

test('clean sessions use central model, duration and speaking-rate defaults', async () => {
  const { services } = await createHarness();
  assert.equal(services.DEFAULT_TEXT_MODEL, 'gemini-3.5-flash-lite');
  assert.equal(services.QUALITY_TEXT_MODEL, 'gemini-3.6-flash');
  assert.equal(services.DEFAULT_TTS_MODEL, 'gemini-3.1-flash-tts-preview');
  assert.equal(services.appState.connection.textModel, services.DEFAULT_TEXT_MODEL);
  assert.equal(services.appState.connection.ttsModel, services.DEFAULT_TTS_MODEL);
  assert.equal(services.appState.podcast.durationMinutes, 3);
  assert.equal(services.appState.settings.speakingRate, 140);
  assert.equal(services.getTargetWords(), 420);
  const project = services.createDefaultPodcastProject();
  assert.equal(project.durationMinutes, 3);
  assert.equal(project.selectedModels.textModel, services.DEFAULT_TEXT_MODEL);
  assert.equal(project.selectedModels.ttsModel, services.DEFAULT_TTS_MODEL);
});

test('model selectors expose only the required supported and custom options', async () => {
  const { services } = await createHarness();
  const markup = services.connectionFormMarkup('test');
  assert.match(markup, /Gemini 3\.5 Flash-Lite · Recommended/);
  assert.match(markup, /Gemini 3\.6 Flash · Higher quality/);
  assert.match(markup, /Gemini 3\.1 Flash TTS Preview/);
  assert.match(markup, /Custom model ID…/);
  assert.doesNotMatch(markup, /gemini-2\.5/);
});

test('supported built-in models and unrelated saved settings survive migration', async () => {
  const { services } = await createHarness();
  const saved = services.createDefaultPodcastProject();
  saved.selectedModels.textModel = services.QUALITY_TEXT_MODEL;
  saved.settings.extraPreference = 'preserve-me';
  saved.extraProjectSetting = { keep: true };
  const result = services.migratePodcastProject(saved);
  assert.equal(result.migrated, false);
  assert.equal(result.project.selectedModels.textModel, services.QUALITY_TEXT_MODEL);
  assert.equal(result.project.settings.extraPreference, 'preserve-me');
  assert.deepEqual(result.project.extraProjectSetting, { keep: true });
});

test('unsupported saved built-ins fall back safely and clear associated custom fields', async () => {
  const { services } = await createHarness();
  const saved = services.createDefaultPodcastProject();
  saved.selectedModels = {
    textModel: 'gemini-2.5-flash',
    customTextModel: 'gemini-stale-text',
    ttsModel: 'gemini-2.5-pro-preview-tts',
    customTtsModel: 'gemini-stale-tts'
  };
  const result = services.migratePodcastProject(saved);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.project.selectedModels, {
    textModel: services.DEFAULT_TEXT_MODEL,
    customTextModel: '',
    ttsModel: services.DEFAULT_TTS_MODEL,
    customTtsModel: ''
  });
});

test('valid custom model selections remain custom across migration and reload', async () => {
  const seed = await createHarness();
  const saved = seed.services.createDefaultPodcastProject();
  saved.topic = 'Preserve custom models';
  saved.selectedModels = {
    textModel: 'custom',
    customTextModel: '  gemini-company-text-v1  ',
    ttsModel: 'custom',
    customTtsModel: 'gemini-company-tts-preview'
  };
  const { services, loadPreferences } = await createHarness(saved);
  const migration = await loadPreferences();
  assert.equal(migration.project.selectedModels.textModel, 'custom');
  assert.equal(services.appState.connection.textModel, 'custom');
  assert.equal(services.appState.connection.customTextModel, 'gemini-company-text-v1');
  assert.equal(services.appState.connection.ttsModel, 'custom');
  assert.equal(services.appState.connection.customTtsModel, 'gemini-company-tts-preview');
  assert.equal(services.appState.podcast.topic, 'Preserve custom models');
});

test('invalid custom selections migrate before runtime merge', async () => {
  const seed = await createHarness();
  const saved = seed.services.createDefaultPodcastProject();
  saved.topic = 'Keep this topic';
  saved.selectedModels = {
    textModel: 'custom', customTextModel: 'not a model id',
    ttsModel: 'custom', customTtsModel: ''
  };
  const { services, localStorage, loadPreferences } = await createHarness(saved);
  const migration = await loadPreferences();
  assert.equal(migration.migrated, true);
  assert.equal(services.appState.connection.textModel, services.DEFAULT_TEXT_MODEL);
  assert.equal(services.appState.connection.customTextModel, '');
  assert.equal(services.appState.connection.ttsModel, services.DEFAULT_TTS_MODEL);
  assert.equal(services.appState.connection.customTtsModel, '');
  assert.equal(services.appState.podcast.topic, 'Keep this topic');
  const rewritten = JSON.parse(localStorage.value(services.STORAGE_KEY));
  assert.equal(rewritten.selectedModels.textModel, services.DEFAULT_TEXT_MODEL);
});

test('feature-level Gemini transport functions construct requests with selected models', async () => {
  const { services } = await createHarness();
  services.appState.connection.apiKey = 'test-key';
  installServices(services, ['geminiTransport', 'pcmAudio', 'ttsTransport']);
  const calls = [];
  await withGlobals({ fetch: async (url, options) => {
    calls.push({ url, options });
    const isTts = String(url).includes(services.DEFAULT_TTS_MODEL);
    const payload = isTts
      ? { candidates: [{ content: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000;channels=1' } }] } }] }
      : { candidates: [{ content: { parts: [{ text: '{"title":"Test","segments":[]}' }] } }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  } }, async () => {
    const script = await services.generateStructuredScript({ prompt: 'test', schema: { type: 'object' }, actionLabel: 'testing' });
    assert.equal(script.title, 'Test');
    const audio = await services.generateTtsPcm({ transcript: 'Host 1: Hello', speakerVoiceConfigs: [] });
    assert.equal(audio.sampleRate, 24000);
  });
  assert.match(calls[0].url, new RegExp(services.DEFAULT_TEXT_MODEL));
  assert.match(calls[1].url, new RegExp(services.DEFAULT_TTS_MODEL));
  assert.equal(typeof services.testGeminiConnection, 'function');
});
