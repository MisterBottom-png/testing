import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('modular source preserves the three workflow stages', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  for (const id of ['createStage', 'scriptStage', 'audioStage']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('index loads one ES-module entry and main coordinates modules in dependency order', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  const main = await readFile(path.join(root, 'src', 'js', 'main.js'), 'utf8');
  assert.match(html, /<script type="module" src="\.\/js\/main\.js"><\/script>/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);

  const expected = [
    'constants.js', 'state.js', 'text-utils.js', 'preferences.js', 'pcm-audio.js', 'wav-encoder.js',
    'diagnostics.js', 'gemini-errors.js', 'ui-connection.js', 'ui-create.js', 'ui-script.js',
    'script-validation.js', 'gemini-api.js', 'tts-chunking.js', 'tts-generation.js', 'ui-audio.js',
    'ui-status.js', 'script-generation.js', 'ui-events.js', 'indexeddb.js', 'media-cache.js',
    'voice-preview.js', 'conversation-preview.js', 'final-review.js'
  ];
  let previous = -1;
  for (const file of expected) {
    const current = main.indexOf(`./${file}`);
    assert.ok(current > previous, `${file} is missing or out of order`);
    previous = current;
  }
});
