import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppContext } from '../src/js/app-context.js';
import { installConstants } from '../src/js/constants.js';
import { installTextUtils } from '../src/js/text-utils.js';
import { installPreferences } from '../src/js/preferences.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); }
  };
}

function createHarness(rawProject) {
  const localStorage = createStorage({ 'geminiPodcastStudio.preferences.v2': rawProject });
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
  return { context, localStorage, api: context };
}

test('corrupt saved JSON is backed up and loading falls back safely without deleting the original project value', () => {
  const raw = '{"schemaVersion":2,"speakers":[';
  const { context, localStorage, api } = createHarness(raw);
  const result = api.loadPreferences('2026-07-27T03:00:00.000Z');

  assert.equal(result.migrated, false);
  assert.equal(context.appState.schemaVersion, 2);
  assert.equal(context.appState.speakers.length, 2);
  assert.match(context.appState.projectLoadWarning, /corrupt/i);
  assert.equal(localStorage.value(api.STORAGE_KEY), raw);

  const backup = JSON.parse(localStorage.value(api.CORRUPT_PROJECT_BACKUP_KEY));
  assert.equal(backup.raw, raw);
  assert.equal(backup.capturedAt, '2026-07-27T03:00:00.000Z');
  assert.match(backup.details, /JSON|Unexpected|unterminated/i);
});
