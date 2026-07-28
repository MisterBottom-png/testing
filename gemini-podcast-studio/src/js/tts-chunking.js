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
    const safeLimit = Math.min(services.MAX_TTS_CHUNK_CHARACTERS, Math.max(services.MIN_TTS_CHUNK_CHARACTERS, Number(maxCharacters) || services.DEFAULT_MAX_TTS_CHARACTERS));
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
    // Measure the exact text sent in contents.parts, not dialogue alone: every
    // candidate includes the repeated global directions and speaker profiles.
    for (const segment of script.segments) {
      if (createChunk([segment]).transcript.length > safeLimit) {
        throw new Error(`A single script segment exceeds the ${safeLimit.toLocaleString('en-GB')} character TTS chunk limit.`);
      }
    }

    const boundaryScore = index => {
      const previous = script.segments[index - 1];
      const next = script.segments[index];
      if (!previous || !next) return 0;
      const sectionBreak = previous.section != null && next.section != null && previous.section !== next.section;
      const speakerTurn = previous.speaker !== next.speaker;
      const sentenceEnd = /[.!?][\"')\]]?$/.test(String(previous.text || '').trim());
      return (sectionBreak ? 100 : 0) + (speakerTurn ? 10 : 0) + (sentenceEnd ? 1 : 0);
    };
    // Dynamic programming guarantees the fewest possible API requests first;
    // natural boundaries and fuller earlier chunks only break equal-count ties.
    const best = Array(script.segments.length + 1).fill(null);
    best[script.segments.length] = { count: 0, score: 0, end: script.segments.length };
    for (let start = script.segments.length - 1; start >= 0; start -= 1) {
      for (let end = start + 1; end <= script.segments.length; end += 1) {
        const chunk = createChunk(script.segments.slice(start, end));
        if (chunk.transcript.length > safeLimit) break;
        const remainder = best[end];
        if (!remainder) continue;
        const candidate = { count: remainder.count + 1, score: remainder.score + boundaryScore(end), end, chunk };
        const current = best[start];
        if (!current || candidate.count < current.count || (candidate.count === current.count && (candidate.score > current.score || (candidate.score === current.score && candidate.end > current.end)))) best[start] = candidate;
      }
    }
    const chunks = [];
    for (let start = 0; start < script.segments.length;) {
      const choice = best[start];
      chunks.push(choice.chunk);
      start = choice.end;
    }
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
