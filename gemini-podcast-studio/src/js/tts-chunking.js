export function installTtsChunking(services) {
  function hashTtsCacheValue(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function buildTtsChunkCacheKey({
    transcript,
    mappingSignature,
    index
  }) {
    return `tts-${index}-${hashTtsCacheValue(`${mappingSignature}\n${transcript}`)}`;
  }
  function createTtsChunks(script = services.appState.script, maxCharacters = services.appState.settings.maxTtsCharacters) {
    if (!Array.isArray(script?.segments) || !script.segments.length) return [];
    const safeLimit = Math.max(1, Number(maxCharacters) || services.DEFAULT_MAX_TTS_CHARACTERS);
    const chunks = [];
    let currentSegments = [];
    const createChunk = segments => {
      const chunkScript = {
        ...script,
        segments: services.deepClone(segments)
      };
      return {
        script: chunkScript,
        transcript: services.buildTtsTranscript(chunkScript)
      };
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
    if (currentSegments.length) chunks.push(createChunk(currentSegments));
    return chunks.map((chunk, index) => ({
      ...chunk,
      index
    }));
  }
  Object.assign(services, {
    hashTtsCacheValue,
    buildTtsChunkCacheKey,
    createTtsChunks
  });
  return services;
}
