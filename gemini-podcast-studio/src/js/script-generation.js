export function installScriptGeneration(services) {
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
    services.revokeAudioUrl();
    services.appState.audioCacheReferences = {};
    services.appState.lastAction = 'generate-script';
    services.setBusy(true, 'script', services.SCRIPT_PROGRESS_MESSAGES);
    try {
      services.appState.script = services.validateScript(await services.callGeminiText({
        prompt: services.buildScriptPrompt(),
        schema: services.buildScriptSchema(),
        actionLabel: 'generating the podcast script'
      }));
      services.appState.legacyScript = null;
      services.appState.originalScript = services.deepClone(services.appState.script);
      services.resetHistory();
      services.queueSave();
      services.setStage('script');
    } catch (error) {
      services.handleGenerationError(error, 'Script generation failed', 'Try a clearer topic or select a different text model.', generatePodcastScript);
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
    const prompt = `Transform the existing podcast script according to this instruction:\n${instructions[action]}\n\nKeep exactly these human speaker names: ${services.buildScriptCharacters().map(character => character.name).join(' and ')}.\nNever replace them with Gemini voice identifiers.\nKeep all dialogue in ${services.getLanguage()}.\nKeep performance tags sparse and subtle.\nReturn only JSON matching the supplied schema.\n\nCURRENT SCRIPT\n${JSON.stringify(services.appState.script)}`;
    try {
      services.snapshotScript();
      services.appState.script = services.validateScript(await services.callGeminiText({
        prompt,
        schema: services.buildScriptSchema(),
        actionLabel: 'refining the podcast script'
      }));
      services.snapshotScript({
        force: true
      });
      services.invalidatePodcastAudio('script-refined');
      services.queueSave();
      services.renderScriptStage();
    } catch (error) {
      services.handleGenerationError(error, 'Script refinement failed', 'Try again or edit the script manually.', () => refineScript(action));
    } finally {
      services.setBusy(false);
    }
  }
  Object.assign(services, {
    generatePodcastScript,
    refineScript
  });
  return services;
}
