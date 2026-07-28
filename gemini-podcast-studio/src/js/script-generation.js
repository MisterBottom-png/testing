export function installScriptGeneration(services) {
  function buildScriptRequestOptions(prompt, actionLabel) {
    return {
      prompt,
      schema: services.buildScriptSchema(),
      actionLabel,
      maxOutputTokens: services.getScriptOutputTokenLimit(),
      thinkingLevel: services.getScriptThinkingLevel(),
      validate: services.validateScript
    };
  }
  async function generatePodcastScript() {
    services.syncCreateInputs();
    const namesBeforeValidation = services.appState.speakers.map(speaker => speaker.speakerName);
    const errors = services.validatePodcastBrief();
    services.appState.speakers.forEach((speaker, index) => {
      const previousName = namesBeforeValidation[index];
      if (previousName !== speaker.speakerName) {
        services.renameScriptSpeaker(previousName, speaker.speakerName);
        services.invalidateAudioForSpeakerMappingChange({
          speakerId: speaker.id,
          previousSpeakerName: previousName,
          nextSpeakerName: speaker.speakerName,
          previousVoiceName: speaker.geminiVoiceName,
          nextVoiceName: speaker.geminiVoiceName
        });
      }
    });
    if (errors.length) return services.showValidationErrors(errors);
    services.clearValidation();
    if (services.getDuplicateVoiceSignature() && !services.isDuplicateVoiceApproved()) return services.showDuplicateVoiceWarning();
    services.hideServiceError();
    services.appState.lastAction = 'generate-script';
    services.setBusy(true, 'script', services.SCRIPT_PROGRESS_MESSAGES);
    try {
      const generatedScript = await services.generateStructuredScript(buildScriptRequestOptions(
        services.buildScriptPrompt(),
        'generating the podcast script'
      ));
      services.revokeAudioUrl();
      services.appState.audioCacheReferences = {};
      services.appState.script = generatedScript;
      services.appState.legacyScript = null;
      services.appState.originalScript = services.deepClone(generatedScript);
      services.resetHistory();
      services.queueSave();
      services.setStage('script');
    } catch (error) {
      services.handleGenerationError(error, 'Script generation failed', 'Review the generation details and adjust the brief or model.', generatePodcastScript);
    } finally {
      services.setBusy(false);
    }
  }
  async function refineScript(action) {
    if (!services.appState.script) return;
    const instructions = {
      regenerate: 'Rewrite the entire script while keeping the same topic, settings, speakers, and target length. Improve flow and originality.',
      shorten: 'Shorten the script by about 25 percent while preserving the key ideas and natural conclusion.',
      expand: 'Expand the script by about 25 percent with useful substance, not filler, while remaining under 10 minutes.',
      conversational: 'Make the dialogue more spontaneous and conversational. Use shorter turns and natural reactions.',
      serious: 'Make the tone more serious, measured, and analytical without becoming stiff.',
      humour: 'Add light, intelligent humour without undermining accuracy or turning the episode into a comedy sketch.'
    };
    if (!instructions[action]) return;
    services.appState.lastAction = `refine:${action}`;
    services.hideServiceError();
    services.setBusy(true, 'refine', services.SCRIPT_PROGRESS_MESSAGES);
    const prompt = `Transform the existing podcast script according to this instruction:\n${instructions[action]}\n\nKeep exactly these human speaker names: ${services.buildScriptCharacters().map(character => character.name).join(' and ')}.\nNever replace them with Gemini voice identifiers.\nKeep all dialogue in ${services.getLanguage()}.\nKeep every spoken segment at or below ${services.MAX_SEGMENT_WORDS} words.\nUse only short TTS performance directions or an empty string.\nReturn only JSON matching the supplied schema.\n\nCURRENT SCRIPT\n${JSON.stringify(services.toStructuredScriptPayload())}`;
    try {
      const generatedScript = await services.generateStructuredScript(buildScriptRequestOptions(
        prompt,
        'refining the podcast script'
      ));
      services.snapshotScript();
      services.appState.script = generatedScript;
      services.snapshotScript({ force: true });
      services.invalidatePodcastAudio('script-refined');
      services.queueSave();
      services.renderScriptStage();
    } catch (error) {
      services.handleGenerationError(error, 'Script refinement failed', 'Review the generation details or edit the script manually.', () => refineScript(action));
    } finally {
      services.setBusy(false);
    }
  }
  Object.assign(services, {
    buildScriptRequestOptions,
    generatePodcastScript,
    refineScript
  });
  return services;
}
