export function installTtsGeneration(ctx) {
  function invalidatePodcastAudio(reason = '') {
      const hadAudio = Boolean(ctx.appState.audio?.url || ctx.appState.audio?.blob || Object.keys(ctx.appState.audioCacheReferences || {}).length);
      ctx.revokeAudioUrl();
      ctx.appState.audioCacheReferences = {};
      if (ctx.appState.currentStage === 'audio' && ctx.appState.script)
          ctx.appState.currentStage = 'script';
      if (reason)
          ctx.appState.lastAudioInvalidationReason = reason;
      return hadAudio;
  }
  ctx.expose("invalidatePodcastAudio", invalidatePodcastAudio);
  function invalidateAudioForSpeakerMappingChange({ speakerId = '', previousSpeakerName = '', nextSpeakerName = '', previousVoiceName = '', nextVoiceName = '' } = {}) {
      const nameChanged = previousSpeakerName !== nextSpeakerName;
      const voiceChanged = previousVoiceName !== nextVoiceName;
      if (!nameChanged && !voiceChanged)
          return false;
      return ctx.invalidatePodcastAudio(`speaker-mapping:${speakerId || 'unknown'}`);
  }
  ctx.expose("invalidateAudioForSpeakerMappingChange", invalidateAudioForSpeakerMappingChange);
  function getTtsSpeakerValidationIssue(script = ctx.appState.script, speakers = ctx.appState.speakers) {
      const issue = ctx.validateScriptSpeakers(script, speakers)[0];
      if (!issue)
          return null;
      return {
          title: 'Script speaker mismatch',
          message: `Segment ${issue.index + 1} uses “${issue.speaker || 'blank'}”, which is not a configured speaker.`,
          suggestion: 'Choose one of the configured human speaker names before generating audio.'
      };
  }
  ctx.expose("getTtsSpeakerValidationIssue", getTtsSpeakerValidationIssue);
  async function generatePodcastAudio() {
      if (!ctx.appState.script?.segments?.length)
          return;
      const speakerIssue = ctx.getTtsSpeakerValidationIssue();
      if (speakerIssue)
          return ctx.showServiceError({ ...speakerIssue, details: '', retry: null });
      const invalidSpeaker = ctx.appState.speakers.find(speaker => {
          const voice = ctx.getGeminiTtsVoice(speaker.geminiVoiceName);
          return !voice || voice.gender !== speaker.gender || voice.type !== speaker.voiceType;
      });
      if (invalidSpeaker)
          return ctx.showServiceError({ title: 'Voice selection required', message: `${invalidSpeaker.speakerName || 'A speaker'} does not have a valid matching Gemini voice.`, suggestion: 'Select an available voice matching the chosen gender and voice type.', details: '', retry: null });
      let chunks;
      try {
          chunks = ctx.createTtsChunks();
      }
      catch (error) {
          return ctx.showServiceError({ title: 'Script segment is too long', message: error.message, suggestion: 'Split the long dialogue segment into shorter turns.', details: '', retry: null });
      }
      if (!chunks.length)
          return;
      const speakerVoiceConfigs = ctx.buildSpeakerVoiceConfigs();
      const mappingSignature = ctx.getSpeakerVoiceMappingSignature();
      ctx.hideServiceError();
      ctx.invalidatePodcastAudio('audio-regeneration');
      ctx.appState.lastAction = 'generate-audio';
      ctx.setBusy(true, 'audio', ctx.AUDIO_PROGRESS_MESSAGES);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ctx.getTtsModel())}:generateContent`;
      const startedAt = performance.now();
      const pcmParts = [];
      let sampleRate = 0;
      try {
          for (const chunk of chunks) {
              if (ctx.els.scriptLoadingMessage)
                  ctx.els.scriptLoadingMessage.textContent = chunks.length > 1 ? `Generating audio chunk ${chunk.index + 1} of ${chunks.length}…` : 'Generating the conversation…';
              let result;
              try {
                  result = await ctx.requestTtsChunk(endpoint, chunk.transcript, speakerVoiceConfigs);
              }
              catch (error) {
                  const chunkError = ctx.createApiError(Number(error?.status || 0), `TTS chunk ${chunk.index + 1} of ${chunks.length} failed. No partial audio was saved.`, error?.details || error?.stack || String(error));
                  chunkError.cause = error;
                  throw chunkError;
              }
              if (sampleRate && result.sampleRate !== sampleRate)
                  throw new Error('Gemini returned inconsistent audio sample rates between TTS chunks.');
              sampleRate = sampleRate || result.sampleRate;
              pcmParts.push(result.pcmBytes);
          }
          const pcmBytes = ctx.concatPcmBytes(pcmParts);
          const wavBlob = ctx.pcm16ToWavBlob(pcmBytes, sampleRate || 24000, 1);
          ctx.appState.audio = { blob: wavBlob, url: URL.createObjectURL(wavBlob), sampleRate: sampleRate || 24000, generationSeconds: (performance.now() - startedAt) / 1000, durationSeconds: pcmBytes.byteLength / ((sampleRate || 24000) * 2), createdAt: new Date().toISOString() };
          ctx.appState.audioCacheReferences = {
              voiceMappingSignature: mappingSignature,
              chunks: chunks.map(chunk => ({
                  index: chunk.index,
                  cacheKey: ctx.buildTtsChunkCacheKey({ transcript: chunk.transcript, mappingSignature, index: chunk.index }),
                  speakerOrder: speakerVoiceConfigs.map(config => config.speaker)
              }))
          };
          ctx.queueSave();
          ctx.setStage('audio');
      }
      catch (error) {
          ctx.invalidatePodcastAudio('audio-generation-failed');
          ctx.handleGenerationError(error, 'Audio generation failed', 'Try a shorter script or select a different TTS model.', generatePodcastAudio);
      }
      finally {
          ctx.setBusy(false);
      }
  }
  ctx.expose("generatePodcastAudio", generatePodcastAudio);
  async function generateVoiceTest(index) {
      const speaker = ctx.appState.speakers[index];
      if (!ctx.appState.connection.apiKey.trim())
          return ctx.showServiceError({ title: 'API key required', message: 'Add a Gemini API key before generating a voice test.', suggestion: 'Open connection settings.', details: '', retry: null });
      if (!ctx.getGeminiTtsVoice(speaker.geminiVoiceName))
          return ctx.showServiceError({ title: 'Voice selection required', message: 'This saved Gemini voice is unavailable.', suggestion: 'Select an available Gemini voice.', details: '', retry: null });
      ctx.hideServiceError();
      ctx.setBusy(true, 'voice', ctx.AUDIO_PROGRESS_MESSAGES);
      const prompt = `${speaker.deliveryInstructions || 'Speak naturally and clearly.'}\n${speaker.accent || ''}\nRead exactly: Hello, I am ${speaker.speakerName}. This is a short voice preview for the podcast.`;
      try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ctx.getTtsModel())}:generateContent`;
          const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.appState.connection.apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.geminiVoiceName } } } } }) });
          const data = await response.json();
          if (!response.ok)
              throw ctx.createApiError(response.status, data?.error?.message || 'Voice test failed.', JSON.stringify(data, null, 2));
          const part = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []).find(item => item?.inlineData?.data);
          if (!part)
              throw new Error('Gemini returned no voice-test audio.');
          const url = URL.createObjectURL(ctx.pcm16ToWavBlob(ctx.base64ToBytes(part.inlineData.data), ctx.sampleRateFromMimeType(part.inlineData.mimeType), 1));
          const audio = new Audio(url);
          audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
          await audio.play();
      }
      catch (error) {
          ctx.handleGenerationError(error, 'Voice test failed', 'Try another voice or TTS model.', () => ctx.generateVoiceTest(index));
      }
      finally {
          ctx.setBusy(false);
      }
  }
  ctx.expose("generateVoiceTest", generateVoiceTest);
}
