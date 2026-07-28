export function installGenerationJobs(services) {
  function invalidatePodcastAudio(reason = '') {
    const hadAudio = Boolean(services.appState.audio?.url || services.appState.audio?.blob || Object.keys(services.appState.audioCacheReferences || {}).length);
    services.revokeAudioUrl();
    services.appState.audioCacheReferences = {};
    if (services.appState.currentStage === 'audio' && services.appState.script) services.appState.currentStage = 'script';
    if (reason) services.appState.lastAudioInvalidationReason = reason;
    return hadAudio;
  }
  function invalidateAudioForSpeakerMappingChange({
    speakerId = '',
    previousSpeakerName = '',
    nextSpeakerName = '',
    previousVoiceName = '',
    nextVoiceName = ''
  } = {}) {
    const nameChanged = previousSpeakerName !== nextSpeakerName;
    const voiceChanged = previousVoiceName !== nextVoiceName;
    if (!nameChanged && !voiceChanged) return false;
    return services.invalidatePodcastAudio(`speaker-mapping:${speakerId || 'unknown'}`);
  }
  function getTtsSpeakerValidationIssue(script = services.appState.script, speakers = services.appState.speakers) {
    const issue = services.validateScriptSpeakers(script, speakers)[0];
    if (!issue) return null;
    return {
      title: 'Script speaker mismatch',
      message: `Segment ${issue.index + 1} uses “${issue.speaker || 'blank'}”, which is not a configured speaker.`,
      suggestion: 'Choose one of the configured human speaker names before generating audio.'
    };
  }
  async function generatePodcastAudio() {
    if (!services.appState.script?.segments?.length) return;
    const speakerIssue = services.getTtsSpeakerValidationIssue();
    if (speakerIssue) return services.showServiceError({
      ...speakerIssue,
      details: '',
      retry: null
    });
    const invalidSpeaker = services.appState.speakers.find(speaker => {
      const voice = services.getGeminiTtsVoice(speaker.geminiVoiceName);
      return !voice || voice.gender !== speaker.gender || voice.type !== speaker.voiceType;
    });
    if (invalidSpeaker) return services.showServiceError({
      title: 'Voice selection required',
      message: `${invalidSpeaker.speakerName || 'A speaker'} does not have a valid matching Gemini voice.`,
      suggestion: 'Select an available voice matching the chosen gender and voice type.',
      details: '',
      retry: null
    });
    let chunks;
    try {
      chunks = services.createTtsChunks();
    } catch (error) {
      return services.showServiceError({
        title: 'Script segment is too long',
        message: error.message,
        suggestion: 'Split the long dialogue segment into shorter turns.',
        details: '',
        retry: null
      });
    }
    if (!chunks.length) return;
    const speakerVoiceConfigs = services.buildSpeakerVoiceConfigs();
    const mappingSignature = services.getSpeakerVoiceMappingSignature();
    services.hideServiceError();
    services.invalidatePodcastAudio('audio-regeneration');
    services.appState.lastAction = 'generate-audio';
    services.setBusy(true, 'audio', services.AUDIO_PROGRESS_MESSAGES);
    const startedAt = performance.now();
    const pcmParts = [];
    let sampleRate = 0;
    try {
      for (const chunk of chunks) {
        if (services.els.scriptLoadingMessage) services.els.scriptLoadingMessage.textContent = chunks.length > 1 ? `Generating audio chunk ${chunk.index + 1} of ${chunks.length}…` : 'Generating the conversation…';
        let result;
        try {
          result = await services.generateTtsPcm({ transcript: chunk.transcript, speakerVoiceConfigs });
        } catch (error) {
          const chunkError = services.createApiError(Number(error?.status || 0), `TTS chunk ${chunk.index + 1} of ${chunks.length} failed. No partial audio was saved.`, error?.details || error?.stack || String(error));
          chunkError.cause = error;
          throw chunkError;
        }
        if (sampleRate && result.sampleRate !== sampleRate) throw new Error('Gemini returned inconsistent audio sample rates between TTS chunks.');
        sampleRate = sampleRate || result.sampleRate;
        pcmParts.push(result.pcmBytes);
      }
      const pcmBytes = services.concatPcmBytes(pcmParts);
      const wavBlob = services.pcm16ToWavBlob(pcmBytes, sampleRate || 24000, 1);
      services.appState.audio = {
        blob: wavBlob,
        url: URL.createObjectURL(wavBlob),
        sampleRate: sampleRate || 24000,
        generationSeconds: (performance.now() - startedAt) / 1000,
        durationSeconds: pcmBytes.byteLength / ((sampleRate || 24000) * 2),
        createdAt: new Date().toISOString()
      };
      services.appState.audioCacheReferences = {
        voiceMappingSignature: mappingSignature,
        chunks: chunks.map(chunk => ({
          index: chunk.index,
          cacheKey: services.buildTtsChunkCacheKey({
            transcript: chunk.transcript,
            mappingSignature,
            index: chunk.index
          }),
          speakerOrder: speakerVoiceConfigs.map(config => config.speaker)
        }))
      };
      services.queueSave();
      services.setStage('audio');
    } catch (error) {
      services.invalidatePodcastAudio('audio-generation-failed');
      services.handleGenerationError(error, 'Audio generation failed', 'Try a shorter script or select a different TTS model.', generatePodcastAudio);
    } finally {
      services.setBusy(false);
    }
  }
  function generateVoiceTest(index, options) {
    return services.generateVoicePreview(index, options);
  }
  Object.assign(services, {
    invalidatePodcastAudio,
    invalidateAudioForSpeakerMappingChange,
    getTtsSpeakerValidationIssue,
    generatePodcastAudio,
    generateVoiceTest
  });
  return services;
}
