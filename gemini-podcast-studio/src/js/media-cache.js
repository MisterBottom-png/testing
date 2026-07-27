export function installMediaCache(services) {
  const voicePreviewMemoryCache = new Map();
  let voicePreviewCacheBackend = services.createIndexedDbVoicePreviewCacheBackend();
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
  Object.assign(services, {
    voicePreviewMemoryCache,
    voicePreviewCacheBackend,
    setVoicePreviewCacheBackendForTests,
    readVoicePreviewCache,
    writeVoicePreviewCache,
    removeVoicePreviewCache,
    clearVoicePreviewCache
  });
  return services;
}
