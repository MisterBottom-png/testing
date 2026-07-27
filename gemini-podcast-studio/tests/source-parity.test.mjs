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

test('javascript starts from one explicit ES-module composition root', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  assert.match(html, /<script\s+type="module"\s+src="\.\/js\/main\.js"><\/script>/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
});
