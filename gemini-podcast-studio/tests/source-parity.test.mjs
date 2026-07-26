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

test('javascript is loaded in dependency order', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  const expected = [
    'constants.js', 'state.js', 'text-utils.js', 'preferences.js',
    'ui-create.js', 'ui-script.js', 'gemini-api.js', 'audio.js',
    'ui-status.js', 'ui-events.js', 'voice-preview.js', 'main.js'
  ];
  let previous = -1;
  for (const file of expected) {
    const current = html.indexOf(`./js/${file}`);
    assert.ok(current > previous, `${file} is missing or out of order`);
    previous = current;
  }
});
