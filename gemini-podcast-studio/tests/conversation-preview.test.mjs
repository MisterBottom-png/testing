import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'src', 'js', 'main.js'), 'utf8');

function extract(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} is missing`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.ok(end > start, `Could not isolate ${name}`);
  return source.slice(start, end);
}

const pureSource = [
  extract('stableSerialiseConversationPreview', 'getConversationPreviewTemplate'),
  extract('getConversationPreviewTemplate', 'buildConversationPreviewDialogue'),
  extract('buildConversationPreviewDialogue', 'validateConversationPreviewDialogue'),
  extract('validateConversationPreviewDialogue', 'buildConversationPreviewPrompt'),
  extract('buildConversationPreviewPrompt', 'buildConversationPreviewDescriptor'),
  extract('buildConversationPreviewDescriptor', 'buildConversationPreviewRequestBody'),
  extract('buildConversationPreviewRequestBody', 'validateConversationPreviewMapping'),
  extract('validateConversationPreviewMapping', 'validateConversationPreviewSetup')
].join('\n');

const appState = {
  podcast: { language: 'English' },
  connection: { ttsModel: 'gemini-3.1-flash-tts-preview' },
  speakers: [
    { id: 'host-1', speakerName: 'James', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Iapetus', deliveryInstructions: 'Natural pace' },
    { id: 'host-2', speakerName: 'Anna', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Sulafat', deliveryInstructions: 'Warm and clear' }
  ]
};
const templates = {
  english: ['Welcome one', 'Thanks two', 'Contrast three', 'Exactly four'],
  estonian: ['Tere üks', 'Aitäh kaks', 'Kontrast kolm', 'Täpselt neli']
};
const context = vm.createContext({
  appState,
  CONVERSATION_PREVIEW_TEMPLATES: templates,
  CONVERSATION_PREVIEW_TEMPLATE_VERSION: 'conversation-preview-v1',
  CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION: 'wav-pcm16-mono-v1',
  getLanguage: () => appState.podcast.language,
  getTtsModel: () => appState.connection.ttsModel,
  normaliseVoicePreviewValue: (value, { lowerCase = false } = {}) => {
    const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    return lowerCase ? text.toLocaleLowerCase() : text;
  },
  normaliseWhitespace: value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim(),
  buildSpeakerVoiceConfigs: speakers => speakers.map(speaker => ({
    speaker: String(speaker.speakerName).trim(),
    voiceConfig: { prebuiltVoiceConfig: { voiceName: String(speaker.geminiVoiceName).trim() } }
  })),
  buildTtsRequestBody: (text, speakerVoiceConfigs) => ({
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } } }
  }),
  hashVoicePreviewValue: value => { let hash = 2166136261; for (const ch of String(value)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); },
  deepClone: structuredClone
});
vm.runInContext(`${pureSource}\n;globalThis.api={stableSerialiseConversationPreview,getConversationPreviewTemplate,buildConversationPreviewDialogue,validateConversationPreviewDialogue,buildConversationPreviewPrompt,buildConversationPreviewDescriptor,buildConversationPreviewRequestBody,validateConversationPreviewMapping};`, context);
const api = context.api;

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
  assert.match(d.prompt, /Tere üks/);
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
  assert.match(source, /if \(conversationPreviewTask\) return conversationPreviewTask/);
  assert.match(source, /button\.disabled = loading/);
  assert.match(source, /aria-busy/);
});

test('cache replay, broken-entry replacement and unrelated-cache preservation are implemented', () => {
  assert.match(source, /readVoicePreviewCache\(descriptor\.cacheKey/);
  assert.match(source, /isValidConversationPreviewRecord/);
  assert.match(source, /removeVoicePreviewCache\(descriptor\.cacheKey/);
  assert.doesNotMatch(source, /clearVoicePreviewCache\(/);
  assert.match(source, /writeVoicePreviewCache\(record/);
});

test('duplicate voice warning supports Use anyway and Choose another voice focus', () => {
  assert.match(source, /Both speakers currently use \$\{escapeHtml\(duplicateVoice\)\}\./);
  assert.match(source, /Use anyway/);
  assert.match(source, /Choose another voice/);
  assert.match(source, /document\.getElementById\('speakerVoice1'\)\?\.focus/);
  assert.match(source, /approveConversationPreviewDuplicateVoice/);
});

test('validation, accessibility announcements and failure handling are wired', () => {
  assert.match(source, /validateSpeakerRecords\(appState\.speakers\)/);
  assert.match(source, /focusFirstConversationPreviewError/);
  assert.match(source, /role=\"status\" aria-live=\"polite\"/);
  assert.match(source, /audio[^>]+controls[^>]+aria-label=\"Two-speaker conversation preview\"/);
  assert.match(source, /finishReason !== 'STOP'/);
  assert.match(source, /empty conversation-preview audio response/);
  assert.match(source, /retry: null/);
});
