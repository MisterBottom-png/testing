export function installScriptGeneration(ctx) {
  function buildScriptPrompt() {
      const [a, b] = ctx.buildScriptCharacters();
      return `Create a polished two-person podcast script.\n\nTOPIC\n${ctx.appState.podcast.topic.trim()}\n\nEPISODE SETTINGS\nLanguage: ${ctx.getLanguage()}\nTarget length: approximately ${ctx.getTargetWords()} spoken words, staying within plus or minus 10 percent\nFormat: ${ctx.getPodcastFormat()}\nTone: ${ctx.appState.podcast.tones.join(', ') || 'Natural'}\nAdditional instructions: ${ctx.appState.podcast.instructions.trim() || 'None'}\n\nSPEAKER 1\nName: ${a.name}\nRole: ${a.role || 'host-1'}\nPersonality: ${a.personality || 'Natural and engaging'}\n\nSPEAKER 2\nName: ${b.name}\nRole: ${b.role || 'host-2'}\nPersonality: ${b.personality || 'Natural and engaging'}\n\nRULES\n- Use exactly the configured human names: ${a.name} and ${b.name}.\n- Never use Gemini voice identifiers as character names.\n- Alternate naturally and avoid long monologues.\n- Keep each segment short and speakable.\n- Spoken text must not contain markdown, URLs, citations, sound-effect labels, or stage directions.\n- Use the direction field only for sparse, subtle English performance cues without brackets.\n- Include an opening hook, substantive discussion, contrasting viewpoints, a useful conclusion, and a natural closing line.\n- Output only JSON matching the supplied schema.`;
  }
  ctx.expose("buildScriptPrompt", buildScriptPrompt);
  async function generatePodcastScript() {
      ctx.syncCreateInputs();
      const namesBeforeValidation = ctx.appState.speakers.map(speaker => speaker.speakerName);
      const errors = ctx.validatePodcastBrief();
      ctx.appState.speakers.forEach((speaker, index) => {
          const previousName = namesBeforeValidation[index];
          if (previousName !== speaker.speakerName) {
              ctx.renameScriptSpeaker(previousName, speaker.speakerName);
              ctx.invalidateAudioForSpeakerMappingChange({
                  speakerId: speaker.id,
                  previousSpeakerName: previousName,
                  nextSpeakerName: speaker.speakerName,
                  previousVoiceName: speaker.geminiVoiceName,
                  nextVoiceName: speaker.geminiVoiceName
              });
          }
      });
      if (errors.length)
          return ctx.showValidationErrors(errors);
      ctx.clearValidation();
      if (ctx.getDuplicateVoiceSignature() && !ctx.isDuplicateVoiceApproved())
          return ctx.showDuplicateVoiceWarning();
      ctx.hideServiceError();
      ctx.revokeAudioUrl();
      ctx.appState.audioCacheReferences = {};
      ctx.appState.lastAction = 'generate-script';
      ctx.setBusy(true, 'script', ctx.SCRIPT_PROGRESS_MESSAGES);
      try {
          ctx.appState.script = ctx.validateScript(await ctx.callGeminiText({ prompt: buildScriptPrompt(), schema: ctx.buildScriptSchema(), actionLabel: 'generating the podcast script' }));
          ctx.appState.legacyScript = null;
          ctx.appState.originalScript = ctx.deepClone(ctx.appState.script);
          ctx.resetHistory();
          ctx.queueSave();
          ctx.setStage('script');
      }
      catch (error) {
          ctx.handleGenerationError(error, 'Script generation failed', 'Try a clearer topic or select a different text model.', generatePodcastScript);
      }
      finally {
          ctx.setBusy(false);
      }
  }
  ctx.expose("generatePodcastScript", generatePodcastScript);
  async function refineScript(action) {
      if (!ctx.appState.script)
          return;
      const instructions = {
          regenerate: 'Rewrite the entire script while keeping the same topic, settings, speakers, and target length. Improve flow and originality.',
          shorten: 'Shorten the script by about 25 percent while preserving the key ideas and natural conclusion.',
          expand: 'Expand the script by about 25 percent with useful substance, not filler, while remaining under 10 minutes.',
          conversational: 'Make the dialogue more spontaneous and conversational. Use shorter turns and natural reactions.',
          serious: 'Make the tone more serious, measured, and analytical without becoming stiff.',
          humour: 'Add light, intelligent humour without undermining accuracy or turning the episode into a comedy sketch.'
      };
      if (!instructions[action])
          return;
      ctx.appState.lastAction = `refine:${action}`;
      ctx.hideServiceError();
      ctx.setBusy(true, 'refine', ctx.SCRIPT_PROGRESS_MESSAGES);
      const prompt = `Transform the existing podcast script according to this instruction:\n${instructions[action]}\n\nKeep exactly these human speaker names: ${ctx.buildScriptCharacters().map(character => character.name).join(' and ')}.\nNever replace them with Gemini voice identifiers.\nKeep all dialogue in ${ctx.getLanguage()}.\nKeep performance tags sparse and subtle.\nReturn only JSON matching the supplied schema.\n\nCURRENT SCRIPT\n${JSON.stringify(ctx.appState.script)}`;
      try {
          ctx.snapshotScript();
          ctx.appState.script = ctx.validateScript(await ctx.callGeminiText({ prompt, schema: ctx.buildScriptSchema(), actionLabel: 'refining the podcast script' }));
          ctx.snapshotScript({ force: true });
          ctx.invalidatePodcastAudio('script-refined');
          ctx.queueSave();
          ctx.renderScriptStage();
      }
      catch (error) {
          ctx.handleGenerationError(error, 'Script refinement failed', 'Try again or edit the script manually.', () => refineScript(action));
      }
      finally {
          ctx.setBusy(false);
      }
  }
  ctx.expose("refineScript", refineScript);
}
