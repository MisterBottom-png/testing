import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const jsRoot = path.join(root, 'src', 'js');

async function source(file) {
  return readFile(path.join(jsRoot, file), 'utf8');
}

function staticImports(text) {
  return [...text.matchAll(/\bimport\s+(?:[^'";]+?\s+from\s+)?['"]\.\/([^'"]+)['"]/g)].map(match => match[1]);
}

test('development HTML uses one ES-module entry point instead of ordered classic scripts', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /<script\s+type="module"\s+src="\.\/js\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script\s+defer/);
});

test('focused extraction modules exist and expose explicit module syntax', async () => {
  const expected = [
    'runtime.js', 'constants.js', 'state.js', 'text-utils.js', 'preferences.js',
    'gemini-api.js', 'script-validation.js', 'script-generation.js',
    'pcm-audio.js', 'wav-encoder.js', 'tts-chunking.js', 'tts-generation.js',
    'indexeddb.js', 'media-cache.js', 'ui-create.js', 'ui-script.js',
    'ui-audio.js', 'ui-status.js', 'ui-events.js', 'voice-preview.js',
    'conversation-preview.js', 'final-review.js', 'bug-repairs.js', 'main.js'
  ];
  const files = new Set(await readdir(jsRoot));
  for (const file of expected) {
    assert.ok(files.has(file), `${file} is missing`);
    assert.match(await source(file), /\b(?:export|import)\b/, `${file} is not an ES module`);
  }
});

test('main is a thin composition root', async () => {
  const main = await source('main.js');
  assert.ok(main.split('\n').length <= 120, 'main.js contains feature implementation instead of composition');
  for (const file of ['runtime.js', 'constants.js', 'state.js', 'preferences.js', 'script-generation.js', 'tts-generation.js', 'bug-repairs.js', 'ui-events.js', 'conversation-preview.js']) {
    assert.match(main, new RegExp(`from ['"]\\./${file.replace('.', '\\.')}['"]`));
  }
  assert.doesNotMatch(main, /function\s+(?:buildConversationPreview|generatePodcastAudio|generatePodcastScript|renderSpeakerCards)\b/);
});

test('low-level transport, storage and audio modules do not depend on the DOM or UI rendering', async () => {
  const lowLevel = [
    'gemini-api.js', 'script-validation.js', 'pcm-audio.js', 'wav-encoder.js',
    'tts-chunking.js', 'indexeddb.js', 'media-cache.js'
  ];
  for (const file of lowLevel) {
    const text = await source(file);
    assert.doesNotMatch(text, /\b(?:document|window|HTMLElement|querySelector|getElementById|showServiceError|render[A-Z]|els\.)\b/, `${file} reaches into UI or DOM state`);
  }
});

test('the static ES-module import graph is acyclic', async () => {
  const files = (await readdir(jsRoot)).filter(file => file.endsWith('.js'));
  const graph = new Map();
  for (const file of files) graph.set(file, staticImports(await source(file)).filter(dep => files.includes(dep)));

  const visiting = new Set();
  const visited = new Set();
  function visit(file, stack = []) {
    if (visiting.has(file)) assert.fail(`circular import: ${[...stack, file].join(' -> ')}`);
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) || []) visit(dependency, [...stack, file]);
    visiting.delete(file);
    visited.add(file);
  }
  for (const file of files) visit(file);
});

test('package scripts preserve Vite development and produce the verified standalone distribution', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.dev, 'vite --host 0.0.0.0');
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(packageJson.scripts.build, 'node scripts/build-single-file.mjs');
  assert.equal(packageJson.scripts.preview, 'node scripts/serve-dist.mjs');
  assert.equal(packageJson.scripts['verify:single'], 'node scripts/verify-single-file.mjs');
  assert.equal(packageJson.scripts['test:runtime'], 'node scripts/runtime-smoke-repaired.mjs');
  assert.equal(packageJson.scripts.check, 'npm test && npm run build && npm run verify:single && npm run test:runtime');
});
