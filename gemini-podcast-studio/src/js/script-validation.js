export function installScriptValidation(services) {
  const ROOT_FIELDS = Object.freeze(['title', 'summary', 'segments']);
  const SEGMENT_FIELDS = Object.freeze(['speaker', 'direction', 'text']);
  function createScriptValidationError(message, details = '') {
    const error = new Error(message);
    error.code = 'SCRIPT_VALIDATION_FAILED';
    error.details = details || message;
    return error;
  }
  function failScriptValidation(message, details = '') {
    throw createScriptValidationError(message, details);
  }
  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
  function getUnexpectedFields(value, allowedFields) {
    if (!isPlainObject(value)) return [];
    const allowed = new Set(allowedFields);
    return Object.keys(value).filter(key => !allowed.has(key));
  }
  function assertRequiredFields(value, requiredFields, context) {
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) failScriptValidation(`${context} is missing the required “${field}” field.`);
    }
  }
  function getScriptSpeakerNames(speakers = services.appState.speakers) {
    const source = Array.isArray(speakers) ? speakers.slice(0, 2) : [];
    if (source.length !== 2) failScriptValidation('Exactly two configured speakers are required for script generation.');
    const names = source.map(speaker => services.normaliseWhitespace(speaker?.speakerName));
    if (names.some(name => !name)) failScriptValidation('Both configured speaker names must be non-empty.');
    if (names[0].toLocaleLowerCase() === names[1].toLocaleLowerCase()) failScriptValidation('Configured speaker names must be different.');
    return names;
  }
  function buildScriptCharacters(speakers = services.appState.speakers) {
    const names = getScriptSpeakerNames(speakers);
    return names.map((name, index) => ({
      name,
      personality: services.normaliseWhitespace(speakers[index]?.personality),
      role: services.normaliseWhitespace(speakers[index]?.id)
    }));
  }
  function buildScriptSchema() {
    const speakerNames = getScriptSpeakerNames();
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'A concise podcast episode title.' },
        summary: { type: 'string', description: 'A concise summary of the episode.' },
        segments: {
          type: 'array',
          minItems: 2,
          maxItems: services.getMaxScriptSegments(),
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              speaker: { type: 'string', enum: speakerNames },
              direction: { type: 'string', description: 'A short English TTS performance instruction or an empty string.' },
              text: { type: 'string', description: 'Non-empty spoken dialogue for this speaker.' }
            },
            required: [...SEGMENT_FIELDS]
          }
        }
      },
      required: [...ROOT_FIELDS]
    };
  }
  function buildScriptPrompt() {
    const [a, b] = buildScriptCharacters();
    const targetWords = services.getTargetWords();
    const maximumWords = Math.floor(targetWords * services.MAX_SCRIPT_OVERAGE_RATIO);
    return `Create a polished two-person podcast script.\n\nTOPIC\n${services.appState.podcast.topic.trim()}\n\nEPISODE SETTINGS\nLanguage: ${services.getLanguage()}\nTarget length: approximately ${targetWords} spoken words; do not exceed ${maximumWords} spoken words\nMaximum dialogue segments: ${services.getMaxScriptSegments()}\nFormat: ${services.getPodcastFormat()}\nTone: ${services.appState.podcast.tones.join(', ') || 'Natural'}\nAdditional instructions: ${services.appState.podcast.instructions.trim() || 'None'}\n\nSPEAKER 1\nName: ${a.name}\nRole: ${a.role || 'host-1'}\nPersonality: ${a.personality || 'Natural and engaging'}\n\nSPEAKER 2\nName: ${b.name}\nRole: ${b.role || 'host-2'}\nPersonality: ${b.personality || 'Natural and engaging'}\n\nRULES\n- Use exactly the configured human names: ${a.name} and ${b.name}.\n- Never use Gemini voice identifiers as character names.\n- Alternate naturally and avoid long monologues.\n- Keep every spoken segment at or below ${services.MAX_SEGMENT_WORDS} words.\n- Spoken text must not be empty and must not contain markdown, URLs, citations, sound-effect labels, or stage directions.\n- Use direction only for a short English TTS performance instruction, or use an empty string. Do not use brackets.\n- Include an opening hook, substantive discussion, contrasting viewpoints, a useful conclusion, and a natural closing line.\n- Output only JSON matching the supplied schema.`;
  }
  function validateScriptSpeakers(script, speakers = services.appState.speakers) {
    if (!Array.isArray(script?.segments)) return [];
    let configuredNames;
    try {
      configuredNames = new Set(getScriptSpeakerNames(speakers));
    } catch {
      return script.segments.map((segment, index) => ({ index, speaker: services.normaliseWhitespace(segment?.speaker) }));
    }
    const issues = [];
    script.segments.forEach((segment, index) => {
      const visibleName = services.normaliseWhitespace(segment?.speaker);
      if (!configuredNames.has(visibleName)) issues.push({ index, speaker: visibleName });
    });
    return issues;
  }
  function renameScriptSpeaker(oldName, newName, state = services.appState) {
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
  function getScriptWarnings(script, {
    targetWords = services.getTargetWords(),
    locale = services.getLanguageLocale()
  } = {}) {
    if (!Array.isArray(script?.segments)) return [];
    const warnings = [];
    const totalWords = services.getWordCount(script, locale);
    if (targetWords > 0 && totalWords > targetWords * services.MAX_SCRIPT_OVERAGE_RATIO) {
      warnings.push({
        code: 'SCRIPT_OVER_TARGET',
        message: `Script is ${totalWords.toLocaleString('en-GB')} words, more than 15% above the ${targetWords.toLocaleString('en-GB')}-word target.`
      });
    }
    if (targetWords > 0 && totalWords < targetWords * services.MIN_SCRIPT_LENGTH_RATIO) {
      warnings.push({
        code: 'SCRIPT_UNDER_TARGET',
        message: `Script is materially shorter than requested at ${totalWords.toLocaleString('en-GB')} of approximately ${targetWords.toLocaleString('en-GB')} words.`
      });
    }
    script.segments.forEach((segment, index) => {
      const segmentWords = services.countWords(segment?.text, locale);
      if (segmentWords > services.MAX_SEGMENT_WORDS) warnings.push({
        code: 'SEGMENT_OVER_WORD_LIMIT',
        segmentIndex: index,
        message: `Segment ${index + 1} contains ${segmentWords} words; the recommended maximum is ${services.MAX_SEGMENT_WORDS}.`
      });
      const direction = services.normaliseWhitespace(segment?.direction);
      if (services.countWords(direction, 'en') > services.MAX_DIRECTION_WORDS || direction.length > services.MAX_DIRECTION_CHARACTERS) warnings.push({
        code: 'DIRECTION_UNUSUALLY_LONG',
        segmentIndex: index,
        message: `Segment ${index + 1} has an unusually long performance direction.`
      });
    });
    return warnings;
  }
  function refreshScriptWarnings(script = services.appState.script) {
    if (!script || !Array.isArray(script.segments)) return [];
    script.estimatedWords = services.getWordCount(script);
    script.validationWarnings = getScriptWarnings(script);
    return script.validationWarnings;
  }
  function validateScript(script) {
    if (!isPlainObject(script)) failScriptValidation('Gemini returned a non-object script root.');
    const unexpectedRootFields = getUnexpectedFields(script, ROOT_FIELDS);
    if (unexpectedRootFields.length) failScriptValidation(`The generated script contains unexpected root field${unexpectedRootFields.length === 1 ? '' : 's'}: ${unexpectedRootFields.join(', ')}.`);
    assertRequiredFields(script, ROOT_FIELDS, 'The generated script');
    if (typeof script.title !== 'string' || !services.normaliseWhitespace(script.title)) failScriptValidation('The generated script has no title.');
    if (typeof script.summary !== 'string') failScriptValidation('The generated script summary must be a string.');
    if (!Array.isArray(script.segments)) failScriptValidation('The generated script segments field must be an array.');
    if (script.segments.length < 2) failScriptValidation('The generated script contains too few dialogue segments.');
    const maximumSegments = services.getMaxScriptSegments();
    if (script.segments.length > maximumSegments) failScriptValidation(`The generated script contains ${script.segments.length} segments; the maximum for this duration is ${maximumSegments}.`);
    const configuredNames = new Set(getScriptSpeakerNames());
    const segments = script.segments.map((segment, index) => {
      if (!isPlainObject(segment)) failScriptValidation(`Segment ${index + 1} must be an object.`);
      const unexpectedSegmentFields = getUnexpectedFields(segment, SEGMENT_FIELDS);
      if (unexpectedSegmentFields.length) failScriptValidation(`Segment ${index + 1} contains unexpected field${unexpectedSegmentFields.length === 1 ? '' : 's'}: ${unexpectedSegmentFields.join(', ')}.`);
      assertRequiredFields(segment, SEGMENT_FIELDS, `Segment ${index + 1}`);
      if (typeof segment.speaker !== 'string') failScriptValidation(`Segment ${index + 1} has an invalid speaker name.`);
      const speaker = services.normaliseWhitespace(segment.speaker);
      if (!configuredNames.has(speaker)) failScriptValidation(`Segment ${index + 1} uses the unconfigured speaker “${speaker || 'blank'}”.`);
      if (typeof segment.direction !== 'string') failScriptValidation(`Segment ${index + 1} has an invalid direction.`);
      if (typeof segment.text !== 'string' || !services.normaliseWhitespace(segment.text)) failScriptValidation(`Segment ${index + 1} has no spoken text.`);
      return {
        speaker,
        direction: services.normaliseWhitespace(segment.direction).replace(/^\[+|\]+$/g, '').trim(),
        text: services.normaliseWhitespace(segment.text)
      };
    });
    const result = {
      title: services.normaliseWhitespace(script.title),
      summary: services.normaliseWhitespace(script.summary),
      language: services.getLanguage(),
      estimatedWords: 0,
      segments,
      validationWarnings: []
    };
    refreshScriptWarnings(result);
    return result;
  }
  function toStructuredScriptPayload(script = services.appState.script) {
    return {
      title: services.normaliseWhitespace(script?.title),
      summary: services.normaliseWhitespace(script?.summary),
      segments: Array.isArray(script?.segments) ? script.segments.map(segment => ({
        speaker: services.normaliseWhitespace(segment?.speaker),
        direction: services.normaliseWhitespace(segment?.direction),
        text: services.normaliseWhitespace(segment?.text)
      })) : []
    };
  }
  Object.assign(services, {
    ROOT_FIELDS,
    SEGMENT_FIELDS,
    createScriptValidationError,
    getUnexpectedFields,
    getScriptSpeakerNames,
    buildScriptCharacters,
    buildScriptSchema,
    buildScriptPrompt,
    validateScriptSpeakers,
    renameScriptSpeaker,
    getScriptWarnings,
    refreshScriptWarnings,
    validateScript,
    toStructuredScriptPayload
  });
  return services;
}
