import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createModuleContext } from './module-harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const uiSource = await readFile(path.join(root, 'src', 'js', 'ui-create.js'), 'utf8');
const apiSource = await readFile(path.join(root, 'src', 'js', 'script-generation.js'), 'utf8');
const eventsSource = await readFile(path.join(root, 'src', 'js', 'ui-events.js'), 'utf8');
const context = createModuleContext(['constants', 'text-utils', 'ui-create'], {
  appState: { speakers: [] },
  els: { speakerList: { innerHTML: '' } }
});

const {
  GEMINI_TTS_VOICES,
  getAvailableVoiceTypes,
  getMatchingVoices,
  getSpeakerVoiceTypes,
  getSpeakerVoiceChoices,
  updateSpeakerField,
  validateSpeakerRecords,
  getDuplicateVoiceSignature,
  approveDuplicateVoice,
  isDuplicateVoiceApproved,
  resetDuplicateVoiceApproval
} = context;

const toPlain = value => JSON.parse(JSON.stringify(value));
const validSpeaker = overrides => ({
  id: 'host-1',
  speakerName: 'James',
  gender: 'male',
  voiceType: 'clear',
  geminiVoiceName: 'Iapetus',
  personality: 'Calm and analytical',
  deliveryInstructions: 'Natural conversational pace',
  ...overrides
});

test('gender filtering returns only voices of the selected gender', () => {
  const maleVoices = getMatchingVoices({ gender: 'male' });
  const femaleVoices = getMatchingVoices({ gender: 'female' });
  assert.ok(maleVoices.length > 0);
  assert.ok(femaleVoices.length > 0);
  assert.ok(maleVoices.every(voice => voice.gender === 'male'));
  assert.ok(femaleVoices.every(voice => voice.gender === 'female'));
});

test('voice types are derived from the catalogue and voice type narrows matching voices', () => {
  const expectedMaleTypes = [...new Set(
    GEMINI_TTS_VOICES.filter(voice => voice.gender === 'male').map(voice => voice.type)
  )].sort();
  assert.deepEqual(toPlain(getAvailableVoiceTypes('male')), expectedMaleTypes);
  assert.deepEqual(toPlain(getSpeakerVoiceTypes(validSpeaker())), expectedMaleTypes);

  const matching = getSpeakerVoiceChoices(validSpeaker());
  assert.deepEqual(toPlain(matching.map(voice => voice.apiName)), ['Iapetus']);
  assert.ok(matching.every(voice => voice.gender === 'male' && voice.type === 'clear'));
});

test('changing gender clears incompatible type and voice without changing identity or delivery fields', () => {
  const speaker = validSpeaker({
    speakerName: 'Casey',
    gender: 'female',
    voiceType: 'warm',
    geminiVoiceName: 'Sulafat',
    personality: 'Warm but sceptical',
    deliveryInstructions: 'Measured pace'
  });
  updateSpeakerField(speaker, 'gender', 'male');
  assert.equal(speaker.gender, 'male');
  assert.equal(speaker.voiceType, '');
  assert.equal(speaker.geminiVoiceName, '');
  assert.equal(speaker.speakerName, 'Casey');
  assert.equal(speaker.personality, 'Warm but sceptical');
  assert.equal(speaker.deliveryInstructions, 'Measured pace');
});

test('changing gender preserves a compatible type but clears an incompatible voice', () => {
  const speaker = validSpeaker({ gender: 'female', voiceType: 'clear', geminiVoiceName: 'Erinome' });
  updateSpeakerField(speaker, 'gender', 'male');
  assert.equal(speaker.voiceType, 'clear');
  assert.equal(speaker.geminiVoiceName, '');
  assert.equal(speaker.speakerName, 'James');
});

test('changing voice type clears an incompatible selected voice without silently choosing another', () => {
  const speaker = validSpeaker();
  updateSpeakerField(speaker, 'voiceType', 'upbeat');
  assert.equal(speaker.voiceType, 'upbeat');
  assert.equal(speaker.geminiVoiceName, '');
  assert.equal(speaker.speakerName, 'James');
  assert.equal(speaker.personality, 'Calm and analytical');
  assert.equal(speaker.deliveryInstructions, 'Natural conversational pace');
});

test('speaker validation trims names, rejects empty names and rejects duplicates case-insensitively', () => {
  const whitespaceSpeakers = [validSpeaker({ speakerName: '   ' }), validSpeaker({ id: 'host-2', speakerName: 'Anna', geminiVoiceName: 'Iapetus' })];
  const whitespaceIssues = validateSpeakerRecords(whitespaceSpeakers);
  assert.ok(whitespaceIssues.some(issue => issue.index === 0 && issue.field === 'speakerName'));

  const duplicateSpeakers = [validSpeaker({ speakerName: '  James  ' }), validSpeaker({ id: 'host-2', speakerName: 'jAmEs' })];
  const duplicateIssues = validateSpeakerRecords(duplicateSpeakers);
  assert.equal(duplicateSpeakers[0].speakerName, 'James');
  assert.equal(duplicateSpeakers[1].speakerName, 'jAmEs');
  assert.equal(duplicateIssues.filter(issue => issue.field === 'speakerName').length, 2);
});

test('speaker validation rejects missing selections, unknown voices and metadata mismatches', () => {
  const incompleteIssues = validateSpeakerRecords([
    validSpeaker({ gender: '', voiceType: '', geminiVoiceName: '' }),
    validSpeaker({ id: 'host-2', speakerName: 'Anna' })
  ]);
  assert.ok(incompleteIssues.some(issue => issue.index === 0 && issue.field === 'gender'));
  assert.ok(incompleteIssues.some(issue => issue.index === 0 && issue.field === 'voiceType'));
  assert.ok(incompleteIssues.some(issue => issue.index === 0 && issue.field === 'geminiVoiceName'));

  const unknownIssues = validateSpeakerRecords([
    validSpeaker({ geminiVoiceName: 'RemovedVoice' }),
    validSpeaker({ id: 'host-2', speakerName: 'Anna' })
  ]);
  assert.ok(unknownIssues.some(issue => /not available in the Gemini voice catalogue/.test(issue.message)));

  const genderMismatch = validateSpeakerRecords([
    validSpeaker({ gender: 'female', geminiVoiceName: 'Iapetus' }),
    validSpeaker({ id: 'host-2', speakerName: 'Anna' })
  ]);
  assert.ok(genderMismatch.some(issue => /does not match the selected gender/.test(issue.message)));

  const typeMismatch = validateSpeakerRecords([
    validSpeaker({ voiceType: 'upbeat', geminiVoiceName: 'Iapetus' }),
    validSpeaker({ id: 'host-2', speakerName: 'Anna' })
  ]);
  assert.ok(typeMismatch.some(issue => /does not match the selected voice type/.test(issue.message)));
});

test('duplicate voices create a warning signature and Use anyway explicitly approves continuation', () => {
  const speakers = [validSpeaker(), validSpeaker({ id: 'host-2', speakerName: 'Anna' })];
  resetDuplicateVoiceApproval();
  assert.equal(getDuplicateVoiceSignature(speakers), 'Iapetus');
  assert.equal(isDuplicateVoiceApproved(speakers), false);
  assert.equal(approveDuplicateVoice(speakers), true);
  assert.equal(isDuplicateVoiceApproved(speakers), true);

  speakers[1].geminiVoiceName = 'Puck';
  assert.equal(getDuplicateVoiceSignature(speakers), '');
  assert.equal(isDuplicateVoiceApproved(speakers), false);
});

test('UI source contains no-match guidance and both duplicate-voice actions', () => {
  assert.match(uiSource, /No matching voices are available\. Choose another gender or voice type\./);
  assert.match(uiSource, /Both speakers currently use/);
  assert.match(uiSource, /The conversation may be difficult to follow\./);
  assert.match(uiSource, /data-duplicate-voice-action="use-anyway"/);
  assert.match(uiSource, /data-duplicate-voice-action="choose-another"/);
  assert.match(eventsSource, /document\.getElementById\('speakerVoice1'\)\?\.focus\(\)/);
  assert.match(apiSource, /ctx\.getDuplicateVoiceSignature\(\) && !ctx\.isDuplicateVoiceApproved\(\)/);
});
