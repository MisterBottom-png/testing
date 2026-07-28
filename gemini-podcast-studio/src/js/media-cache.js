export function installMediaCache(services) {
  const voicePreviewMemoryCache = new Map();
  const ttsChunkMemoryCache = new Map();
  let voicePreviewCacheBackend = services.createIndexedDbVoicePreviewCacheBackend();
  let ttsChunkCacheBackend = services.createIndexedDbTtsChunkCacheBackend();
  function setVoicePreviewCacheBackendForTests(backend) {
    services.voicePreviewCacheBackend = backend || services.createIndexedDbVoicePreviewCacheBackend();
    voicePreviewMemoryCache.clear();
  }
  async function readVoicePreviewCache(cacheKey, backend = services.voicePreviewCacheBackend) {
    if (voicePreviewMemoryCache.has(cacheKey)) return {
      record: voicePreviewMemoryCache.get(cacheKey),
      storageError: null
    };
    try {
      const record = await backend.get(cacheKey);
      if (record) voicePreviewMemoryCache.set(cacheKey, record);
      return {
        record,
        storageError: null
      };
    } catch (error) {
      return {
        record: null,
        storageError: error
      };
    }
  }
  async function writeVoicePreviewCache(record, backend = services.voicePreviewCacheBackend) {
    voicePreviewMemoryCache.set(record.cacheKey, record);
    try {
      await backend.set(record);
      return null;
    } catch (error) {
      return error;
    }
  }
  async function removeVoicePreviewCache(cacheKey, backend = services.voicePreviewCacheBackend) {
    voicePreviewMemoryCache.delete(cacheKey);
    try {
      await backend.delete(cacheKey);
      return null;
    } catch (error) {
      return error;
    }
  }
  async function clearVoicePreviewCache(backend = services.voicePreviewCacheBackend) {
    voicePreviewMemoryCache.clear();
    try {
      await backend.clear();
      return null;
    } catch (error) {
      return error;
    }
  }
  function setTtsChunkCacheBackendForTests(backend) {
    services.ttsChunkCacheBackend = backend || services.createIndexedDbTtsChunkCacheBackend();
    ttsChunkMemoryCache.clear();
  }
  function isValidTtsChunkCacheRecord(record, cacheKey) {
    const bytes = record?.pcmBytes;
    return record?.cacheKey === cacheKey
      && Number.isFinite(record.sampleRate) && record.sampleRate > 0
      && (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)
      && bytes.byteLength > 0 && bytes.byteLength % 2 === 0;
  }
  async function removeTtsChunkCache(cacheKey, backend = services.ttsChunkCacheBackend) {
    ttsChunkMemoryCache.delete(cacheKey);
    try {
      await backend.delete(cacheKey);
      return null;
    } catch (error) {
      return error;
    }
  }
  async function readTtsChunkCache(cacheKey, backend = services.ttsChunkCacheBackend) {
    let record = ttsChunkMemoryCache.get(cacheKey) || null;
    try {
      record ||= await backend.get(cacheKey);
    } catch (error) {
      return { record: null, storageError: error };
    }
    if (!record) return { record: null, storageError: null };
    if (!isValidTtsChunkCacheRecord(record, cacheKey)) {
      return { record: null, storageError: await removeTtsChunkCache(cacheKey, backend) };
    }
    const normalised = { ...record, pcmBytes: new Uint8Array(record.pcmBytes) };
    ttsChunkMemoryCache.set(cacheKey, normalised);
    return { record: normalised, storageError: null };
  }
  async function writeTtsChunkCache(record, backend = services.ttsChunkCacheBackend) {
    if (!isValidTtsChunkCacheRecord(record, record?.cacheKey)) return new Error('Invalid TTS chunk cache record.');
    const normalised = { ...record, pcmBytes: new Uint8Array(record.pcmBytes) };
    ttsChunkMemoryCache.set(record.cacheKey, normalised);
    try {
      await backend.set(normalised);
      return null;
    } catch (error) {
      return error;
    }
  }
  async function retainTtsChunkCache(cacheKeys, backend = services.ttsChunkCacheBackend) {
    const retained = new Set(cacheKeys);
    for (const cacheKey of ttsChunkMemoryCache.keys()) {
      if (!retained.has(cacheKey)) ttsChunkMemoryCache.delete(cacheKey);
    }
    try {
      const storedKeys = await backend.keys();
      await Promise.all((storedKeys || []).filter(cacheKey => !retained.has(cacheKey)).map(cacheKey => backend.delete(cacheKey)));
      return null;
    } catch (error) {
      return error;
    }
  }
  Object.assign(services, {
    voicePreviewMemoryCache,
    voicePreviewCacheBackend,
    setVoicePreviewCacheBackendForTests,
    readVoicePreviewCache,
    writeVoicePreviewCache,
    removeVoicePreviewCache,
    clearVoicePreviewCache,
    ttsChunkMemoryCache,
    ttsChunkCacheBackend,
    setTtsChunkCacheBackendForTests,
    isValidTtsChunkCacheRecord,
    readTtsChunkCache,
    writeTtsChunkCache,
    removeTtsChunkCache,
    retainTtsChunkCache
  });
  return services;
}
