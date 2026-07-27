export function installTtsChunking(ctx) {
  function buildSpeakerVoiceConfigs(speakers = ctx.appState.speakers) {
      return (Array.isArray(speakers) ? speakers : []).map(speaker => ({
          speaker: ctx.normaliseWhitespace(speaker.speakerName),
          voiceConfig: { prebuiltVoiceConfig: { voiceName: ctx.normaliseWhitespace(speaker.geminiVoiceName) } }
      }));
  }
  ctx.expose("buildSpeakerVoiceConfigs", buildSpeakerVoiceConfigs);
  function getSpeakerVoiceMappingSignature(speakers = ctx.appState.speakers) {
      return JSON.stringify((Array.isArray(speakers) ? speakers : []).map(speaker => ({
          id: speaker.id,
          speakerName: ctx.normaliseWhitespace(speaker.speakerName),
          geminiVoiceName: ctx.normaliseWhitespace(speaker.geminiVoiceName)
      })));
  }
  ctx.expose("getSpeakerVoiceMappingSignature", getSpeakerVoiceMappingSignature);
  function hashTtsCacheValue(value) {
      let hash = 2166136261;
      const text = String(value ?? '');
      for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
  }
  ctx.expose("hashTtsCacheValue", hashTtsCacheValue);
  function buildTtsChunkCacheKey({ transcript, mappingSignature, index }) {
      return `tts-${index}-${hashTtsCacheValue(`${mappingSignature}\n${transcript}`)}`;
  }
  ctx.expose("buildTtsChunkCacheKey", buildTtsChunkCacheKey);
  function buildTtsRequestBody(transcript, speakerVoiceConfigs) {
      return {
          contents: [{ role: 'user', parts: [{ text: transcript }] }],
          generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                  multiSpeakerVoiceConfig: {
                      speakerVoiceConfigs: ctx.deepClone(speakerVoiceConfigs)
                  }
              }
          }
      };
  }
  ctx.expose("buildTtsRequestBody", buildTtsRequestBody);
  function createTtsChunks(script = ctx.appState.script, maxCharacters = ctx.appState.settings.maxTtsCharacters) {
      if (!Array.isArray(script?.segments) || !script.segments.length)
          return [];
      const safeLimit = Math.max(1, Number(maxCharacters) || ctx.DEFAULT_MAX_TTS_CHARACTERS);
      const chunks = [];
      let currentSegments = [];
      const createChunk = segments => {
          const chunkScript = { ...script, segments: ctx.deepClone(segments) };
          return { script: chunkScript, transcript: ctx.buildTtsTranscript(chunkScript) };
      };
      for (const segment of script.segments) {
          const candidateSegments = [...currentSegments, segment];
          const candidate = createChunk(candidateSegments);
          if (candidate.transcript.length <= safeLimit) {
              currentSegments = candidateSegments;
              continue;
          }
          if (!currentSegments.length) {
              throw new Error(`A single script segment exceeds the ${safeLimit.toLocaleString('en-GB')} character TTS chunk limit.`);
          }
          chunks.push(createChunk(currentSegments));
          currentSegments = [segment];
          const singleSegmentChunk = createChunk(currentSegments);
          if (singleSegmentChunk.transcript.length > safeLimit) {
              throw new Error(`A single script segment exceeds the ${safeLimit.toLocaleString('en-GB')} character TTS chunk limit.`);
          }
      }
      if (currentSegments.length)
          chunks.push(createChunk(currentSegments));
      return chunks.map((chunk, index) => ({ ...chunk, index }));
  }
  ctx.expose("createTtsChunks", createTtsChunks);
}
