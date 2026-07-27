import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../src/js/app-context.js';
import { installConstants } from '../src/js/constants.js';
import { installTextUtils } from '../src/js/text-utils.js';
import { installPreferences } from '../src/js/preferences.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); writes += 1; },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); },
    get writes() { return writes; }
  };
}

function createHarness(initialLocalStorage = {}) {
  const localStorage = createStorage(initialLocalStorage);
  const sessionStorage = createStorage();
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.matchMedia = () => ({ matches: false });

  const context = createAppContext();
  installConstants(context);
  context.expose('appState', {
    schemaVersion: context.PODCAST_PROJECT_SCHEMA_VERSION,
    connection: { apiKey: '', rememberKey: false, textModel: 'gemini-3.6-flash', customTextModel: '', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' },
    podcast: { topic: '', durationMinutes: 5, language: 'English', customLanguage: '', format: 'Friendly conversation', customFormat: '', tones: ['Informative', 'Casual'], instructions: '' },
    speakers: context.createDefaultPodcastSpeakers(),
    script: null,
    originalScript: null,
    legacyScript: null,
    audioCacheReferences: {},
    lastModified: '',
    settings: { theme: 'light', maxTtsCharacters: context.DEFAULT_MAX_TTS_CHARACTERS, speakingRate: 140 }
  });
  context.expose('els', {});
  installTextUtils(context);
  installPreferences(context);
  return { context, localStorage, sessionStorage, api: context };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('new projects use schema version 2 and the required default speaker model', () => {
  const { api } = createHarness();
  const project = plain(api.createDefaultPodcastProject());
  assert.equal(project.schemaVersion, 2);
  assert.deepEqual(project.speakers, [
    { id: 'host-1', speakerName: 'Host 1', gender: '', voiceType: '', geminiVoiceName: '', personality: '', deliveryInstructions: '' },
    { id: 'host-2', speakerName: 'Host 2', gender: '', voiceType: '', geminiVoiceName: '', personality: '', deliveryInstructions: '' }
  ]);
});

test('legacy projects migrate names, valid voices, catalogue metadata, scripts, settings and selected models', () => {
  const { api } = createHarness();
  const script = { title: 'Legacy episode', segments: [{ speaker: 'Alice', direction: '', text: 'Hello.' }, { speaker: 'Bob', direction: '', text: 'Hi.' }] };
  const legacy = {
    theme: 'dark',
    maxTtsCharacters: 9000,
    speakingRate: 155,
    textModel: 'gemini-2.5-flash',
    customTextModel: '',
    ttsModel: 'gemini-2.5-pro-preview-tts',
    customTtsModel: '',
    podcast: { topic: 'Migration', language: 'Estonian', durationMinutes: 7, format: 'Interview', tones: ['Serious'], instructions: 'Preserve this.' },
    characters: [
      { name: 'Alice', voice: 'Erinome', personality: 'Analytical', direction: 'Speak calmly', role: 'Host' },
      { characterName: 'Bob', voice: 'Iapetus', personality: 'Curious', direction: 'Speak clearly', accent: 'Neutral' }
    ],
    script
  };
  const result = plain(api.migratePodcastProject(legacy, '2026-07-27T12:00:00.000Z'));
  assert.equal(result.migrated, true);
  assert.equal(result.project.schemaVersion, 2);
  assert.equal(result.project.speakers[0].speakerName, 'Alice');
  assert.equal(result.project.speakers[0].geminiVoiceName, 'Erinome');
  assert.equal(result.project.speakers[0].gender, 'female');
  assert.equal(result.project.speakers[0].voiceType, 'clear');
  assert.equal(result.project.speakers[1].speakerName, 'Bob');
  assert.equal(result.project.speakers[1].geminiVoiceName, 'Iapetus');
  assert.equal(result.project.speakers[1].gender, 'male');
  assert.equal(result.project.speakers[1].voiceType, 'clear');
  assert.deepEqual(result.project.script, script);
  assert.equal(result.project.topic, 'Migration');
  assert.equal(result.project.language, 'Estonian');
  assert.equal(result.project.settings.theme, 'dark');
  assert.equal(result.project.selectedModels.textModel, 'gemini-2.5-flash');
  assert.equal(result.project.selectedModels.ttsModel, 'gemini-2.5-pro-preview-tts');
  assert.equal(result.project.lastModified, '2026-07-27T12:00:00.000Z');
});

test('unknown legacy voices remain preserved and are marked unavailable without guessed metadata', () => {
  const { api } = createHarness();
  const result = plain(api.migratePodcastProject({ characters: [{ name: 'Host 1', voice: 'RemovedVoice' }] }, '2026-07-27T12:00:00.000Z'));
  const speaker = result.project.speakers[0];
  assert.equal(speaker.speakerName, 'Host 1');
  assert.equal(speaker.geminiVoiceName, 'RemovedVoice');
  assert.equal(speaker.gender, '');
  assert.equal(speaker.voiceType, '');
  assert.equal(speaker.voiceUnavailable, true);
});

test('migration is idempotent and does not change an already migrated project timestamp', () => {
  const { api } = createHarness();
  const first = plain(api.migratePodcastProject({ characters: [{ name: 'Host 1', voice: 'Iapetus' }] }, '2026-07-27T12:00:00.000Z'));
  const second = plain(api.migratePodcastProject(first.project, '2026-07-28T12:00:00.000Z'));
  assert.equal(second.migrated, false);
  assert.deepEqual(second.project, first.project);
  assert.equal(second.project.lastModified, '2026-07-27T12:00:00.000Z');
});

test('loading migrates legacy storage once and preserves unsupported legacy script values', () => {
  const legacy = {
    podcast: { topic: 'Stored legacy project', language: 'English' },
    characters: [{ name: 'Host 1', voice: 'Iapetus' }, { name: 'Host 2', voice: 'Erinome' }],
    script: 'Legacy script text that the current editor cannot parse safely.'
  };
  const { context, localStorage, api } = createHarness({ [apiKeyName()]: JSON.stringify(legacy) });
  const first = plain(api.loadPreferences('2026-07-27T12:00:00.000Z'));
  assert.equal(first.migrated, true);
  assert.equal(context.appState.legacyScript, legacy.script);
  const writesAfterFirstLoad = localStorage.writes;
  const second = plain(api.loadPreferences('2026-07-28T12:00:00.000Z'));
  assert.equal(second.migrated, false);
  assert.equal(localStorage.writes, writesAfterFirstLoad);
  const saved = JSON.parse(localStorage.value(api.STORAGE_KEY));
  assert.equal(saved.script, legacy.script);
  assert.equal(saved.lastModified, '2026-07-27T12:00:00.000Z');
});

test('saving and loading preserve every new speaker field independently', () => {
  const { context, localStorage, api } = createHarness();
  context.appState.podcast.topic = 'Round trip';
  context.appState.speakers = [
    { id: 'host-1', speakerName: 'James', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Iapetus', personality: 'Calm and analytical', deliveryInstructions: 'Speak naturally at a moderate pace' },
    { id: 'host-2', speakerName: 'Anna', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Erinome', personality: 'Curious and precise', deliveryInstructions: 'Use measured emphasis' }
  ];
  context.appState.script = { title: 'Round trip', segments: [{ speaker: 'James', direction: '', text: 'One.' }, { speaker: 'Anna', direction: '', text: 'Two.' }] };
  context.appState.connection.textModel = 'custom';
  context.appState.connection.customTextModel = 'gemini-custom-text';
  context.appState.connection.ttsModel = 'custom';
  context.appState.connection.customTtsModel = 'gemini-custom-tts';
  api.savePreferences('2026-07-27T12:00:00.000Z');

  context.appState.speakers = api.createDefaultPodcastSpeakers();
  context.appState.script = null;
  context.appState.podcast.topic = '';
  api.loadPreferences('2026-07-28T12:00:00.000Z');

  assert.deepEqual(plain(context.appState.speakers), [
    { id: 'host-1', speakerName: 'James', gender: 'female', voiceType: 'warm', geminiVoiceName: 'Iapetus', personality: 'Calm and analytical', deliveryInstructions: 'Speak naturally at a moderate pace' },
    { id: 'host-2', speakerName: 'Anna', gender: 'male', voiceType: 'clear', geminiVoiceName: 'Erinome', personality: 'Curious and precise', deliveryInstructions: 'Use measured emphasis' }
  ]);
  assert.equal(context.appState.podcast.topic, 'Round trip');
  assert.equal(context.appState.script.title, 'Round trip');
  assert.equal(context.appState.connection.customTextModel, 'gemini-custom-text');
  assert.equal(context.appState.connection.customTtsModel, 'gemini-custom-tts');
  assert.equal(JSON.parse(localStorage.value(api.STORAGE_KEY)).schemaVersion, 2);
});

test('lastModified changes only when project content genuinely changes', () => {
  const { context, api } = createHarness();
  const first = plain(api.savePreferences('2026-07-27T12:00:00.000Z'));
  const unchanged = plain(api.savePreferences('2026-07-28T12:00:00.000Z'));
  assert.equal(unchanged.lastModified, first.lastModified);
  context.appState.podcast.topic = 'A genuine change';
  const changed = plain(api.savePreferences('2026-07-29T12:00:00.000Z'));
  assert.equal(changed.lastModified, '2026-07-29T12:00:00.000Z');
});

function apiKeyName() {
  return 'geminiPodcastStudio.preferences.v2';
}
