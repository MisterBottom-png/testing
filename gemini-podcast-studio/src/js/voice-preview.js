export function installVoicePreview(ctx) {
  const VOICE_PREVIEW_GENERATION_VERSION = 'voice-preview-v1';
  ctx.expose("VOICE_PREVIEW_GENERATION_VERSION", VOICE_PREVIEW_GENERATION_VERSION);
  const VOICE_PREVIEW_FAILURE_MESSAGE = 'Voice preview could not be generated. Check the API key, model availability or free-tier limit.';
  ctx.expose("VOICE_PREVIEW_FAILURE_MESSAGE", VOICE_PREVIEW_FAILURE_MESSAGE);
  const VOICE_PREVIEW_SENTENCES = Object.freeze({
      english: 'Hello. This is a preview of my podcast voice. You can change my voice, speaking style and character settings.',
      russian: 'Здравствуйте. Это предварительный пример моего голоса для подкаста. Вы можете изменить мой голос, стиль речи и настройки персонажа.',
      estonian: 'Tere. See on minu taskuhäälinguhääle eelvaade. Saate muuta minu häält, kõnestiili ja tegelase seadeid.',
      lithuanian: 'Sveiki. Tai mano tinklalaidės balso peržiūra. Galite pakeisti mano balsą, kalbėjimo stilių ir veikėjo nustatymus.',
      german: 'Hallo. Dies ist eine Vorschau meiner Podcast-Stimme. Sie können meine Stimme, meinen Sprechstil und die Charaktereinstellungen ändern.',
      french: 'Bonjour. Ceci est un aperçu de ma voix de podcast. Vous pouvez modifier ma voix, mon style d’élocution et les paramètres du personnage.',
      spanish: 'Hola. Esta es una vista previa de mi voz para el pódcast. Puedes cambiar mi voz, mi estilo de habla y la configuración del personaje.'
  });
  ctx.expose("VOICE_PREVIEW_SENTENCES", VOICE_PREVIEW_SENTENCES);
  const voicePreviewInFlightRequests = new Map();
  ctx.expose("voicePreviewInFlightRequests", voicePreviewInFlightRequests);
  const voicePreviewSpeakerTasks = new Map();
  ctx.expose("voicePreviewSpeakerTasks", voicePreviewSpeakerTasks);
  const activeVoicePreviewPlayback = new Map();
  ctx.expose("activeVoicePreviewPlayback", activeVoicePreviewPlayback);
  function normaliseVoicePreviewValue(value, { lowerCase = false } = {}) {
      const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
      return lowerCase ? text.toLocaleLowerCase() : text;
  }
  ctx.expose("normaliseVoicePreviewValue", normaliseVoicePreviewValue);
  function getVoicePreviewSentence(language) {
      const key = normaliseVoicePreviewValue(language, { lowerCase: true });
      return VOICE_PREVIEW_SENTENCES[key] || VOICE_PREVIEW_SENTENCES.english;
  }
  ctx.expose("getVoicePreviewSentence", getVoicePreviewSentence);
  function buildVoicePreviewPrompt({ language, deliveryInstructions }) {
      const languageName = normaliseVoicePreviewValue(language) || 'English';
      const languageKey = normaliseVoicePreviewValue(languageName, { lowerCase: true });
      const delivery = normaliseVoicePreviewValue(deliveryInstructions) || 'Speak naturally and clearly at a conversational pace.';
      const sentence = getVoicePreviewSentence(languageName);
      const translationInstruction = VOICE_PREVIEW_SENTENCES[languageKey]
          ? `Read the following text exactly in ${languageName}.`
          : `Translate the following neutral preview into ${languageName}, then speak only the translated preview.`;
      return `${delivery}\n${translationInstruction}\nDo not add an introduction, speaker name or explanation.\n\n${sentence}`;
  }
  ctx.expose("buildVoicePreviewPrompt", buildVoicePreviewPrompt);
  function hashVoicePreviewValue(value) {
      if (typeof ctx.hashTtsCacheValue === 'function')
          return ctx.hashTtsCacheValue(value);
      let hash = 2166136261;
      const text = String(value ?? '');
      for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
  }
  ctx.expose("hashVoicePreviewValue", hashVoicePreviewValue);
  function buildVoicePreviewDescriptor(speaker, { language = ctx.getLanguage(), ttsModel = ctx.getTtsModel() } = {}) {
      const descriptor = {
          version: VOICE_PREVIEW_GENERATION_VERSION,
          language: normaliseVoicePreviewValue(language) || 'English',
          geminiVoiceName: normaliseVoicePreviewValue(speaker?.geminiVoiceName),
          deliveryInstructions: normaliseVoicePreviewValue(speaker?.deliveryInstructions),
          ttsModel: normaliseVoicePreviewValue(ttsModel)
      };
      const stableKeyData = JSON.stringify({
          version: descriptor.version,
          language: normaliseVoicePreviewValue(descriptor.language, { lowerCase: true }),
          geminiVoiceName: normaliseVoicePreviewValue(descriptor.geminiVoiceName, { lowerCase: true }),
          deliveryInstructions: normaliseVoicePreviewValue(descriptor.deliveryInstructions, { lowerCase: true }),
          ttsModel: normaliseVoicePreviewValue(descriptor.ttsModel, { lowerCase: true })
      });
      return {
          ...descriptor,
          cacheKey: `voice-preview-${VOICE_PREVIEW_GENERATION_VERSION}-${hashVoicePreviewValue(stableKeyData)}`,
          prompt: buildVoicePreviewPrompt(descriptor)
      };
  }
  ctx.expose("buildVoicePreviewDescriptor", buildVoicePreviewDescriptor);
  function buildVoicePreviewRequestBody(descriptor) {
      return {
          contents: [{ role: 'user', parts: [{ text: descriptor.prompt }] }],
          generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                  voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: descriptor.geminiVoiceName }
                  }
              }
          }
      };
  }
  ctx.expose("buildVoicePreviewRequestBody", buildVoicePreviewRequestBody);
  function isValidVoicePreviewRecord(record, cacheKey = '') {
      return Boolean(record &&
          record.version === VOICE_PREVIEW_GENERATION_VERSION &&
          (!cacheKey || record.cacheKey === cacheKey) &&
          record.blob &&
          typeof record.blob.arrayBuffer === 'function' &&
          Number(record.blob.size) > 44);
  }
  ctx.expose("isValidVoicePreviewRecord", isValidVoicePreviewRecord);
  function getVoicePreviewState(index) {
      ctx.appState.voicePreviewStates ||= {};
      const key = ctx.appState.speakers[index]?.id || `host-${index + 1}`;
      ctx.appState.voicePreviewStates[key] ||= { status: 'idle', cacheKey: '', message: '' };
      return ctx.appState.voicePreviewStates[key];
  }
  ctx.expose("getVoicePreviewState", getVoicePreviewState);
  function setVoicePreviewState(index, nextState) {
      const state = getVoicePreviewState(index);
      Object.assign(state, nextState);
      updateVoicePreviewControl(index);
      return state;
  }
  ctx.expose("setVoicePreviewState", setVoicePreviewState);
  function releaseVoicePreviewPlayback(index) {
      const active = activeVoicePreviewPlayback.get(index);
      if (!active)
          return;
      try {
          active.audio.pause();
      }
      catch { }
      try {
          URL.revokeObjectURL(active.url);
      }
      catch { }
      activeVoicePreviewPlayback.delete(index);
  }
  ctx.expose("releaseVoicePreviewPlayback", releaseVoicePreviewPlayback);
  function releaseAllVoicePreviewPlayback() {
      for (const index of [...activeVoicePreviewPlayback.keys()])
          releaseVoicePreviewPlayback(index);
  }
  ctx.expose("releaseAllVoicePreviewPlayback", releaseAllVoicePreviewPlayback);
  function resetVoicePreviewState(index, reason = '') {
      releaseVoicePreviewPlayback(index);
      return setVoicePreviewState(index, { status: 'idle', cacheKey: '', message: reason });
  }
  ctx.expose("resetVoicePreviewState", resetVoicePreviewState);
  function resetAllVoicePreviewStates(reason = '') {
      ctx.appState.voicePreviewStates = {};
      releaseAllVoicePreviewPlayback();
      ctx.appState.speakers.forEach((_, index) => updateVoicePreviewControl(index, reason));
  }
  ctx.expose("resetAllVoicePreviewStates", resetAllVoicePreviewStates);
  function getCurrentVoicePreviewDescriptor(index) {
      const speaker = ctx.appState.speakers[index];
      if (!speaker)
          return null;
      return buildVoicePreviewDescriptor(speaker);
  }
  ctx.expose("getCurrentVoicePreviewDescriptor", getCurrentVoicePreviewDescriptor);
  function isVoicePreviewSelectionValid(index) {
      const speaker = ctx.appState.speakers[index];
      const voice = ctx.getGeminiTtsVoice(speaker?.geminiVoiceName);
      return Boolean(voice && voice.gender === speaker.gender && voice.type === speaker.voiceType);
  }
  ctx.expose("isVoicePreviewSelectionValid", isVoicePreviewSelectionValid);
  function invalidateStaleVoicePreviewState(index, reason = '') {
      const state = getVoicePreviewState(index);
      const descriptor = getCurrentVoicePreviewDescriptor(index);
      if (!state.cacheKey || !descriptor || state.cacheKey === descriptor.cacheKey) {
          updateVoicePreviewControl(index);
          return false;
      }
      resetVoicePreviewState(index, reason);
      return true;
  }
  ctx.expose("invalidateStaleVoicePreviewState", invalidateStaleVoicePreviewState);
  function invalidateAllStaleVoicePreviewStates(reason = '') {
      return ctx.appState.speakers.map((_, index) => invalidateStaleVoicePreviewState(index, reason)).some(Boolean);
  }
  ctx.expose("invalidateAllStaleVoicePreviewStates", invalidateAllStaleVoicePreviewStates);
  function updateVoicePreviewControl(index, fallbackMessage = '') {
      const button = document.getElementById(`speakerPreview${index}`);
      if (!button)
          return;
      const speaker = ctx.appState.speakers[index];
      const validSelection = isVoicePreviewSelectionValid(index);
      const descriptor = validSelection ? getCurrentVoicePreviewDescriptor(index) : null;
      const state = getVoicePreviewState(index);
      const currentState = state.cacheKey && descriptor && state.cacheKey !== descriptor.cacheKey
          ? { status: 'idle', cacheKey: '', message: '' }
          : state;
      const loading = currentState.status === 'loading';
      const label = loading ? 'Generating preview…' : currentState.status === 'ready' ? 'Replay preview' : currentState.status === 'error' ? 'Try preview again' : 'Preview voice';
      button.dataset.speakerPreviewIndex = String(index);
      button.disabled = !validSelection || loading;
      button.setAttribute('aria-disabled', String(button.disabled));
      button.setAttribute('aria-busy', String(loading));
      button.setAttribute('aria-describedby', `speakerPreviewStatus${index}`);
      button.setAttribute('aria-label', `${label} for Host ${index + 1}${speaker?.geminiVoiceName ? ` using ${speaker.geminiVoiceName}` : ''}`);
      button.innerHTML = loading ? `<span class="spinner" aria-hidden="true"></span><span>${label}</span>` : label;
      let status = document.getElementById(`speakerPreviewStatus${index}`);
      if (!status) {
          status = document.createElement('p');
          status.id = `speakerPreviewStatus${index}`;
          status.className = 'field-help';
          status.setAttribute('role', 'status');
          status.setAttribute('aria-live', 'polite');
          button.insertAdjacentElement('afterend', status);
      }
      status.classList.toggle('field-error', currentState.status === 'error');
      status.textContent = currentState.message || fallbackMessage || (!validSelection
          ? 'Select a valid Gemini voice to generate a preview.'
          : currentState.status === 'ready'
              ? 'Preview is cached locally and ready to replay.'
              : `Generate a short preview in ${ctx.getLanguage()}.`);
  }
  ctx.expose("updateVoicePreviewControl", updateVoicePreviewControl);
  function enhanceVoicePreviewControls() {
      ctx.appState.speakers.forEach((_, index) => {
          const existingHelp = document.getElementById(`speakerPreview${index}`)?.parentElement?.querySelector('.field-help');
          if (existingHelp && existingHelp.id !== `speakerPreviewStatus${index}`)
              existingHelp.remove();
          invalidateStaleVoicePreviewState(index);
          updateVoicePreviewControl(index);
      });
  }
  ctx.expose("enhanceVoicePreviewControls", enhanceVoicePreviewControls);
  async function playVoicePreviewBlob(index, blob) {
      if (!isValidVoicePreviewRecord({ version: VOICE_PREVIEW_GENERATION_VERSION, cacheKey: 'playback', blob }, 'playback'))
          throw new Error('Voice preview audio is unreadable.');
      if (typeof Audio !== 'function' || !URL?.createObjectURL)
          throw new Error('This browser cannot play locally generated audio previews.');
      releaseVoicePreviewPlayback(index);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeVoicePreviewPlayback.set(index, { audio, url });
      const cleanup = () => {
          if (activeVoicePreviewPlayback.get(index)?.audio === audio)
              activeVoicePreviewPlayback.delete(index);
          try {
              URL.revokeObjectURL(url);
          }
          catch { }
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      try {
          await audio.play();
          return audio;
      }
      catch (error) {
          cleanup();
          throw new Error(`Voice preview playback failed: ${error?.message || error}`);
      }
  }
  ctx.expose("playVoicePreviewBlob", playVoicePreviewBlob);
  async function requestVoicePreviewRecord(descriptor, fetchImpl = fetch) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(descriptor.ttsModel)}:generateContent`;
      const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.appState.connection.apiKey },
          body: JSON.stringify(buildVoicePreviewRequestBody(descriptor))
      });
      const raw = await response.text();
      let data;
      try {
          data = JSON.parse(raw);
      }
      catch {
          throw ctx.createApiError(response.status, 'Gemini returned non-JSON voice-preview data.', raw);
      }
      if (!response.ok)
          throw ctx.createApiError(response.status, data?.error?.message || `Voice preview failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
      const part = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []).find(item => item?.inlineData?.data);
      if (!part)
          throw ctx.createApiError(response.status, 'Gemini returned an empty voice-preview audio response.', JSON.stringify(data, null, 2));
      const pcmBytes = ctx.base64ToBytes(part.inlineData.data);
      if (pcmBytes.byteLength < 2)
          throw new Error('Gemini returned empty voice-preview audio.');
      const sampleRate = ctx.sampleRateFromMimeType(part.inlineData.mimeType);
      const blob = ctx.pcm16ToWavBlob(pcmBytes, sampleRate, 1);
      if (!blob || blob.size <= 44)
          throw new Error('Gemini returned invalid voice-preview audio.');
      return {
          cacheKey: descriptor.cacheKey,
          version: VOICE_PREVIEW_GENERATION_VERSION,
          language: descriptor.language,
          geminiVoiceName: descriptor.geminiVoiceName,
          deliveryInstructions: descriptor.deliveryInstructions,
          ttsModel: descriptor.ttsModel,
          sampleRate,
          blob,
          createdAt: new Date().toISOString()
      };
  }
  ctx.expose("requestVoicePreviewRecord", requestVoicePreviewRecord);
  async function getOrGenerateVoicePreviewRecord(descriptor, { fetchImpl = fetch, cacheBackend = ctx.voicePreviewCacheBackend } = {}) {
      if (voicePreviewInFlightRequests.has(descriptor.cacheKey))
          return voicePreviewInFlightRequests.get(descriptor.cacheKey);
      const task = (async () => {
          const record = await requestVoicePreviewRecord(descriptor, fetchImpl);
          const storageError = await ctx.writeVoicePreviewCache(record, cacheBackend);
          return { record, storageError };
      })();
      voicePreviewInFlightRequests.set(descriptor.cacheKey, task);
      try {
          return await task;
      }
      finally {
          voicePreviewInFlightRequests.delete(descriptor.cacheKey);
      }
  }
  ctx.expose("getOrGenerateVoicePreviewRecord", getOrGenerateVoicePreviewRecord);
  function showVoicePreviewFailure(index, descriptor, error) {
      const currentDescriptor = getCurrentVoicePreviewDescriptor(index);
      if (descriptor && currentDescriptor && currentDescriptor.cacheKey !== descriptor.cacheKey)
          return false;
      setVoicePreviewState(index, { status: 'error', cacheKey: descriptor?.cacheKey || '', message: VOICE_PREVIEW_FAILURE_MESSAGE });
      ctx.announce(`Voice preview for Host ${index + 1} could not be generated.`);
      const mapped = ctx.mapError(error);
      ctx.showServiceError({
          title: 'Voice preview could not be generated',
          message: 'Voice preview could not be generated.',
          suggestion: 'Check the API key, model availability or free-tier limit.',
          details: `${mapped.message}${mapped.suggestion ? `\n${mapped.suggestion}` : ''}\n\n${error?.details || error?.stack || String(error)}`,
          retry: null
      });
      return false;
  }
  ctx.expose("showVoicePreviewFailure", showVoicePreviewFailure);
  async function runVoicePreview(index, options = {}) {
      const speaker = ctx.appState.speakers[index];
      if (!speaker)
          return false;
      const descriptor = buildVoicePreviewDescriptor(speaker);
      if (!ctx.appState.connection.apiKey.trim())
          return showVoicePreviewFailure(index, descriptor, new Error('A Gemini API key is required.'));
      if (!isVoicePreviewSelectionValid(index))
          return showVoicePreviewFailure(index, descriptor, new Error('Select a valid Gemini voice before generating a preview.'));
      if (!descriptor.ttsModel)
          return showVoicePreviewFailure(index, descriptor, new Error('Select a valid Gemini TTS model.'));
      ctx.hideServiceError();
      setVoicePreviewState(index, { status: 'loading', cacheKey: descriptor.cacheKey, message: 'Generating preview…' });
      ctx.announce(`Generating voice preview for Host ${index + 1}.`);
      const cacheBackend = options.cacheBackend || ctx.voicePreviewCacheBackend;
      const player = options.player || playVoicePreviewBlob;
      const cacheRead = await ctx.readVoicePreviewCache(descriptor.cacheKey, cacheBackend);
      if (cacheRead.record) {
          if (!isValidVoicePreviewRecord(cacheRead.record, descriptor.cacheKey)) {
              await ctx.removeVoicePreviewCache(descriptor.cacheKey, cacheBackend);
          }
          else {
              try {
                  await player(index, cacheRead.record.blob);
                  if (getCurrentVoicePreviewDescriptor(index)?.cacheKey !== descriptor.cacheKey)
                      return resetVoicePreviewState(index);
                  setVoicePreviewState(index, { status: 'ready', cacheKey: descriptor.cacheKey, message: 'Preview is cached locally and ready to replay.' });
                  ctx.announce(`Voice preview for Host ${index + 1} is ready and playing.`);
                  return true;
              }
              catch {
                  await ctx.removeVoicePreviewCache(descriptor.cacheKey, cacheBackend);
              }
          }
      }
      try {
          const { record, storageError } = await getOrGenerateVoicePreviewRecord(descriptor, { fetchImpl: options.fetchImpl || fetch, cacheBackend });
          if (getCurrentVoicePreviewDescriptor(index)?.cacheKey !== descriptor.cacheKey)
              return resetVoicePreviewState(index);
          try {
              await player(index, record.blob);
          }
          catch (error) {
              await ctx.removeVoicePreviewCache(descriptor.cacheKey, cacheBackend);
              throw error;
          }
          const readyMessage = storageError
              ? 'Preview is ready, but browser storage was unavailable, so it is cached only for this session.'
              : 'Preview is cached locally and ready to replay.';
          setVoicePreviewState(index, { status: 'ready', cacheKey: descriptor.cacheKey, message: readyMessage });
          ctx.announce(`Voice preview for Host ${index + 1} is ready and playing.`);
          return true;
      }
      catch (error) {
          return showVoicePreviewFailure(index, descriptor, error);
      }
  }
  ctx.expose("runVoicePreview", runVoicePreview);
  function generateVoicePreview(index, options = {}) {
      const speakerId = ctx.appState.speakers[index]?.id || `host-${index + 1}`;
      if (voicePreviewSpeakerTasks.has(speakerId))
          return voicePreviewSpeakerTasks.get(speakerId);
      const task = runVoicePreview(index, options);
      voicePreviewSpeakerTasks.set(speakerId, task);
      task.finally(() => {
          if (voicePreviewSpeakerTasks.get(speakerId) === task)
              voicePreviewSpeakerTasks.delete(speakerId);
      });
      return task;
  }
  ctx.expose("generateVoicePreview", generateVoicePreview);
  const renderSpeakerCardsWithoutVoicePreview = ctx.renderSpeakerCards;
  ctx.expose("renderSpeakerCardsWithoutVoicePreview", renderSpeakerCardsWithoutVoicePreview);
  ctx.renderSpeakerCards = function renderSpeakerCardsWithVoicePreview() {
      renderSpeakerCardsWithoutVoicePreview();
      enhanceVoicePreviewControls();
  };
  const resetProjectWithoutVoicePreview = ctx.resetProject;
  ctx.expose("resetProjectWithoutVoicePreview", resetProjectWithoutVoicePreview);
  ctx.resetProject = function resetProjectWithVoicePreview(options) {
      resetAllVoicePreviewStates();
      return resetProjectWithoutVoicePreview(options);
  };
  if (typeof ctx.generateVoiceTest === 'function')
      ctx.generateVoiceTest = generateVoicePreview;
  ctx.els.speakerList.addEventListener('click', event => {
      const button = event.target.closest('[data-speaker-preview-index]');
      if (!button || button.disabled)
          return;
      generateVoicePreview(Number(button.dataset.speakerPreviewIndex));
  });
  ctx.els.createForm.addEventListener('input', event => {
      if (event.target === ctx.els.language || event.target === ctx.els.customLanguage)
          queueMicrotask(() => invalidateAllStaleVoicePreviewStates('Podcast language changed. Generate a new preview.'));
  });
  ctx.els.speakerList.addEventListener('input', event => {
      const card = event.target.closest('[data-speaker-index]');
      if (!card || event.target.dataset.speakerField !== 'deliveryInstructions')
          return;
      queueMicrotask(() => invalidateStaleVoicePreviewState(Number(card.dataset.speakerIndex), 'Delivery instructions changed. Generate a new preview.'));
  });
  ctx.els.speakerList.addEventListener('change', event => {
      const card = event.target.closest('[data-speaker-index]');
      if (!card || !['gender', 'voiceType', 'geminiVoiceName'].includes(event.target.dataset.speakerField))
          return;
      queueMicrotask(() => invalidateStaleVoicePreviewState(Number(card.dataset.speakerIndex), 'Voice selection changed. Generate a new preview.'));
  });
  for (const formHost of [ctx.els.connectionSetupForm, ctx.els.connectionSettingsForm]) {
      formHost.addEventListener('change', () => queueMicrotask(() => invalidateAllStaleVoicePreviewStates('TTS model changed. Generate a new preview.')));
  }
  ctx.els.clearStoredDataButton.addEventListener('click', () => {
      resetAllVoicePreviewStates();
      ctx.clearVoicePreviewCache().catch(error => console.warn('Voice preview cache could not be cleared.', error));
  });
  window.addEventListener('beforeunload', releaseAllVoicePreviewPlayback);
}
