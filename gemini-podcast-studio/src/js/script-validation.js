export function installScriptValidation(services) {
  function buildScriptCharacters(speakers = services.appState.speakers) {
    return (Array.isArray(speakers) ? speakers : []).map(speaker => ({
      name: services.normaliseWhitespace(speaker.speakerName),
      personality: services.normaliseWhitespace(speaker.personality),
      role: services.normaliseWhitespace(speaker.id)
    }));
  }
  function buildScriptSchema() {
    const scriptCharacters = buildScriptCharacters();
    return {
      type: 'object',
      properties: {
        title: {
          type: 'string'
        },
        summary: {
          type: 'string'
        },
        language: {
          type: 'string'
        },
        estimatedWords: {
          type: 'integer'
        },
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              speaker: {
                type: 'string',
                enum: scriptCharacters.map(character => character.name)
              },
              direction: {
                type: 'string'
              },
              text: {
                type: 'string'
              }
            },
            required: ['speaker', 'direction', 'text']
          }
        }
      },
      required: ['title', 'summary', 'language', 'estimatedWords', 'segments']
    };
  }
  function buildScriptPrompt() {
    const [a, b] = buildScriptCharacters();
    return `Create a polished two-person podcast script.\n\nTOPIC\n${services.appState.podcast.topic.trim()}\n\nEPISODE SETTINGS\nLanguage: ${services.getLanguage()}\nTarget length: approximately ${services.getTargetWords()} spoken words, staying within plus or minus 10 percent\nFormat: ${services.getPodcastFormat()}\nTone: ${services.appState.podcast.tones.join(', ') || 'Natural'}\nAdditional instructions: ${services.appState.podcast.instructions.trim() || 'None'}\n\nSPEAKER 1\nName: ${a.name}\nRole: ${a.role || 'host-1'}\nPersonality: ${a.personality || 'Natural and engaging'}\n\nSPEAKER 2\nName: ${b.name}\nRole: ${b.role || 'host-2'}\nPersonality: ${b.personality || 'Natural and engaging'}\n\nRULES\n- Use exactly the configured human names: ${a.name} and ${b.name}.\n- Never use Gemini voice identifiers as character names.\n- Alternate naturally and avoid long monologues.\n- Keep each segment short and speakable.\n- Spoken text must not contain markdown, URLs, citations, sound-effect labels, or stage directions.\n- Use the direction field only for sparse, subtle English performance cues without brackets.\n- Include an opening hook, substantive discussion, contrasting viewpoints, a useful conclusion, and a natural closing line.\n- Output only JSON matching the supplied schema.`;
  }
  function validateScriptSpeakers(script, speakers = services.appState.speakers) {
    if (!Array.isArray(script?.segments)) return [];
    const configuredNames = new Set((Array.isArray(speakers) ? speakers : []).map(speaker => services.normaliseWhitespace(speaker.speakerName)));
    const issues = [];
    script.segments.forEach((segment, index) => {
      const visibleName = services.normaliseWhitespace(segment?.speaker);
      if (!configuredNames.has(visibleName)) issues.push({
        index,
        speaker: visibleName
      });
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
  function validateScript(script) {
    if (!script || typeof script !== 'object') throw new Error('Gemini returned an invalid script object.');
    if (!services.normaliseWhitespace(script.title)) throw new Error('The generated script has no title.');
    if (!Array.isArray(script.segments) || script.segments.length < 2) throw new Error('The generated script contains too few dialogue segments.');
    const speakerIssues = validateScriptSpeakers(script);
    if (speakerIssues.length) {
      const issue = speakerIssues[0];
      throw new Error(`Segment ${issue.index + 1} uses the unconfigured speaker “${issue.speaker || 'blank'}”.`);
    }
    for (const [index, segment] of script.segments.entries()) {
      if (!services.normaliseWhitespace(segment.text)) throw new Error(`Segment ${index + 1} has no spoken text.`);
    }
    return {
      title: services.normaliseWhitespace(script.title),
      summary: services.normaliseWhitespace(script.summary),
      language: services.normaliseWhitespace(script.language) || services.getLanguage(),
      estimatedWords: Number(script.estimatedWords) || services.getWordCount(script),
      segments: script.segments.map(segment => ({
        speaker: services.normaliseWhitespace(segment.speaker),
        direction: services.normalisePerformanceTag(segment.direction),
        text: services.normaliseWhitespace(segment.text)
      }))
    };
  }
  Object.assign(services, {
    buildScriptCharacters,
    buildScriptSchema,
    buildScriptPrompt,
    validateScriptSpeakers,
    renameScriptSpeaker,
    validateScript
  });
  return services;
}
