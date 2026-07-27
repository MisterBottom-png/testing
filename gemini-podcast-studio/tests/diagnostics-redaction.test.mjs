import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createAppContext } from '../src/js/app-context.js';
import { installDiagnostics } from '../src/js/diagnostics.js';

const root = path.resolve(import.meta.dirname, '..');

function loadDiagnostics() {
  const entries = [];
  const originalConsole = globalThis.console;
  globalThis.console = {
    error: (...args) => entries.push(args),
    warn: (...args) => entries.push(args),
    info: (...args) => entries.push(args),
    log: (...args) => entries.push(args)
  };
  const context = createAppContext();
  context.expose('appState', { connection: { apiKey: 'baseline-secret-key' } });
  installDiagnostics(context);
  return { diagnostics: context, entries, restore: () => { globalThis.console = originalConsole; } };
}

test('diagnostic strings redact configured keys, headers and query parameters', () => {
  const { diagnostics, restore } = loadDiagnostics();
  try {
    const input = 'https://example.invalid/path?key=baseline-secret-key&x=1 x-goog-api-key: baseline-secret-key';
    const redacted = diagnostics.redactDiagnosticString(input);
    assert.doesNotMatch(redacted, /baseline-secret-key/);
    assert.match(redacted, /\[REDACTED\]/);
  } finally { restore(); }
});

test('diagnostic objects omit sensitive request fields and error secrets', () => {
  const { diagnostics, entries, restore } = loadDiagnostics();
  try {
    const error = new Error('Request failed for baseline-secret-key');
    error.status = 401;
    diagnostics.diagnosticLog('error', 'generation failed', {
      error,
      headers: { 'x-goog-api-key': 'baseline-secret-key' },
      prompt: 'private request text'
    });
    const output = JSON.stringify(entries);
    assert.doesNotMatch(output, /baseline-secret-key|private request text/);
    assert.match(output, /\[REDACTED\]/);
  } finally { restore(); }
});

test('Gemini source endpoints do not place API keys in query parameters', async () => {
  const directory = path.join(root, 'src', 'js');
  const files = (await readdir(directory)).filter(file => file.endsWith('.js'));
  const source = (await Promise.all(files.map(file => readFile(path.join(directory, file), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com[^`'"\n]*[?&](?:key|api[_-]?key|x-goog-api-key)=/i);
});
