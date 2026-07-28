import test from 'node:test';
import assert from 'node:assert/strict';
import { installTtsChunking } from '../src/js/tts-chunking.js';

function harness({ overhead = 200, target = 24000 } = {}) {
  const services = {
    DEFAULT_MAX_TTS_CHARACTERS: 24000,
    MIN_TTS_CHUNK_CHARACTERS: 4000,
    MAX_TTS_CHUNK_CHARACTERS: 30000,
    appState: { settings: { maxTtsCharacters: target }, script: null },
    deepClone: value => structuredClone(value),
    buildTtsTranscript: script => `${'G'.repeat(overhead)}${script.segments.map(segment => `${segment.speaker}:${segment.text}`).join('\n\n')}`
  };
  installTtsChunking(services);
  return services;
}

const segment = (speaker, length, extra = {}) => ({ speaker, text: 'x'.repeat(length), direction: '', ...extra });

test('counts repeated global and speaker-description prompt overhead in every request', () => {
  const services = harness({ overhead: 1000, target: 4000 });
  const script = { segments: [segment('A', 1600), segment('B', 1600)] };
  const chunks = services.createTtsChunks(script);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every(chunk => chunk.transcript.length <= 4000));
});

test('rejects an individual segment whose complete request cannot fit', () => {
  const services = harness({ overhead: 1000, target: 4000 });
  assert.throws(() => services.createTtsChunks({ segments: [segment('A', 3100)] }), /single script segment exceeds the 4,000 character/i);
});

test('chunking is deterministic', () => {
  const services = harness({ target: 4000 });
  const script = { segments: Array.from({ length: 7 }, (_, index) => segment(index % 2 ? 'B' : 'A', 900)) };
  assert.deepEqual(services.createTtsChunks(script), services.createTtsChunks(script));
});

test('prefers a natural speaker-turn boundary when request count is unchanged', () => {
  const services = harness({ target: 4000 });
  const script = { segments: [segment('A', 1000), segment('A', 1000), segment('B', 1000), segment('B', 1000)] };
  const chunks = services.createTtsChunks(script);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].script.segments.length, 2);
  assert.equal(chunks[0].script.segments.at(-1).speaker, 'A');
  assert.equal(chunks[1].script.segments[0].speaker, 'B');
});

test('uses the minimum achievable request count before boundary preferences', () => {
  const services = harness({ target: 4000 });
  const script = { segments: Array.from({ length: 7 }, (_, index) => segment(index % 2 ? 'B' : 'A', 900)) };
  const chunks = services.createTtsChunks(script);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map(chunk => chunk.script.segments.length), [4, 3]);
});

test('the tested default no longer splits solely at the old 12,000-character value', () => {
  const services = harness({ overhead: 500, target: 24000 });
  const chunk = services.createTtsChunks({ segments: [segment('A', 6000), segment('B', 7000)] });
  assert.equal(chunk.length, 1);
  assert.ok(chunk[0].transcript.length > 12000);
});
