import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, installServices } from './service-harness.mjs';

function createParser() {
  const services = createServices();
  installServices(services, ['geminiTransport', 'pcmAudio']);
  return services.parseGeminiAudioResponse;
}
function response({ finishReason = 'STOP', mimeType = 'audio/pcm;rate=24000;channels=1', data = 'AAA=' } = {}) {
  return { candidates: [{ finishReason, content: { parts: [{ inlineData: { mimeType, data } }] } }] };
}
test('shared Gemini audio parser returns validated PCM metadata and bytes', () => {
  const parsed = createParser()(response());
  assert.deepEqual([...parsed.pcmBytes], [0, 0]);
  assert.equal(parsed.sampleRate, 24000);
  assert.equal(parsed.channels, 1);
});
test('shared Gemini audio parser inspects every candidate finish reason', () => {
  const data = response();
  data.candidates.push({ finishReason: 'MAX_TOKENS', content: { parts: [] } });
  assert.throws(() => createParser()(data), { code: 'GEMINI_TOKEN_TRUNCATION' });
  assert.throws(() => createParser()(response({ finishReason: 'SAFETY' })), { code: 'GEMINI_SAFETY_REJECTION' });
  assert.throws(() => createParser()(response({ finishReason: 'OTHER' })), { code: 'GEMINI_FINISH_REASON' });
});
test('shared Gemini audio parser rejects missing and unsupported MIME types', () => {
  const missingMime = response();
  delete missingMime.candidates[0].content.parts[0].inlineData.mimeType;
  assert.throws(() => createParser()(missingMime), { code: 'GEMINI_AUDIO_MISSING_MIME_TYPE' });
  assert.throws(() => createParser()(response({ mimeType: 'audio/mpeg;rate=24000;channels=1' })), { code: 'GEMINI_AUDIO_UNSUPPORTED_MEDIA_TYPE' });
});
test('shared Gemini audio parser rejects empty base64', () => {
  assert.throws(() => createParser()(response({ data: '' })), { code: 'GEMINI_AUDIO_INVALID_DATA' });
});
test('shared Gemini audio parser rejects malformed, missing, and contradictory PCM metadata', () => {
  const parse = createParser();
  for (const mimeType of ['audio/pcm;rate=fast;channels=1', 'audio/pcm;channels=1', 'audio/pcm;rate=24000', 'audio/pcm;rate=24000;channels=2', 'audio/pcm;rate=24000;rate=16000;channels=1']) {
    assert.throws(() => parse(response({ mimeType })), { code: 'GEMINI_AUDIO_INVALID_METADATA' });
  }
});
