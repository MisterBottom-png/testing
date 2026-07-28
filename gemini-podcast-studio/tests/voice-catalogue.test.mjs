import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServices, installServices } from './service-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'src', 'js', 'constants.js'), 'utf8');
const api = installServices(createServices(), ['constants']);
const {
  GEMINI_TTS_VOICES,
  GEMINI_TTS_VOICE_GENDERS,
  isValidGeminiTtsVoice,
  getGeminiTtsVoices,
  getAvailableVoiceTypes,
  getGeminiTtsVoice
} = api;

const toPlain = value => JSON.parse(JSON.stringify(value));

test('catalogue contains all 30 supported Gemini TTS voices with required metadata', () => {
  assert.equal(GEMINI_TTS_VOICES.length, 30);
  for (const voice of GEMINI_TTS_VOICES) {
    assert.equal(typeof voice.apiName, 'string');
    assert.ok(voice.apiName.trim());
    assert.ok(GEMINI_TTS_VOICE_GENDERS.includes(voice.gender));
    assert.equal(typeof voice.type, 'string');
    assert.ok(voice.type.trim());
    assert.equal(typeof voice.description, 'string');
    assert.ok(voice.description.trim());
    assert.equal(typeof voice.previewCacheKey, 'string');
    assert.ok(voice.previewCacheKey.trim());
    assert.equal(isValidGeminiTtsVoice(voice), true);
  }
});

test('API names and preview cache keys are unique', () => {
  const apiNames = GEMINI_TTS_VOICES.map(voice => voice.apiName);
  const previewCacheKeys = GEMINI_TTS_VOICES.map(voice => voice.previewCacheKey);
  assert.equal(new Set(apiNames).size, apiNames.length);
  assert.equal(new Set(previewCacheKeys).size, previewCacheKeys.length);
});

test('gender filtering returns only the requested documented voices', () => {
  const femaleVoices = getGeminiTtsVoices({ gender: 'female' });
  const maleVoices = getGeminiTtsVoices({ gender: 'male' });
  assert.equal(femaleVoices.length, 14);
  assert.equal(maleVoices.length, 16);
  assert.ok(femaleVoices.every(voice => voice.gender === 'female'));
  assert.ok(maleVoices.every(voice => voice.gender === 'male'));
  assert.equal(getGeminiTtsVoice('Erinome').gender, 'female');
  assert.equal(getGeminiTtsVoice('Iapetus').gender, 'male');
});

test('voice type filtering supports type-only and combined filters', () => {
  assert.deepEqual(
    toPlain(getGeminiTtsVoices({ type: 'clear' }).map(voice => voice.apiName).sort()),
    ['Erinome', 'Iapetus']
  );
  assert.deepEqual(
    toPlain(getGeminiTtsVoices({ gender: 'male', type: 'clear' }).map(voice => voice.apiName)),
    ['Iapetus']
  );
});

test('available voice types are derived from the catalogue and sorted', () => {
  const expectedMaleTypes = [...new Set(
    getGeminiTtsVoices({ gender: 'male' }).map(voice => voice.type)
  )].sort();
  assert.deepEqual(toPlain(getAvailableVoiceTypes('male')), toPlain(expectedMaleTypes));
  assert.ok(getAvailableVoiceTypes().includes('clear'));
  assert.ok(getAvailableVoiceTypes('female').includes('warm'));
});

test('invalid catalogue entries are ignored without crashing the application', () => {
  const validVoice = GEMINI_TTS_VOICES[0];
  const damagedCatalogue = [
    null,
    {},
    { apiName: 'Broken', gender: 'robot', type: '', description: '', previewCacheKey: '' },
    validVoice
  ];
  assert.doesNotThrow(() => getGeminiTtsVoices({}, damagedCatalogue));
  assert.deepEqual(toPlain(getGeminiTtsVoices({}, damagedCatalogue)), [toPlain(validVoice)]);
  assert.deepEqual(toPlain(getGeminiTtsVoices({}, null)), []);
  assert.equal(getGeminiTtsVoice('Missing', damagedCatalogue), null);
});

test('legacy duplicated VOICES catalogue has been removed', () => {
  assert.doesNotMatch(source, /\bconst\s+VOICES\b/);
});
