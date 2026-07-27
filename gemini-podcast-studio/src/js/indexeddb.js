export function installIndexeddb(ctx) {
  const VOICE_PREVIEW_DB_NAME = 'geminiPodcastStudio.voicePreviews.v1';
  ctx.expose("VOICE_PREVIEW_DB_NAME", VOICE_PREVIEW_DB_NAME);
  const VOICE_PREVIEW_STORE_NAME = 'previews';
  ctx.expose("VOICE_PREVIEW_STORE_NAME", VOICE_PREVIEW_STORE_NAME);
  let voicePreviewDatabasePromise = null;
  ctx.defineMutable("voicePreviewDatabasePromise", () => voicePreviewDatabasePromise, value => { voicePreviewDatabasePromise = value; });
  function openVoicePreviewDatabase() {
      if (voicePreviewDatabasePromise)
          return voicePreviewDatabasePromise;
      voicePreviewDatabasePromise = new Promise((resolve, reject) => {
          if (!globalThis.indexedDB)
              return reject(new Error('IndexedDB is unavailable in this browser.'));
          const request = indexedDB.open(VOICE_PREVIEW_DB_NAME, 1);
          request.onupgradeneeded = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains(VOICE_PREVIEW_STORE_NAME))
                  database.createObjectStore(VOICE_PREVIEW_STORE_NAME, { keyPath: 'cacheKey' });
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
  ctx.expose("openVoicePreviewDatabase", openVoicePreviewDatabase);
  function runVoicePreviewStoreRequest(mode, requestFactory) {
      return openVoicePreviewDatabase().then(database => new Promise((resolve, reject) => {
          const transaction = database.transaction(VOICE_PREVIEW_STORE_NAME, mode);
          const store = transaction.objectStore(VOICE_PREVIEW_STORE_NAME);
          let request;
          try {
              request = requestFactory(store);
          }
          catch (error) {
              reject(error);
              return;
          }
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error || new Error('Voice preview cache operation failed.'));
          transaction.onabort = () => reject(transaction.error || new Error('Voice preview cache transaction was aborted.'));
      }));
  }
  ctx.expose("runVoicePreviewStoreRequest", runVoicePreviewStoreRequest);
  function createIndexedDbVoicePreviewCacheBackend() {
      return {
          get: cacheKey => runVoicePreviewStoreRequest('readonly', store => store.get(cacheKey)),
          set: record => runVoicePreviewStoreRequest('readwrite', store => store.put(record)),
          delete: cacheKey => runVoicePreviewStoreRequest('readwrite', store => store.delete(cacheKey)),
          clear: () => runVoicePreviewStoreRequest('readwrite', store => store.clear())
      };
  }
  ctx.expose("createIndexedDbVoicePreviewCacheBackend", createIndexedDbVoicePreviewCacheBackend);
}
