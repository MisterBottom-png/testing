import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createServices, installServices } from './service-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');

function loadDiagnostics() {
  const entries = [];
  const logger = {
    error: (...args) => entries.push(args),
    warn: (...args) => entries.push(args),
    info: (...args) => entries.push(args),
    log: (...args) => entries.push(args)
  };
  Object.defineProperty(globalThis, 'console', { configurable: true, writable: true, value: logger });
  const services = createServices({ appState: { connection: { apiKey: 'baseline-secret-key' } } });
  installServices(services, ['statusUi']);
  return { diagnostics: services, entries };
}

test('diagnostic strings redact configured keys, headers and query parameters', () => {
  const { diagnostics } = loadDiagnostics();
  const input = 'https://example.invalid/path?key=baseline-secret-key&x=1 x-goog-api-key: baseline-secret-key';
  const redacted = diagnostics.redactDiagnosticString(input);
  assert.doesNotMatch(redacted, /baseline-secret-key/);
  assert.match(redacted, /\[REDACTED\]/);
});

test('diagnostic objects omit sensitive request fields and error secrets', () => {
  const { diagnostics, entries } = loadDiagnostics();
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
});

test('Gemini source endpoints do not place API keys in query parameters', async () => {
  const directory = path.join(root, 'src', 'js');
  const files = (await readdir(directory)).filter(file => file.endsWith('.js'));
  const source = (await Promise.all(files.map(file => readFile(path.join(directory, file), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com[^`'"\n]*[?&](?:key|api[_-]?key|x-goog-api-key)=/i);
});
