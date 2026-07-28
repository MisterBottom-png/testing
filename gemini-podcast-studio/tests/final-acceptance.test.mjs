import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const [html, finalReview, preferences, generationJobs, components, responsive, main, preview, conversation] = await Promise.all([
  read('src/index.html'), read('src/js/final-review.js'), read('src/js/preferences.js'), read('src/js/generation-jobs.js'),
  read('src/styles/components.css'), read('src/styles/responsive.css'), read('src/js/main.js'), read('src/js/voice-preview.js'),
  read('src/js/conversation-preview.js')
]);

test('final validation messages use the accepted human-readable wording', () => {
  for (const message of [
    'Enter a name for ${host}.', 'Each speaker must have a different name.', 'Choose a gender for ${host}.',
    'Choose a voice type for ${host}.', 'Choose a Gemini voice for ${host}.',
    'No matching voices are available. Choose another gender or voice type.',
    'The selected Gemini voice is unavailable. Choose another voice.',
    'The selected voice does not match the chosen gender or voice type. Choose another voice.'
  ]) assert.match(finalReview, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('speaker fields expose required state and validation focuses the first invalid control', () => {
  assert.match(finalReview, /name\.required = true/);
  assert.match(finalReview, /aria-required/);
  assert.match(finalReview, /radio\.required = true/);
  assert.match(finalReview, /select\.required = true/);
  assert.match(finalReview, /aria-errormessage/);
  assert.match(finalReview, /firstTarget.*focus/s);
  assert.match(finalReview, /document\.getElementById\(controlId\)\?\.focus/);
});

test('speaker and conversation warnings are keyboard-addressable alert dialogs', () => {
  assert.match(finalReview, /role', 'alertdialog'/);
  assert.match(finalReview, /aria-describedby/);
  assert.match(conversation, /Use anyway/);
  assert.match(conversation, /Choose another voice/);
  assert.match(conversation, /speakerVoice1.*focus/);
});

test('unknown script speakers use the accepted blocking message', () => {
  assert.match(finalReview, /The script contains a speaker who is not configured\./);
  assert.match(finalReview, /Update the script or speaker settings before generating audio\./);
});

test('corrupt saved projects are backed up rather than silently discarded', () => {
  assert.match(preferences, /CORRUPT_PROJECT_BACKUP_KEY/);
  assert.match(preferences, /preserveCorruptProject/);
  assert.match(preferences, /readStoredProjectSafely/);
  assert.match(preferences, /migrateStoredProjectSafely/);
  assert.match(preferences, /projectLoadWarning/);
});

test('TTS chunk failures identify the failed chunk and never publish partial audio', () => {
  assert.match(generationJobs, /TTS chunk \$\{chunk\.index \+ 1\} of \$\{chunks\.length\} failed/);
  assert.match(generationJobs, /No partial audio was saved/);
  const loopPosition = generationJobs.indexOf('for (const chunk of chunks)');
  const publishPosition = generationJobs.indexOf('services.appState.audio =', loopPosition);
  assert.ok(loopPosition >= 0 && publishPosition > loopPosition, 'audio is published only after the chunk loop');
});

test('audio invalidation preserves project data and clearly requires regeneration', () => {
  assert.match(finalReview, /Podcast audio is out of date and must be regenerated\./);
  assert.match(finalReview, /audioRegenerationRequired/);
  assert.doesNotMatch(finalReview, /services\.appState\.script\s*=\s*null/);
  assert.doesNotMatch(finalReview, /services\.appState\.speakers\s*=\s*services\.createDefaultPodcastSpeakers/);
});

test('individual and conversation previews retain deterministic isolated caching', () => {
  assert.match(preview, /VOICE_PREVIEW_GENERATION_VERSION/);
  assert.match(preview, /voicePreviewInFlightRequests/);
  assert.match(preview, /services\.removeVoicePreviewCache\(descriptor\.cacheKey/);
  assert.match(conversation, /CONVERSATION_PREVIEW_TEMPLATE_VERSION/);
  assert.match(conversation, /conversationPreviewTask/);
  assert.match(conversation, /services\.removeVoicePreviewCache\(descriptor\.cacheKey/);
  assert.doesNotMatch(conversation, /services\.clearVoicePreviewCache\(/);
});

test('responsive, zoom-friendly and reduced-motion protections remain present', () => {
  assert.match(responsive, /@media \(max-width: 700px\)/);
  assert.match(responsive, /@media \(max-width: 370px\)/);
  assert.match(responsive, /prefers-reduced-motion: reduce/);
  assert.match(components, /overflow-wrap: anywhere/);
  assert.match(components, /min-width: 0/);
});

test('native audio controls and preview live regions remain accessible', () => {
  assert.match(conversation, /audio[^>]+controls[^>]+aria-label="Two-speaker conversation preview"/);
  assert.match(conversation, /role="status" aria-live="polite"/);
  assert.match(preview, /aria-busy/);
  assert.match(preview, /aria-live/);
  assert.match(preview, /Voice preview for Host \$\{index \+ 1\} is ready and playing/);
});

test('final review decorators are installed after application initialisation', () => {
  const initialiseIndex = main.indexOf('services.initialiseApp()');
  const reviewIndex = main.indexOf('installFinalReview(services)');
  assert.ok(initialiseIndex >= 0 && reviewIndex > initialiseIndex);
  assert.match(html, /<script type="module" src="\.\/js\/main\.js"><\/script>/);
});

test('no automatic voice recommendations or permanent aliases were introduced', () => {
  const combined = `${finalReview}\n${conversation}\n${preview}`;
  assert.doesNotMatch(combined, /recommended voice pair/i);
  assert.doesNotMatch(combined, /automatic voice recommendation/i);
  assert.doesNotMatch(combined, /humanAlias|human alias/i);
});
