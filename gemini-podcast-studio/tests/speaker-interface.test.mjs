import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const constants = await readFile(path.join(root, 'src', 'js', 'constants.js'), 'utf8');
const textUtils = await readFile(path.join(root, 'src', 'js', 'text-utils.js'), 'utf8');
const uiCreate = await readFile(path.join(root, 'src', 'js', 'ui-create.js'), 'utf8');
const uiEvents = await readFile(path.join(root, 'src', 'js', 'ui-events.js'), 'utf8');

const context = {
  appState: {
    speakers: [],
    podcast: { topic: '', durationMinutes: 3, language: 'English', customLanguage: '', format: 'conversation', customFormat: '', tones: [], instructions: '' },
    settings: { speakingRate: 140, theme: 'light', maxTtsCharacters: 12000 },
    connection: { apiKey: '', textModel: '', customTextModel: '', ttsModel: '', customTtsModel: '' },
    audio: { url: '' }
  },
  els: { speakerList: { innerHTML: '' } },
  console
};
vm.runInNewContext(`${constants}\n${textUtils}\n${uiCreate}\n;globalThis.__speakerUi = {
  createDefaultPodcastSpeakers,
  renderSpeakerCards,
  updateSpeakerField,
  getSpeakerVoiceTypes,
  getSpeakerVoiceChoices
};`, context);

const {
  createDefaultPodcastSpeakers,
  renderSpeakerCards,
  updateSpeakerField
} = context.__speakerUi;

function renderWith(speakers = createDefaultPodcastSpeakers()) {
  context.appState.speakers = JSON.parse(JSON.stringify(speakers));
  renderSpeakerCards();
  return context.els.speakerList.innerHTML;
}

test('renders two distinguishable speaker configuration cards with all required controls', () => {
  const html = renderWith();
  assert.equal((html.match(/class="speaker-card speaker-config-card expanded"/g) || []).length, 2);
  for (const index of [0, 1]) {
    assert.match(html, new RegExp(`aria-labelledby="speakerCardTitle${index}"`));
    assert.match(html, new RegExp(`<h3 id="speakerCardTitle${index}">Host ${index + 1}<\\/h3>`));
    assert.match(html, new RegExp(`<label for="speakerName${index}">Speaker name<\\/label>`));
    assert.match(html, new RegExp(`id="speakerGenderMale${index}" type="radio"`));
    assert.match(html, new RegExp(`id="speakerGenderFemale${index}" type="radio"`));
    assert.match(html, new RegExp(`<label for="speakerVoiceType${index}">Voice type<\\/label>`));
    assert.match(html, new RegExp(`<label for="speakerVoice${index}">Gemini voice<\\/label>`));
    assert.match(html, new RegExp(`id="speakerPreview${index}"[^>]*>Preview voice<\\/button>`));
    assert.match(html, new RegExp(`<label for="speakerPersonality${index}">Personality<\\/label>`));
    assert.match(html, new RegExp(`<label for="speakerDelivery${index}">Delivery instructions<\\/label>`));
  }
});

test('speaker names are editable and update only the intended speaker record', () => {
  const speakers = createDefaultPodcastSpeakers();
  const host2Before = JSON.parse(JSON.stringify(speakers[1]));
  updateSpeakerField(speakers[0], 'speakerName', 'James');
  assert.equal(speakers[0].speakerName, 'James');
  assert.equal(JSON.stringify(speakers[1]), JSON.stringify(host2Before));
  const html = renderWith(speakers);
  assert.match(html, /id="speakerName0" type="text"[^>]*value="James"[^>]*maxlength="40"/);
});

test('voice dropdown retains exact Gemini API values and displays descriptions', () => {
  const speakers = createDefaultPodcastSpeakers();
  speakers[0].gender = 'male';
  speakers[0].voiceType = 'clear';
  const html = renderWith(speakers);
  assert.match(html, /<option value="Iapetus">Iapetus · Clear male voice<\/option>/);
});

test('changing a voice leaves speaker identity and behavioural instructions unchanged', () => {
  const speaker = {
    ...createDefaultPodcastSpeakers()[0],
    speakerName: 'James',
    gender: 'male',
    voiceType: 'clear',
    personality: 'Calm, curious and analytical',
    deliveryInstructions: 'Natural pace, conversational'
  };
  updateSpeakerField(speaker, 'geminiVoiceName', 'Iapetus');
  assert.equal(speaker.geminiVoiceName, 'Iapetus');
  assert.equal(speaker.speakerName, 'James');
  assert.equal(speaker.personality, 'Calm, curious and analytical');
  assert.equal(speaker.deliveryInstructions, 'Natural pace, conversational');
});

test('changing gender preserves personality and delivery instructions', () => {
  const speaker = {
    ...createDefaultPodcastSpeakers()[0],
    personality: 'Analytical',
    deliveryInstructions: 'Moderate pace'
  };
  updateSpeakerField(speaker, 'gender', 'female');
  assert.equal(speaker.gender, 'female');
  assert.equal(speaker.personality, 'Analytical');
  assert.equal(speaker.deliveryInstructions, 'Moderate pace');
  assert.equal(speaker.speakerName, 'Host 1');
});

test('dependent controls expose clear disabled states and preview is disabled without a selected voice', () => {
  const html = renderWith();
  assert.match(html, /id="speakerVoiceType0"[^>]* disabled/);
  assert.match(html, /id="speakerVoice0"[^>]* disabled/);
  assert.match(html, /id="speakerPreview0"[^>]* disabled>Preview voice<\/button>/);
  assert.match(html, />Select gender first<\/option>/);
});

test('native labelled controls provide keyboard navigation semantics', () => {
  const html = renderWith();
  assert.match(html, /<fieldset[^>]*class="field full speaker-gender-field"[^>]*>/);
  assert.match(html, /<legend>Gender<\/legend>/);
  assert.equal((html.match(/type="radio"/g) || []).length, 4);
  assert.doesNotMatch(html, /tabindex="-1"/);
  assert.match(html, /<select id="speakerVoiceType0"/);
  assert.match(html, /<select id="speakerVoice0"/);
  assert.match(html, /<textarea id="speakerPersonality0"/);
  assert.match(html, /<button id="speakerPreview0"/);
});

test('speaker input events use the shared updater and persist through the existing save queue', () => {
  assert.match(uiEvents, /updateSpeakerField\(speaker, field, event\.target\.value\)/);
  assert.match(uiEvents, /queueSave\(\)/);
  assert.match(uiEvents, /renderSpeakerCards\(\)/);
});
