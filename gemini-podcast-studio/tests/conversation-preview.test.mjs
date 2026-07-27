import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAppContext } from '../src/js/app-context.js';
import { installConversationPreview } from '../src/js/conversation-preview.js';

const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'src', 'js', 'conversation-preview.js'), 'utf8');

class FakeElement {
  constructor() { this.listeners = {}; this.textContent = ''; this.innerHTML = ''; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  insertAdjacentHTML(_position, html) { this.innerHTML += html; }
  querySelector() { return null; }
}

const appState = {
  podcast: { language: 'English' },
  connection: { ttsModel: 'gemini-3.1-flash-tts-preview', apiKey: 'test' },
  speakers: [
    { id: 'host-1', speakerName: 'James', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Iapetus', deliveryInstructions: 'Natural pace' },
    { id: 'host-2', speakerName: 'Anna', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Sulafat', deliveryInstructions: 'Warm and clear' }
  ],
  script: null
};
const els = {
  speakerList: new FakeElement(), createForm: new FakeElement(), connectionSetupForm: new FakeElement(),
  connectionSettingsForm: new FakeElement(), swapCharacters: new FakeElement(), clearStoredDataButton: new FakeElement(),
  saveState: new FakeElement(), connectionChip: new FakeElement(), customLanguage: new FakeElement()
};
const context = createAppContext();
for (const [name, value] of Object.entries({
  appState, els,
  getLanguage: () => appState.podcast.language,
  getTtsModel: () => appState.connection.ttsModel,
  normaliseVoicePreviewValue: (value, { lowerCase = false } = {}) => {
    const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    return lowerCase ? text.toLocaleLowerCase() : text;
  },
  normaliseWhitespace: value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(),
  escapeHtml: value => String(value ?? ''),
  buildSpeakerVoiceConfigs: speakers => speakers.map(speaker => ({
    speaker: String(speaker.speakerName).trim(),
    voiceConfig: { prebuiltVoiceConfig: { voiceName: String(speaker.geminiVoiceName).trim() } }
  })),
  buildTtsRequestBody: (text, speakerVoiceConfigs) => ({
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } } }
  }),
  hashVoicePreviewValue: value => { let hash = 2166136261; for (const ch of String(value)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); },
  deepClone: structuredClone,
  renderSpeakerCards() {}, resetProject() {}, loadPreferences() {}, applyTheme() {}, populateInputsFromState() {},
  renderConnectionForms() {}, resetHistory() {}, renderCurrentStage() {}, clearValidation() {}, syncCreateInputs() {},
  getDuplicateVoiceSignature: () => '', validateSpeakerRecords: () => [], getSpeakerValidationTarget: () => ({}),
  showValidationErrors() {}, announce() {}, hideServiceError() {}, showServiceError() {}, mapError: error => ({ message: error.message }),
  createApiError(status, message, details = '') { const error = new Error(message); error.status = status; error.details = details; return error; },
  readVoicePreviewCache: async () => ({ record: null, storageError: null }), removeVoicePreviewCache: async () => {},
  writeVoicePreviewCache: async () => null, voicePreviewCacheBackend: {}, base64ToBytes: () => new Uint8Array([0, 0]),
  sampleRateFromMimeType: () => 24000, pcm16ToWavBlob: bytes => new Blob([new Uint8Array(44), bytes])
})) context.expose(name, value);

globalThis.window = { addEventListener() {} };
globalThis.document = { getElementById: () => null };
globalThis.requestAnimationFrame = callback => callback();
installConversationPreview(context);
const api = context;

function descriptor() { return api.buildConversationPreviewDescriptor(); }

test('uses both human speaker names and never exposes Gemini voice IDs as dialogue names', () => {
  const d = descriptor();
  assert.deepEqual([...d.dialogue].map(line => line.speaker), ['James', 'Anna', 'James', 'Anna']);
  assert.doesNotMatch(d.prompt, /^Iapetus:/m);
  assert.doesNotMatch(d.prompt, /^Sulafat:/m);
});

test('preserves Host 1 and Host 2 voice mapping and speaker order', () => {
  const d = descriptor();
  assert.deepEqual(JSON.parse(JSON.stringify(d.speakerVoiceConfigs)), [
    { speaker: 'James', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } },
    { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } }
  ]);
  assert.equal(api.validateConversationPreviewMapping(d), true);
});

test('uses selected language, both delivery instructions and current TTS model', () => {
  appState.podcast.language = 'Estonian';
  const d = descriptor();
  assert.match(d.prompt, /Tere tulemast/);
  assert.match(d.prompt, /James: Natural pace/);
  assert.match(d.prompt, /Anna: Warm and clear/);
  assert.equal(d.ttsModel, 'gemini-3.1-flash-tts-preview');
  appState.podcast.language = 'English';
});

test('cache key changes for every required invalidation input', () => {
  const original = descriptor().cacheKey;
  const mutations = [
    () => { appState.speakers[0].speakerName = 'Jonas'; },
    () => { appState.speakers[0].geminiVoiceName = 'Charon'; },
    () => { appState.speakers[0].deliveryInstructions = 'Faster'; },
    () => { appState.podcast.language = 'Estonian'; },
    () => { appState.connection.ttsModel = 'another-tts-model'; }
  ];
  const baseline = structuredClone(appState);
  for (const mutate of mutations) {
    appState.podcast = structuredClone(baseline.podcast);
    appState.connection = structuredClone(baseline.connection);
    appState.speakers = structuredClone(baseline.speakers);
    mutate();
    assert.notEqual(descriptor().cacheKey, original);
  }
  appState.podcast = structuredClone(baseline.podcast);
  appState.connection = structuredClone(baseline.connection);
  appState.speakers = structuredClone(baseline.speakers);
});

test('stable serialisation does not depend on object property order', () => {
  assert.equal(api.stableSerialiseConversationPreview({ b: 2, a: 1 }), api.stableSerialiseConversationPreview({ a: 1, b: 2 }));
});

test('rejects an unknown speaker in the preview script', () => {
  const issues = api.validateConversationPreviewDialogue([
    { speaker: 'Iapetus', text: 'Hello' },
    { speaker: 'Anna', text: 'Hi' }
  ]);
  assert.match(issues[0].message, /unknown speaker/i);
});

test('request body uses Gemini multi-speaker TTS configuration', () => {
  const body = api.buildConversationPreviewRequestBody(descriptor());
  assert.equal(body.generationConfig.responseModalities[0], 'AUDIO');
  assert.equal(body.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[0].speaker, 'James');
});

test('button states and duplicate-request suppression are implemented', () => {
  for (const label of ['Preview conversation', 'Generating conversation preview…', 'Replay conversation preview', 'Try conversation preview again']) assert.match(source, new RegExp(label));
  assert.match(source, /if \s*\(conversationPreviewTask\)\s*return conversationPreviewTask/);
  assert.match(source, /button\.disabled = loading/);
  assert.match(source, /aria-busy/);
});

test('cache replay, broken-entry replacement and unrelated-cache preservation are implemented', () => {
  assert.match(source, /ctx\.readVoicePreviewCache\(descriptor\.cacheKey/);
  assert.match(source, /isValidConversationPreviewRecord/);
  assert.match(source, /ctx\.removeVoicePreviewCache\(descriptor\.cacheKey/);
  assert.doesNotMatch(source, /ctx\.clearVoicePreviewCache\(/);
  assert.match(source, /ctx\.writeVoicePreviewCache\(record/);
});

test('duplicate voice warning supports Use anyway and Choose another voice focus', () => {
  assert.match(source, /Both speakers currently use/);
  assert.match(source, /Use anyway/);
  assert.match(source, /Choose another voice/);
  assert.match(source, /document\.getElementById\('speakerVoice1'\)\?\.focus/);
  assert.match(source, /approveConversationPreviewDuplicateVoice/);
});

test('validation, accessibility announcements and failure handling are wired', () => {
  assert.match(source, /ctx\.validateSpeakerRecords\(ctx\.appState\.speakers\)/);
  assert.match(source, /focusFirstConversationPreviewError/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /audio[^>]+controls[^>]+aria-label="Two-speaker conversation preview"/);
  assert.match(source, /finishReason !== 'STOP'/);
  assert.match(source, /empty conversation-preview audio response/);
  assert.match(source, /retry: null/);
});
