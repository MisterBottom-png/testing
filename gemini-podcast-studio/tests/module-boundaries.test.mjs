import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const readSource = file => readFile(path.join(root, 'src', 'js', file), 'utf8');

test('the browser starts from one ES-module entry without ordered classic scripts', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /<script type="module" src="\.\/js\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script\s+defer/);
});

test('main remains a thin installer coordinator', async () => {
  const source = await readSource('main.js');
  assert.match(source, /createAppContext/);
  assert.match(source, /installConstants\(app\)/);
  assert.match(source, /installFinalReview\(app\)/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|document\.|innerHTML/);
});

test('low-level audio, API and storage modules do not read the DOM', async () => {
  for (const file of [
    'pcm-audio.js', 'wav-encoder.js', 'tts-chunking.js',
    'gemini-api.js', 'indexeddb.js', 'media-cache.js', 'preferences.js'
  ]) {
    const source = await readSource(file);
    assert.doesNotMatch(source, /\bdocument\b|ctx\.els\b|querySelector|getElementById/, `${file} must stay DOM-independent`);
  }
});

test('API transport does not render UI or coordinate retry behaviour', async () => {
  const source = await readSource('gemini-api.js');
  assert.doesNotMatch(source, /showServiceError|handleGenerationError|render[A-Z]|setBusy|retry/i);
  assert.match(source, /fetch\(endpoint/);
});

test('application symbols are carried by the explicit context rather than browser globals', async () => {
  const files = [
    'constants.js', 'state.js', 'text-utils.js', 'preferences.js', 'gemini-api.js',
    'script-generation.js', 'script-validation.js', 'tts-generation.js', 'ui-events.js'
  ];
  for (const file of files) {
    const source = await readSource(file);
    assert.match(source, /^export function install[A-Za-z]+\(ctx\)/);
    assert.doesNotMatch(source, /globalThis\.[A-Za-z_$][\w$]*\s*=|window\.[A-Za-z_$][\w$]*\s*=/);
  }
});
