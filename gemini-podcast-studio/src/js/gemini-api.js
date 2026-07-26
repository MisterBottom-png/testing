function buildScriptCharacters(speakers = appState.speakers) {
  return (Array.isArray(speakers) ? speakers : []).map(speaker => ({
    name: normaliseWhitespace(speaker.speakerName),
    personality: normaliseWhitespace(speaker.personality),
    role: normaliseWhitespace(speaker.id)
  }));
}

function buildScriptSchema() {
  const scriptCharacters = buildScriptCharacters();
  return {
    type: 'object',
    properties: {
      title: { type: 'string' }, summary: { type: 'string' }, language: { type: 'string' }, estimatedWords: { type: 'integer' },
      segments: { type: 'array', items: { type: 'object', properties: {
        speaker: { type: 'string', enum: scriptCharacters.map(character => character.name) },
        direction: { type: 'string' }, text: { type: 'string' }
      }, required: ['speaker', 'direction', 'text'] } }
    }, required: ['title', 'summary', 'language', 'estimatedWords', 'segments']
  };
}

function buildScriptPrompt() {
  const [a, b] = buildScriptCharacters();
  return `Create a polished two-person podcast script.\n\nTOPIC\n${appState.podcast.topic.trim()}\n\nEPISODE SETTINGS\nLanguage: ${getLanguage()}\nTarget length: approximately ${getTargetWords()} spoken words, staying within plus or minus 10 percent\nFormat: ${getPodcastFormat()}\nTone: ${appState.podcast.tones.join(', ') || 'Natural'}\nAdditional instructions: ${appState.podcast.instructions.trim() || 'None'}\n\nSPEAKER 1\nName: ${a.name}\nRole: ${a.role || 'host-1'}\nPersonality: ${a.personality || 'Natural and engaging'}\n\nSPEAKER 2\nName: ${b.name}\nRole: ${b.role || 'host-2'}\nPersonality: ${b.personality || 'Natural and engaging'}\n\nRULES\n- Use exactly the configured human names: ${a.name} and ${b.name}.\n- Never use Gemini voice identifiers as character names.\n- Alternate naturally and avoid long monologues.\n- Keep each segment short and speakable.\n- Spoken text must not contain markdown, URLs, citations, sound-effect labels, or stage directions.\n- Use the direction field only for sparse, subtle English performance cues without brackets.\n- Include an opening hook, substantive discussion, contrasting viewpoints, a useful conclusion, and a natural closing line.\n- Output only JSON matching the supplied schema.`;
}

function validateScriptSpeakers(script, speakers = appState.speakers) {
  if (!Array.isArray(script?.segments)) return [];
  const configuredNames = new Set((Array.isArray(speakers) ? speakers : []).map(speaker => normaliseWhitespace(speaker.speakerName)));
  const issues = [];
  script.segments.forEach((segment, index) => {
    const visibleName = normaliseWhitespace(segment?.speaker);
    if (!configuredNames.has(visibleName)) issues.push({ index, speaker: visibleName });
  });
  return issues;
}

function renameScriptSpeaker(oldName, newName, state = appState) {
  const previousName = String(oldName ?? '');
  const nextName = String(newName ?? '');
  if (previousName === nextName) return false;
  let changed = false;
  const renameInScript = script => {
    if (!Array.isArray(script?.segments)) return;
    script.segments.forEach(segment => {
      if (segment.speaker === previousName) {
        segment.speaker = nextName;
        changed = true;
      }
    });
  };
  renameInScript(state.script);
  renameInScript(state.originalScript);
  if (Array.isArray(state.history)) state.history.forEach(renameInScript);
  return changed;
}

function validateScript(script) {
  if (!script || typeof script !== 'object') throw new Error('Gemini returned an invalid script object.');
  if (!normaliseWhitespace(script.title)) throw new Error('The generated script has no title.');
  if (!Array.isArray(script.segments) || script.segments.length < 2) throw new Error('The generated script contains too few dialogue segments.');
  const speakerIssues = validateScriptSpeakers(script);
  if (speakerIssues.length) {
    const issue = speakerIssues[0];
    throw new Error(`Segment ${issue.index + 1} uses the unconfigured speaker “${issue.speaker || 'blank'}”.`);
  }
  for (const [index, segment] of script.segments.entries()) {
    if (!normaliseWhitespace(segment.text)) throw new Error(`Segment ${index + 1} has no spoken text.`);
  }
  return {
    title: normaliseWhitespace(script.title), summary: normaliseWhitespace(script.summary),
    language: normaliseWhitespace(script.language) || getLanguage(), estimatedWords: Number(script.estimatedWords) || getWordCount(script),
    segments: script.segments.map(segment => ({ speaker: normaliseWhitespace(segment.speaker), direction: normalisePerformanceTag(segment.direction), text: normaliseWhitespace(segment.text) }))
  };
}
function stripJsonFence(value) { return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(); }
function extractTextResponse(data) { return (data?.candidates?.flatMap(candidate => candidate?.content?.parts || []) || []).map(part => part?.text || '').join('').trim(); }
async function callGeminiText({ prompt, schema, actionLabel }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(getTextModel())}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': appState.connection.apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } })
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw createApiError(response.status, `Gemini returned non-JSON data while ${actionLabel}.`, raw); }
  if (!response.ok) throw createApiError(response.status, data?.error?.message || `Gemini request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
  const text = extractTextResponse(data);
  if (!text) throw new Error('Gemini returned no script text.');
  try { return JSON.parse(stripJsonFence(text)); } catch { throw new Error('Gemini returned script data that could not be parsed as JSON.'); }
}
async function generatePodcastScript() {
  syncCreateInputs();
  const namesBeforeValidation = appState.speakers.map(speaker => speaker.speakerName);
  const errors = validatePodcastBrief();
  appState.speakers.forEach((speaker, index) => {
    const previousName = namesBeforeValidation[index];
    if (previousName !== speaker.speakerName) {
      renameScriptSpeaker(previousName, speaker.speakerName);
      invalidateAudioForSpeakerMappingChange({
        speakerId: speaker.id,
        previousSpeakerName: previousName,
        nextSpeakerName: speaker.speakerName,
        previousVoiceName: speaker.geminiVoiceName,
        nextVoiceName: speaker.geminiVoiceName
      });
    }
  });
  if (errors.length) return showValidationErrors(errors);
  clearValidation();
  if (getDuplicateVoiceSignature() && !isDuplicateVoiceApproved()) return showDuplicateVoiceWarning();
  hideServiceError(); revokeAudioUrl(); appState.audioCacheReferences = {}; appState.lastAction = 'generate-script';
  setBusy(true, 'script', SCRIPT_PROGRESS_MESSAGES);
  try {
    appState.script = validateScript(await callGeminiText({ prompt: buildScriptPrompt(), schema: buildScriptSchema(), actionLabel: 'generating the podcast script' }));
    appState.legacyScript = null;
    appState.originalScript = deepClone(appState.script); resetHistory(); queueSave(); setStage('script');
  } catch (error) {
    handleGenerationError(error, 'Script generation failed', 'Try a clearer topic or select a different text model.', generatePodcastScript);
  } finally { setBusy(false); }
}
async function refineScript(action) {
  if (!appState.script) return;
  const instructions = {
    regenerate: 'Rewrite the entire script while keeping the same topic, settings, speakers, and target length. Improve flow and originality.',
    shorten: 'Shorten the script by about 25 percent while preserving the key ideas and natural conclusion.',
    expand: 'Expand the script by about 25 percent with useful substance, not filler, while remaining under 10 minutes.',
    conversational: 'Make the dialogue more spontaneous and conversational. Use shorter turns and natural reactions.',
    serious: 'Make the tone more serious, measured, and analytical without becoming stiff.',
    humour: 'Add light, intelligent humour without undermining accuracy or turning the episode into a comedy sketch.'
  };
  if (!instructions[action]) return;
  appState.lastAction = `refine:${action}`; hideServiceError(); setBusy(true, 'refine', SCRIPT_PROGRESS_MESSAGES);
  const prompt = `Transform the existing podcast script according to this instruction:\n${instructions[action]}\n\nKeep exactly these human speaker names: ${buildScriptCharacters().map(character => character.name).join(' and ')}.\nNever replace them with Gemini voice identifiers.\nKeep all dialogue in ${getLanguage()}.\nKeep performance tags sparse and subtle.\nReturn only JSON matching the supplied schema.\n\nCURRENT SCRIPT\n${JSON.stringify(appState.script)}`;
  try {
    snapshotScript(); appState.script = validateScript(await callGeminiText({ prompt, schema: buildScriptSchema(), actionLabel: 'refining the podcast script' }));
    snapshotScript({ force: true }); invalidatePodcastAudio('script-refined'); queueSave(); renderScriptStage();
  } catch (error) {
    handleGenerationError(error, 'Script refinement failed', 'Try again or edit the script manually.', () => refineScript(action));
  } finally { setBusy(false); }
}
