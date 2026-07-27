export function installMediaCache(ctx) {
  const voicePreviewMemoryCache = new Map();
  ctx.expose("voicePreviewMemoryCache", voicePreviewMemoryCache);
  let voicePreviewCacheBackend = ctx.createIndexedDbVoicePreviewCacheBackend();
  ctx.defineMutable("voicePreviewCacheBackend", () => voicePreviewCacheBackend, value => { voicePreviewCacheBackend = value; });
  function setVoicePreviewCacheBackendForTests(backend) {
      voicePreviewCacheBackend = backend || ctx.createIndexedDbVoicePreviewCacheBackend();
      voicePreviewMemoryCache.clear();
  }
  ctx.expose("setVoicePreviewCacheBackendForTests", setVoicePreviewCacheBackendForTests);
  async function readVoicePreviewCache(cacheKey, backend = voicePreviewCacheBackend) {
      if (voicePreviewMemoryCache.has(cacheKey))
          return { record: voicePreviewMemoryCache.get(cacheKey), storageError: null };
      try {
          const record = await backend.get(cacheKey);
          if (record)
              voicePreviewMemoryCache.set(cacheKey, record);
          return { record, storageError: null };
      }
      catch (error) {
          return { record: null, storageError: error };
      }
  }
  ctx.expose("readVoicePreviewCache", readVoicePreviewCache);
  async function writeVoicePreviewCache(record, backend = voicePreviewCacheBackend) {
      voicePreviewMemoryCache.set(record.cacheKey, record);
      try {
          await backend.set(record);
          return null;
      }
      catch (error) {
          return error;
      }
  }
  ctx.expose("writeVoicePreviewCache", writeVoicePreviewCache);
  async function removeVoicePreviewCache(cacheKey, backend = voicePreviewCacheBackend) {
      voicePreviewMemoryCache.delete(cacheKey);
      try {
          await backend.delete(cacheKey);
          return null;
      }
      catch (error) {
          return error;
      }
  }
  ctx.expose("removeVoicePreviewCache", removeVoicePreviewCache);
  async function clearVoicePreviewCache(backend = voicePreviewCacheBackend) {
      voicePreviewMemoryCache.clear();
      try {
          await backend.clear();
          return null;
      }
      catch (error) {
          return error;
      }
  }
  ctx.expose("clearVoicePreviewCache", clearVoicePreviewCache);
}
