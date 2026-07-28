import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, installServices } from './service-harness.mjs';

function createHarness() {
  const services = installServices(createServices(), ['constants', 'textUtilities']);
  services.appState = {
    connection: {
      apiKey: 'test-key',
      textModel: services.DEFAULT_TEXT_MODEL,
      customTextModel: '',
      ttsModel: services.DEFAULT_TTS_MODEL,
      customTtsModel: ''
    },
    podcast: {
      topic: 'JSON Schema transport regression',
      durationMinutes: 3,
      language: 'English',
      customLanguage: '',
      format: 'Friendly conversation',
      customFormat: '',
      tones: ['Informative'],
      instructions: ''
    },
    speakers: [
      { id: 'host-1', speakerName: 'James', personality: '', geminiVoiceName: 'Iapetus' },
      { id: 'host-2', speakerName: 'Anna', personality: '', geminiVoiceName: 'Sulafat' }
    ],
    settings: {
      speakingRate: services.DEFAULT_SPEAKING_RATE,
      maxTtsCharacters: services.DEFAULT_MAX_TTS_CHARACTERS
    }
  };
  installServices(services, ['appHelpers', 'scriptValidation', 'geminiTransport']);
  return services;
}

test('sends strict JSON Schema through responseJsonSchema rather than responseSchema', () => {
  const services = createHarness();
  const schema = services.buildScriptSchema();
  const config = services.buildScriptGenerationConfig({ schema });

  assert.equal(config.responseMimeType, 'application/json');
  assert.equal('responseSchema' in config, false);
  assert.deepEqual(config.responseJsonSchema, schema);
  assert.equal(config.responseJsonSchema.additionalProperties, false);
  assert.equal(config.responseJsonSchema.properties.segments.items.additionalProperties, false);
});
