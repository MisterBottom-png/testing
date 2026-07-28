import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createElementStub, createServices, installServices, withGlobals } from './service-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'src', 'js', 'conversation-preview.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

async function createHarness() {
  const appState = {
    podcast: { language: 'English' },
    connection: { apiKey: 'test-key', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' },
    speakers: [
      { id: 'host-1', speakerName: 'James', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Iapetus', deliveryInstructions: 'Natural pace' },
      { id: 'host-2', speakerName: 'Anna', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Sulafat', deliveryInstructions: 'Warm and clear' }
    ]
  };
  const element = createElementStub();
  const services = createServices({
    appState,
    els: {
      speakerList: createElementStub(), createForm: createElementStub(), language: element, customLanguage: element,
      connectionSetupForm: createElementStub(), connectionSettingsForm: createElementStub(), swapCharacters: createElementStub(),
      clearStoredDataButton: createElementStub(), connectionChip: element, saveState: element
    },
    renderSpeakerCards() {}, resetProject() {}, loadPreferences() {}, applyTheme() {}, populateInputsFromState() {},
    renderConnectionForms() {}, renderCurrentStage() {}, resetHistory() {}, syncCreateInputs() {}, clearValidation() {},
    showValidationErrors() {}, validateSpeakerRecords: () => [], getSpeakerValidationTarget: () => ({}), hideServiceError() {},
    showServiceError() {}, announce() {}, mapError: error => ({ message: error.message, suggestion: '' }),
    createApiError(status, message, details = '') { const error = new Error(message); error.status = status; error.details = details; return error; },
    readVoicePreviewCache: async () => ({ record: null, storageError: null }), writeVoicePreviewCache: async () => null,
    removeVoicePreviewCache: async () => null, voicePreviewCacheBackend: {}, getDuplicateVoiceSignature: () => '',
    isDuplicateVoiceApproved: () => false,
    normaliseVoicePreviewValue(value, { lowerCase = false } = {}) {
      const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
      return lowerCase ? text.toLocaleLowerCase() : text;
    },
    hashVoicePreviewValue(value) {
      let hash = 2166136261;
      for (const character of String(value ?? '')) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      return (hash >>> 0).toString(36);
    }
  });
  installServices(services, ['constants', 'textUtilities', 'appHelpers', 'pcmAudio', 'wavEncoder', 'ttsTransport']);
  await withGlobals({
    window: { addEventListener() {} },
    document: { getElementById: () => null },
    requestAnimationFrame: callback => callback(),
    URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
    fetch: async () => { throw new Error('unexpected request'); }
  }, async () => installServices(services, ['conversationPreview']));
  return services;
}

const services = await createHarness();
const descriptor = () => services.buildConversationPreviewDescriptor();

test('uses both human speaker names and never exposes Gemini voice IDs as dialogue names', () => {
  const value = descriptor();
  assert.deepEqual(value.dialogue.map(line => line.speaker), ['James', 'Anna', 'James', 'Anna']);
  assert.doesNotMatch(value.prompt, /^Iapetus:/m);
  assert.doesNotMatch(value.prompt, /^Sulafat:/m);
});

test('preserves Host 1 and Host 2 voice mapping and speaker order', () => {
  const value = descriptor();
  assert.deepEqual(plain(value.speakerVoiceConfigs), [
    { speaker: 'James', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Iapetus' } } },
    { speaker: 'Anna', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } }
  ]);
  assert.equal(services.validateConversationPreviewMapping(value), true);
});

test('uses selected language, both delivery instructions and current TTS model', () => {
  services.appState.podcast.language = 'Estonian';
  const value = descriptor();
  assert.match(value.prompt, /Tere tulemast/);
  assert.match(value.prompt, /James: Natural pace/);
  assert.match(value.prompt, /Anna: Warm and clear/);
  assert.equal(value.ttsModel, 'gemini-3.1-flash-tts-preview');
  services.appState.podcast.language = 'English';
});

test('cache key changes for every required invalidation input', () => {
  const original = descriptor().cacheKey;
  const baseline = structuredClone(services.appState);
  const mutations = [
    () => { services.appState.speakers[0].speakerName = 'Jonas'; },
    () => { services.appState.speakers[0].geminiVoiceName = 'Charon'; },
    () => { services.appState.speakers[0].deliveryInstructions = 'Faster'; },
    () => { services.appState.podcast.language = 'Estonian'; },
    () => { services.appState.connection.ttsModel = 'another-tts-model'; }
  ];
  for (const mutate of mutations) {
    Object.assign(services.appState, structuredClone(baseline));
    mutate();
    assert.notEqual(descriptor().cacheKey, original);
  }
  Object.assign(services.appState, structuredClone(baseline));
});

test('stable serialisation does not depend on object property order', () => {
  assert.equal(services.stableSerialiseConversationPreview({ b: 2, a: 1 }), services.stableSerialiseConversationPreview({ a: 1, b: 2 }));
});

test('rejects an unknown speaker in the preview script', () => {
  const issues = services.validateConversationPreviewDialogue([
    { speaker: 'Iapetus', text: 'Hello' },
    { speaker: 'Anna', text: 'Hi' }
  ]);
  assert.match(issues[0].message, /unknown speaker/i);
});

test('request body uses Gemini multi-speaker TTS configuration', () => {
  const body = services.buildConversationPreviewRequestBody(descriptor());
  assert.equal(body.generationConfig.responseModalities[0], 'AUDIO');
  assert.equal(body.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[0].speaker, 'James');
});

test('button states and duplicate-request suppression are implemented', () => {
  for (const label of ['Preview conversation', 'Generating conversation preview…', 'Replay conversation preview', 'Try conversation preview again']) assert.match(source, new RegExp(label));
  assert.match(source, /if \(conversationPreviewTask\) return conversationPreviewTask/);
  assert.match(source, /button\.disabled = loading/);
  assert.match(source, /aria-busy/);
});

test('cache replay, broken-entry replacement and unrelated-cache preservation are implemented', () => {
  assert.match(source, /services\.readVoicePreviewCache\(descriptor\.cacheKey/);
  assert.match(source, /isValidConversationPreviewRecord/);
  assert.match(source, /services\.removeVoicePreviewCache\(descriptor\.cacheKey/);
  assert.doesNotMatch(source, /services\.clearVoicePreviewCache\(/);
  assert.match(source, /services\.writeVoicePreviewCache\(record/);
});

test('duplicate voice warning supports Use anyway and Choose another voice focus', () => {
  assert.match(source, /Both speakers currently use \$\{services\.escapeHtml\(duplicateVoice\)\}\./);
  assert.match(source, /Use anyway/);
  assert.match(source, /Choose another voice/);
  assert.match(source, /document\.getElementById\('speakerVoice1'\)\?\.focus/);
  assert.match(source, /approveConversationPreviewDuplicateVoice/);
});

test('validation, accessibility announcements and failure handling are wired', () => {
  assert.match(source, /services\.validateSpeakerRecords\(services\.appState\.speakers\)/);
  assert.match(source, /focusFirstConversationPreviewError/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /audio[^>]+controls[^>]+aria-label="Two-speaker conversation preview"/);
  assert.match(source, /parseGeminiAudioResponse\(data\)/);
  assert.match(source, /parseGeminiAudioResponse\(data\)/);
  assert.match(source, /retry: null/);
});
