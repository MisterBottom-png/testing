import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const constantsSource = await readFile(path.join(root, 'src', 'js', 'constants.js'), 'utf8');
const preferencesSource = await readFile(path.join(root, 'src', 'js', 'preferences.js'), 'utf8');

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
  const context = vm.createContext({
    console,
    localStorage,
    sessionStorage,
    matchMedia: () => ({ matches: false }),
    deepClone: value => value == null ? value : JSON.parse(JSON.stringify(value)),
    normaliseWhitespace: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    escapeHtml: value => String(value ?? '')
  });
  vm.runInContext(constantsSource, context);
  vm.runInContext(`globalThis.appState = {
    schemaVersion: PODCAST_PROJECT_SCHEMA_VERSION,
    connection: { apiKey: '', rememberKey: false, textModel: 'gemini-3.6-flash', customTextModel: '', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' },
    podcast: { topic: '', durationMinutes: 5, language: 'English', customLanguage: '', format: 'Friendly conversation', customFormat: '', tones: ['Informative', 'Casual'], instructions: '' },
    speakers: createDefaultPodcastSpeakers(),
    script: null,
    originalScript: null,
    legacyScript: null,
    audioCacheReferences: {},
    lastModified: '',
    settings: { theme: 'light', maxTtsCharacters: DEFAULT_MAX_TTS_CHARACTERS, speakingRate: 140 }
  };`, context);
  vm.runInContext(preferencesSource, context);
  vm.runInContext(`globalThis.recoveryApi = { loadPreferences, STORAGE_KEY, CORRUPT_PROJECT_BACKUP_KEY };`, context);
  return { context, localStorage, api: context.recoveryApi };
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
