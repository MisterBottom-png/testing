export function installIndexedDb(services) {
  const VOICE_PREVIEW_DB_NAME = 'geminiPodcastStudio.voicePreviews.v1';
  const VOICE_PREVIEW_STORE_NAME = 'previews';
  let voicePreviewDatabasePromise = null;
  const TTS_CHUNK_DB_NAME = 'geminiPodcastStudio.ttsChunks.v1';
  const TTS_CHUNK_STORE_NAME = 'chunks';
  let ttsChunkDatabasePromise = null;
  function openVoicePreviewDatabase() {
    if (voicePreviewDatabasePromise) return voicePreviewDatabasePromise;
    voicePreviewDatabasePromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('IndexedDB is unavailable in this browser.'));
      const request = indexedDB.open(VOICE_PREVIEW_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(VOICE_PREVIEW_STORE_NAME)) database.createObjectStore(VOICE_PREVIEW_STORE_NAME, {
          keyPath: 'cacheKey'
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        voicePreviewDatabasePromise = null;
        reject(request.error || new Error('Voice preview cache could not be opened.'));
      };
      request.onblocked = () => reject(new Error('Voice preview cache is blocked by another browser tab.'));
    });
    return voicePreviewDatabasePromise;
  }
  function runVoicePreviewStoreRequest(mode, requestFactory) {
    return openVoicePreviewDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(VOICE_PREVIEW_STORE_NAME, mode);
      const store = transaction.objectStore(VOICE_PREVIEW_STORE_NAME);
      let request;
      try {
        request = requestFactory(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error('Voice preview cache operation failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Voice preview cache transaction was aborted.'));
    }));
  }
  function createIndexedDbVoicePreviewCacheBackend() {
    return {
      get: cacheKey => runVoicePreviewStoreRequest('readonly', store => store.get(cacheKey)),
      set: record => runVoicePreviewStoreRequest('readwrite', store => store.put(record)),
      delete: cacheKey => runVoicePreviewStoreRequest('readwrite', store => store.delete(cacheKey)),
      clear: () => runVoicePreviewStoreRequest('readwrite', store => store.clear())
    };
  }
  function openTtsChunkDatabase() {
    if (ttsChunkDatabasePromise) return ttsChunkDatabasePromise;
    ttsChunkDatabasePromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('IndexedDB is unavailable in this browser.'));
      const request = indexedDB.open(TTS_CHUNK_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(TTS_CHUNK_STORE_NAME)) database.createObjectStore(TTS_CHUNK_STORE_NAME, {
          keyPath: 'cacheKey'
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        ttsChunkDatabasePromise = null;
        reject(request.error || new Error('TTS chunk cache could not be opened.'));
      };
      request.onblocked = () => reject(new Error('TTS chunk cache is blocked by another browser tab.'));
    });
    return ttsChunkDatabasePromise;
  }
  function runTtsChunkStoreRequest(mode, requestFactory) {
    return openTtsChunkDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(TTS_CHUNK_STORE_NAME, mode);
      const store = transaction.objectStore(TTS_CHUNK_STORE_NAME);
      let request;
      try {
        request = requestFactory(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error('TTS chunk cache operation failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('TTS chunk cache transaction was aborted.'));
    }));
  }
  function createIndexedDbTtsChunkCacheBackend() {
    return {
      get: cacheKey => runTtsChunkStoreRequest('readonly', store => store.get(cacheKey)),
      set: record => runTtsChunkStoreRequest('readwrite', store => store.put(record)),
      delete: cacheKey => runTtsChunkStoreRequest('readwrite', store => store.delete(cacheKey)),
      clear: () => runTtsChunkStoreRequest('readwrite', store => store.clear()),
      keys: () => runTtsChunkStoreRequest('readonly', store => store.getAllKeys())
    };
  }
  Object.assign(services, {
    VOICE_PREVIEW_DB_NAME,
    VOICE_PREVIEW_STORE_NAME,
    voicePreviewDatabasePromise,
    openVoicePreviewDatabase,
    runVoicePreviewStoreRequest,
    createIndexedDbVoicePreviewCacheBackend,
    TTS_CHUNK_DB_NAME,
    TTS_CHUNK_STORE_NAME,
    ttsChunkDatabasePromise,
    openTtsChunkDatabase,
    runTtsChunkStoreRequest,
    createIndexedDbTtsChunkCacheBackend
  });
  return services;
}
