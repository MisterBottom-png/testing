export function installScriptValidation(ctx) {
  function buildScriptCharacters(speakers = ctx.appState.speakers) {
      return (Array.isArray(speakers) ? speakers : []).map(speaker => ({
          name: ctx.normaliseWhitespace(speaker.speakerName),
          personality: ctx.normaliseWhitespace(speaker.personality),
          role: ctx.normaliseWhitespace(speaker.id)
      }));
  }
  ctx.expose("buildScriptCharacters", buildScriptCharacters);
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
  ctx.expose("buildScriptSchema", buildScriptSchema);
  function validateScriptSpeakers(script, speakers = ctx.appState.speakers) {
      if (!Array.isArray(script?.segments))
          return [];
      const configuredNames = new Set((Array.isArray(speakers) ? speakers : []).map(speaker => ctx.normaliseWhitespace(speaker.speakerName)));
      const issues = [];
      script.segments.forEach((segment, index) => {
          const visibleName = ctx.normaliseWhitespace(segment?.speaker);
          if (!configuredNames.has(visibleName))
              issues.push({ index, speaker: visibleName });
      });
      return issues;
  }
  ctx.expose("validateScriptSpeakers", validateScriptSpeakers);
  function renameScriptSpeaker(oldName, newName, state = ctx.appState) {
      const previousName = String(oldName ?? '');
      const nextName = String(newName ?? '');
      if (previousName === nextName)
          return false;
      let changed = false;
      const renameInScript = script => {
          if (!Array.isArray(script?.segments))
              return;
          script.segments.forEach(segment => {
              if (segment.speaker === previousName) {
                  segment.speaker = nextName;
                  changed = true;
              }
          });
      };
      renameInScript(state.script);
      renameInScript(state.originalScript);
      if (Array.isArray(state.history))
          state.history.forEach(renameInScript);
      return changed;
  }
  ctx.expose("renameScriptSpeaker", renameScriptSpeaker);
  function validateScript(script) {
      if (!script || typeof script !== 'object')
          throw new Error('Gemini returned an invalid script object.');
      if (!ctx.normaliseWhitespace(script.title))
          throw new Error('The generated script has no title.');
      if (!Array.isArray(script.segments) || script.segments.length < 2)
          throw new Error('The generated script contains too few dialogue segments.');
      const speakerIssues = validateScriptSpeakers(script);
      if (speakerIssues.length) {
          const issue = speakerIssues[0];
          throw new Error(`Segment ${issue.index + 1} uses the unconfigured speaker “${issue.speaker || 'blank'}”.`);
      }
      for (const [index, segment] of script.segments.entries()) {
          if (!ctx.normaliseWhitespace(segment.text))
              throw new Error(`Segment ${index + 1} has no spoken text.`);
      }
      return {
          title: ctx.normaliseWhitespace(script.title), summary: ctx.normaliseWhitespace(script.summary),
          language: ctx.normaliseWhitespace(script.language) || ctx.getLanguage(), estimatedWords: Number(script.estimatedWords) || ctx.getWordCount(script),
          segments: script.segments.map(segment => ({ speaker: ctx.normaliseWhitespace(segment.speaker), direction: ctx.normalisePerformanceTag(segment.direction), text: ctx.normaliseWhitespace(segment.text) }))
      };
  }
  ctx.expose("validateScript", validateScript);
}
