import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, installServices, withGlobals } from './service-harness.mjs';

function createHarness() {
  const services = installServices(createServices({
    createApiError(status, message, details = '') {
      const error = new Error(message);
      error.status = status;
      error.details = details;
      return error;
    }
  }), ['constants', 'textUtilities']);
  services.appState = {
    connection: {
      apiKey: 'test-key',
      textModel: services.DEFAULT_TEXT_MODEL,
      customTextModel: '',
      ttsModel: services.DEFAULT_TTS_MODEL,
      customTtsModel: ''
    },
    podcast: {
      topic: 'Testing constrained scripts',
      durationMinutes: 3,
      language: 'English',
      customLanguage: '',
      format: 'Friendly conversation',
      customFormat: '',
      tones: ['Informative'],
      instructions: ''
    },
    speakers: [
      { id: 'host-1', speakerName: 'James', personality: 'Analytical', geminiVoiceName: 'Iapetus' },
      { id: 'host-2', speakerName: 'Anna', personality: 'Curious', geminiVoiceName: 'Sulafat' }
    ],
    script: null,
    originalScript: null,
    legacyScript: null,
    history: [],
    historyIndex: -1,
    audio: { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null },
    audioCacheReferences: {},
    settings: { speakingRate: 140, maxTtsCharacters: services.DEFAULT_MAX_TTS_CHARACTERS }
  };
  installServices(services, ['appHelpers', 'scriptValidation', 'geminiTransport']);
  return services;
}

const rawScript = (segments = [
  { speaker: 'James', direction: '', text: 'Welcome to the episode.' },
  { speaker: 'Anna', direction: 'Warmly', text: 'Let us begin the discussion.' }
]) => ({ title: 'Test episode', summary: 'A constrained test script.', segments });

function responseWith(candidate) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: candidate ? [candidate] : [] }) };
}

test('counts English, Estonian and Russian words with locale-aware segmentation', () => {
  const services = createHarness();
  assert.equal(services.countWords('Hello, world! This is a test.', 'en'), 6);
  assert.equal(services.countWords('Tere, maailm! See on test.', 'et'), 5);
  assert.equal(services.countWords('Привет, мир! Это простой тест.', 'ru'), 5);
  assert.equal(services.normaliseLanguageLocale('Estonian'), 'et');
  assert.equal(services.normaliseLanguageLocale('ru-RU'), 'ru-RU');
});

test('calculates target words and clamps dynamic script output tokens', () => {
  const services = createHarness();
  assert.equal(services.calculateTargetWords(3, 140), 420);
  assert.equal(services.getTargetWords(), 420);
  assert.equal(services.calculateScriptOutputTokenLimit(420), 2048);
  assert.equal(services.calculateScriptOutputTokenLimit(1000), 2500);
  assert.equal(services.calculateScriptOutputTokenLimit(5000), 8192);
});

test('calculates dynamic segment limits between 16 and 100', () => {
  const services = createHarness();
  assert.equal(services.calculateMaxScriptSegments(0.5), 16);
  assert.equal(services.calculateMaxScriptSegments(3), 30);
  assert.equal(services.calculateMaxScriptSegments(7), 70);
  assert.equal(services.calculateMaxScriptSegments(12), 100);
});

test('normalises distinct speaker names and uses them in a strict dynamic schema', () => {
  const services = createHarness();
  services.appState.speakers[0].speakerName = '  James   Smith  ';
  services.appState.speakers[1].speakerName = ' Anna ';
  assert.deepEqual(services.getScriptSpeakerNames(), ['James Smith', 'Anna']);
  const schema = services.buildScriptSchema();
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['title', 'summary', 'segments']);
  assert.deepEqual(Object.keys(schema.properties), ['title', 'summary', 'segments']);
  assert.equal(schema.properties.segments.maxItems, 30);
  assert.equal(schema.properties.segments.items.additionalProperties, false);
  assert.deepEqual(schema.properties.segments.items.properties.speaker.enum, ['James Smith', 'Anna']);
  services.appState.speakers[1].speakerName = ' james smith ';
  assert.throws(() => services.buildScriptSchema(), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /different/i.test(error.message));
});

test('every script request sets token and thinking limits without sampling controls', async () => {
  const services = createHarness();
  const bodies = [];
  await withGlobals({
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return responseWith({ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(rawScript()) }] } });
    }
  }, async () => {
    await services.generateStructuredScript({ prompt: 'test', schema: services.buildScriptSchema(), actionLabel: 'testing' });
    services.appState.connection.textModel = services.QUALITY_TEXT_MODEL;
    await services.generateStructuredScript({ prompt: 'test', schema: services.buildScriptSchema(), actionLabel: 'testing' });
  });
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    const config = body.generationConfig;
    assert.equal(config.maxOutputTokens, 2048);
    assert.equal('temperature' in config, false);
    assert.equal('topP' in config, false);
    assert.equal('topK' in config, false);
  }
  assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(bodies[1].generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('rejects empty dialogue, unknown speakers, missing fields and unexpected fields locally', () => {
  const services = createHarness();
  assert.throws(() => services.validateScript(rawScript([
    { speaker: 'James', direction: '', text: '' },
    { speaker: 'Anna', direction: '', text: 'Valid.' }
  ])), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /no spoken text/i.test(error.message));
  assert.throws(() => services.validateScript(rawScript([
    { speaker: 'Unknown', direction: '', text: 'Hello.' },
    { speaker: 'Anna', direction: '', text: 'Valid.' }
  ])), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /unconfigured speaker/i.test(error.message));
  assert.throws(() => services.validateScript({ title: 'Missing', segments: [] }), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /summary/i.test(error.message));
  assert.throws(() => services.validateScript({ ...rawScript(), language: 'English' }), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /unexpected root field/i.test(error.message));
  assert.throws(() => services.validateScript(rawScript([
    { speaker: 'James', direction: '', text: 'Hello.', mood: 'happy' },
    { speaker: 'Anna', direction: '', text: 'Valid.' }
  ])), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /unexpected field/i.test(error.message));
});

test('rejects segment counts above the duration-specific maximum', () => {
  const services = createHarness();
  services.appState.podcast.durationMinutes = 1;
  const segments = Array.from({ length: 17 }, (_, index) => ({
    speaker: index % 2 ? 'Anna' : 'James', direction: '', text: `Line ${index + 1}.`
  }));
  assert.throws(() => services.validateScript(rawScript(segments)), error => error.code === 'SCRIPT_VALIDATION_FAILED' && /maximum.*16/i.test(error.message));
});

test('preserves editable output and adds over-length, short-script and direction warnings', () => {
  const services = createHarness();
  const words = count => Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
  const longSegments = Array.from({ length: 6 }, (_, index) => ({
    speaker: index % 2 ? 'Anna' : 'James',
    direction: index === 0 ? words(13) : '',
    text: index === 0 ? words(91) : words(84)
  }));
  const validatedLong = services.validateScript(rawScript(longSegments));
  assert.equal(validatedLong.segments[0].text, words(91));
  assert.equal(validatedLong.segments[0].direction, words(13));
  assert.ok(validatedLong.validationWarnings.some(warning => warning.code === 'SCRIPT_OVER_TARGET'));
  assert.ok(validatedLong.validationWarnings.some(warning => warning.code === 'SEGMENT_OVER_WORD_LIMIT'));
  assert.ok(validatedLong.validationWarnings.some(warning => warning.code === 'DIRECTION_UNUSUALLY_LONG'));
  const validatedShort = services.validateScript(rawScript());
  assert.ok(validatedShort.validationWarnings.some(warning => warning.code === 'SCRIPT_UNDER_TARGET'));
});

test('classifies token truncation before attempting to parse candidate JSON', async () => {
  const services = createHarness();
  await withGlobals({
    fetch: async () => responseWith({ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{not complete' }] } })
  }, async () => {
    await assert.rejects(
      services.generateStructuredScript({ prompt: 'test', schema: services.buildScriptSchema(), actionLabel: 'testing' }),
      error => error.code === 'GEMINI_TOKEN_TRUNCATION' && !/malformed/i.test(error.message)
    );
  });
});

test('distinguishes safety, missing, empty and malformed candidates', async () => {
  const services = createHarness();
  const cases = [
    [{ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }, 'GEMINI_SAFETY_REJECTION'],
    [{ candidates: [] }, 'GEMINI_MISSING_CANDIDATE'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] }, 'GEMINI_EMPTY_CANDIDATE'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{bad json' }] } }] }, 'GEMINI_MALFORMED_JSON']
  ];
  for (const [payload, code] of cases) {
    await withGlobals({ fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) }) }, async () => {
      await assert.rejects(
        services.generateStructuredScript({ prompt: 'test', schema: services.buildScriptSchema(), actionLabel: 'testing' }),
        error => error.code === code
      );
    });
  }
});

test('distinguishes valid JSON that fails local validation', async () => {
  const services = createHarness();
  const invalid = rawScript([
    { speaker: 'James', direction: '', text: '' },
    { speaker: 'Anna', direction: '', text: 'Valid.' }
  ]);
  await withGlobals({
    fetch: async () => responseWith({ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(invalid) }] } })
  }, async () => {
    await assert.rejects(
      services.generateStructuredScript({
        prompt: 'test',
        schema: services.buildScriptSchema(),
        actionLabel: 'testing',
        validate: services.validateScript
      }),
      error => error.code === 'SCRIPT_VALIDATION_FAILED'
    );
  });
});

test('generation failure preserves the existing editable script and does not automatically retry', async () => {
  const services = createHarness();
  installServices(services, ['scriptGeneration']);
  const existing = services.validateScript(rawScript());
  services.appState.script = existing;
  services.appState.audio = { ...services.appState.audio, url: 'blob:existing' };
  services.appState.audioCacheReferences = { keep: true };
  let requests = 0;
  let revoked = 0;
  services.syncCreateInputs = () => {};
  services.validatePodcastBrief = () => [];
  services.clearValidation = () => {};
  services.getDuplicateVoiceSignature = () => '';
  services.isDuplicateVoiceApproved = () => true;
  services.hideServiceError = () => {};
  services.setBusy = () => {};
  services.generateStructuredScript = async () => {
    requests += 1;
    const error = new Error('Token limit reached');
    error.code = 'GEMINI_TOKEN_TRUNCATION';
    throw error;
  };
  services.revokeAudioUrl = () => { revoked += 1; };
  services.handleGenerationError = () => {};
  services.queueSave = () => {};
  services.setStage = () => {};
  await services.generatePodcastScript();
  assert.equal(requests, 1);
  assert.equal(revoked, 0);
  assert.deepEqual(services.appState.script, existing);
  assert.deepEqual(services.appState.audioCacheReferences, { keep: true });
});
