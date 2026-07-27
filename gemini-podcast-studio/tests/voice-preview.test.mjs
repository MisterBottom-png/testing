import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, installServices } from './service-harness.mjs';

class FakeClassList {
  values = new Set();
  toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }
}
class FakeElement {
  constructor(id = '') {
    this.id = id; this.dataset = {}; this.disabled = false; this.attributes = new Map();
    this.classList = new FakeClassList(); this.listeners = {}; this.parentElement = null;
    this.innerHTML = ''; this.textContent = '';
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || ''; }
  insertAdjacentElement(_position, element) { elements.set(element.id, element); element.parentElement = this.parentElement; }
  querySelector() { return null; }
  closest() { return null; }
  remove() { elements.delete(this.id); }
}

const elements = new Map();
for (let index = 0; index < 2; index += 1) {
  const container = new FakeElement(`previewContainer${index}`);
  const button = new FakeElement(`speakerPreview${index}`);
  const status = new FakeElement(`speakerPreviewStatus${index}`);
  button.parentElement = container; status.parentElement = container;
  elements.set(button.id, button); elements.set(status.id, status);
}
const generic = () => new FakeElement();
const els = {
  speakerList: generic(), createForm: generic(), connectionSetupForm: generic(), connectionSettingsForm: generic(),
  clearStoredDataButton: generic(), language: generic(), customLanguage: generic()
};
const appState = {
  connection: { apiKey: 'test-key', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' },
  podcast: { language: 'English', customLanguage: '' },
  speakers: [
    { id: 'host-1', speakerName: 'James', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Iapetus', deliveryInstructions: 'Natural pace' },
    { id: 'host-2', speakerName: 'Anna', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Sulafat', deliveryInstructions: 'Warm and clear' }
  ]
};
let serviceError = null;
let announcements = [];
const services = createServices({
  appState, els, renderSpeakerCards() {}, resetProject() {}, generateVoiceTest() {},
  createApiError(status, message, details = '') { const error = new Error(message); error.status = status; error.details = details; return error; },
  mapError: error => ({ message: error.message, suggestion: error.status === 429 ? 'Rate limited.' : 'Check configuration.' }),
  showServiceError: value => { serviceError = value; }, hideServiceError() { serviceError = null; },
  announce: message => { announcements.push(message); }
});
installServices(services, ['constants', 'textUtilities', 'appHelpers', 'pcmAudio', 'wavEncoder']);
services.announce = message => { announcements.push(message); };
services.voicePreviewCacheBackend = {};
services.setVoicePreviewCacheBackendForTests = backend => { services.voicePreviewCacheBackend = backend; };
services.readVoicePreviewCache = async (key, backend) => {
  try { return { record: await backend.get(key), storageError: null }; }
  catch (error) { return { record: null, storageError: error }; }
};
services.writeVoicePreviewCache = async (record, backend) => { try { await backend.set(record); return null; } catch (error) { return error; } };
services.removeVoicePreviewCache = async (key, backend) => { try { await backend.delete(key); return null; } catch (error) { return error; } };
services.clearVoicePreviewCache = async backend => { try { await (backend || services.voicePreviewCacheBackend).clear(); return null; } catch (error) { return error; } };
Object.defineProperties(globalThis, {
  document: { configurable: true, value: { getElementById: id => elements.get(id) || null, createElement: () => new FakeElement(), querySelectorAll: () => [] } },
  window: { configurable: true, value: { addEventListener() {} } },
  URL: { configurable: true, value: { createObjectURL: () => 'blob:test', revokeObjectURL() {} } },
  Audio: { configurable: true, value: function Audio() {} }
});
installServices(services, ['voicePreview']);
const api = services;

function createCache(initial = []) {
  const map = new Map(initial.map(record => [record.cacheKey, record]));
  return {
    map,
    deleted: [],
    async get(key) { return map.get(key) || null; },
    async set(record) { map.set(record.cacheKey, record); },
    async delete(key) { this.deleted.push(key); map.delete(key); },
    async clear() { map.clear(); }
  };
}
function responseWithAudio(bytes = [1, 2, 3, 4]) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: 'audio/pcm;rate=24000' } }] } }] });
    }
  };
}
function resetState() {
  appState.voicePreviewStates = {};
  appState.connection.apiKey = 'test-key';
  appState.connection.ttsModel = 'gemini-3.1-flash-tts-preview';
  appState.podcast.language = 'English';
  appState.speakers[0] = { id: 'host-1', speakerName: 'James', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Iapetus', deliveryInstructions: 'Natural pace' };
  appState.speakers[1] = { id: 'host-2', speakerName: 'Anna', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Sulafat', deliveryInstructions: 'Warm and clear' };
  serviceError = null;
  announcements = [];
  api.setVoicePreviewCacheBackendForTests(createCache());
}

test('preview descriptor includes language, voice, delivery instructions, model and generation version', () => {
  resetState();
  appState.podcast.language = 'Estonian';
  const descriptor = api.buildVoicePreviewDescriptor(appState.speakers[0]);
  assert.equal(descriptor.geminiVoiceName, 'Iapetus');
  assert.equal(descriptor.ttsModel, 'gemini-3.1-flash-tts-preview');
  assert.match(descriptor.prompt, /Tere\./);
  assert.match(descriptor.prompt, /Natural pace/);
  assert.match(descriptor.cacheKey, /^voice-preview-voice-preview-v1-/);
  const same = api.buildVoicePreviewDescriptor({ ...appState.speakers[0], deliveryInstructions: '  NATURAL   PACE ' });
  assert.equal(same.cacheKey, descriptor.cacheKey);
});

test('preview request sends the selected Gemini voice, language instructions and current TTS model', async () => {
  resetState();
  const cache = createCache();
  let request;
  await api.generateVoicePreview(0, {
    cacheBackend: cache,
    player: async () => {},
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return responseWithAudio();
    }
  });
  assert.match(request.url, /gemini-3\.1-flash-tts-preview/);
  assert.equal(request.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Iapetus');
  assert.match(request.body.contents[0].parts[0].text, /English/);
});

test('loading state disables the button and duplicate simultaneous requests share one API call', async () => {
  resetState();
  const cache = createCache();
  let resolveFetch;
  let fetchCalls = 0;
  const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
  const options = {
    cacheBackend: cache,
    player: async () => {},
    fetchImpl: async () => { fetchCalls += 1; return fetchPromise; }
  };
  const first = api.generateVoicePreview(0, options);
  const second = api.generateVoicePreview(0, options);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.getVoicePreviewState(0).status, 'loading');
  assert.equal(elements.get('speakerPreview0').disabled, true);
  assert.match(elements.get('speakerPreview0').innerHTML, /Generating preview…/);
  assert.equal(fetchCalls, 1);
  resolveFetch(responseWithAudio());
  assert.equal(await first, true);
  assert.equal(await second, true);
});

test('successful previews are cached and replay without another API request', async () => {
  resetState();
  const cache = createCache();
  let fetchCalls = 0;
  let playCalls = 0;
  const options = {
    cacheBackend: cache,
    player: async () => { playCalls += 1; },
    fetchImpl: async () => { fetchCalls += 1; return responseWithAudio(); }
  };
  assert.equal(await api.generateVoicePreview(0, options), true);
  assert.equal(await api.generateVoicePreview(0, options), true);
  assert.equal(fetchCalls, 1);
  assert.equal(playCalls, 2);
  assert.equal(cache.map.size, 1);
  assert.equal(api.getVoicePreviewState(0).status, 'ready');
});

test('language, voice, delivery and TTS model changes invalidate the active preview key', () => {
  resetState();
  const original = api.buildVoicePreviewDescriptor(appState.speakers[0]);
  appState.podcast.language = 'Russian';
  assert.notEqual(api.buildVoicePreviewDescriptor(appState.speakers[0]).cacheKey, original.cacheKey);
  appState.podcast.language = 'English';
  appState.speakers[0].geminiVoiceName = 'Erinome';
  appState.speakers[0].gender = 'female';
  assert.notEqual(api.buildVoicePreviewDescriptor(appState.speakers[0]).cacheKey, original.cacheKey);
  appState.speakers[0].geminiVoiceName = 'Iapetus';
  appState.speakers[0].gender = 'male';
  appState.speakers[0].deliveryInstructions = 'Faster';
  assert.notEqual(api.buildVoicePreviewDescriptor(appState.speakers[0]).cacheKey, original.cacheKey);
  appState.speakers[0].deliveryInstructions = 'Natural pace';
  appState.connection.ttsModel = 'gemini-2.5-flash-preview-tts';
  assert.notEqual(api.buildVoicePreviewDescriptor(appState.speakers[0]).cacheKey, original.cacheKey);
  appState.voicePreviewStates = { 'host-1': { status: 'ready', cacheKey: original.cacheKey, message: '' } };
  assert.equal(api.invalidateStaleVoicePreviewState(0), true);
  assert.equal(api.getVoicePreviewState(0).status, 'idle');
});

test('broken cache entries are removed and replaced safely', async () => {
  resetState();
  const descriptor = api.buildVoicePreviewDescriptor(appState.speakers[0]);
  const cache = createCache([{ cacheKey: descriptor.cacheKey, version: 'wrong', blob: new Blob(['x']) }]);
  let fetchCalls = 0;
  assert.equal(await api.generateVoicePreview(0, {
    cacheBackend: cache,
    player: async () => {},
    fetchImpl: async () => { fetchCalls += 1; return responseWithAudio(); }
  }), true);
  assert.equal(fetchCalls, 1);
  assert.deepEqual(cache.deleted, [descriptor.cacheKey]);
  assert.equal(api.isValidVoicePreviewRecord(cache.map.get(descriptor.cacheKey), descriptor.cacheKey), true);
});

test('cached playback failures remove the broken entry and generate one replacement', async () => {
  resetState();
  const descriptor = api.buildVoicePreviewDescriptor(appState.speakers[0]);
  const cached = { cacheKey: descriptor.cacheKey, version: 'voice-preview-v1', blob: new Blob([new Uint8Array(50)], { type: 'audio/wav' }) };
  const cache = createCache([cached]);
  let fetchCalls = 0;
  let playCalls = 0;
  const player = async () => {
    playCalls += 1;
    if (playCalls === 1) throw new Error('decode failed');
  };
  assert.equal(await api.generateVoicePreview(0, {
    cacheBackend: cache,
    player,
    fetchImpl: async () => { fetchCalls += 1; return responseWithAudio(); }
  }), true);
  assert.equal(fetchCalls, 1);
  assert.equal(playCalls, 2);
  assert.deepEqual(cache.deleted, [descriptor.cacheKey]);
});

test('API and empty-audio failures show a useful error without automatic retry', async () => {
  resetState();
  const failed = await api.generateVoicePreview(0, {
    cacheBackend: createCache(),
    player: async () => {},
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async text() { return JSON.stringify({ error: { message: 'Quota exceeded' } }); }
    })
  });
  assert.equal(failed, false);
  assert.equal(api.getVoicePreviewState(0).status, 'error');
  assert.equal(api.getVoicePreviewState(0).message, api.VOICE_PREVIEW_FAILURE_MESSAGE);
  assert.equal(serviceError.retry, null);

  appState.voicePreviewStates = {};
  const empty = await api.generateVoicePreview(0, {
    cacheBackend: createCache(),
    player: async () => {},
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ candidates: [] }); } })
  });
  assert.equal(empty, false);
  assert.match(serviceError.details, /empty voice-preview audio response/);
});

test('one speaker preview does not overwrite the other speaker cache entry', async () => {
  resetState();
  const cache = createCache();
  let fetchCalls = 0;
  const options = {
    cacheBackend: cache,
    player: async () => {},
    fetchImpl: async () => { fetchCalls += 1; return responseWithAudio(); }
  };
  await api.generateVoicePreview(0, options);
  await api.generateVoicePreview(1, options);
  assert.equal(fetchCalls, 2);
  assert.equal(cache.map.size, 2);
  const keys = [...cache.map.keys()];
  assert.notEqual(keys[0], keys[1]);
});
