export function installConversationPreview(ctx) {
  const CONVERSATION_PREVIEW_TEMPLATE_VERSION = 'conversation-preview-v1';
  ctx.expose("CONVERSATION_PREVIEW_TEMPLATE_VERSION", CONVERSATION_PREVIEW_TEMPLATE_VERSION);
  const CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION = 'wav-pcm16-mono-v1';
  ctx.expose("CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION", CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION);
  const CONVERSATION_PREVIEW_FAILURE_MESSAGE = 'Conversation preview could not be generated. Check the speaker settings, API key, model availability or free-tier limit.';
  ctx.expose("CONVERSATION_PREVIEW_FAILURE_MESSAGE", CONVERSATION_PREVIEW_FAILURE_MESSAGE);
  const CONVERSATION_PREVIEW_TEMPLATES = Object.freeze({
      english: Object.freeze([
          'Welcome to the show. This short exchange will help us compare how our voices sound together.',
          'Thank you. Listen for the contrast in clarity, pacing, and natural delivery.',
          'A useful pair should remain easy to distinguish, even during a quick response.',
          'Exactly. If both voices feel clear and balanced, the conversation is ready.'
      ]),
      russian: Object.freeze([
          'Добро пожаловать на шоу. Этот короткий диалог поможет сравнить, как наши голоса звучат вместе.',
          'Спасибо. Обратите внимание на различия в ясности, темпе и естественности речи.',
          'Хорошая пара голосов должна легко различаться даже во время быстрого ответа.',
          'Именно. Если оба голоса звучат ясно и сбалансированно, разговор готов.'
      ]),
      estonian: Object.freeze([
          'Tere tulemast saatesse. See lühike vestlus aitab võrrelda, kuidas meie hääled koos kõlavad.',
          'Aitäh. Kuulake erinevusi selguses, tempos ja loomulikus esituses.',
          'Hea häälepaar peaks olema kergesti eristatav ka kiire vastuse ajal.',
          'Täpselt. Kui mõlemad hääled kõlavad selgelt ja tasakaalustatult, on vestlus valmis.'
      ]),
      lithuanian: Object.freeze([
          'Sveiki atvykę į laidą. Šis trumpas pokalbis padės palyginti, kaip mūsų balsai skamba kartu.',
          'Ačiū. Atkreipkite dėmesį į aiškumo, tempo ir natūralaus pateikimo skirtumus.',
          'Gera balsų pora turėtų būti lengvai atskiriama net per greitą atsakymą.',
          'Būtent. Jei abu balsai skamba aiškiai ir darniai, pokalbis paruoštas.'
      ]),
      german: Object.freeze([
          'Willkommen zur Sendung. Dieser kurze Austausch hilft uns zu vergleichen, wie unsere Stimmen zusammen klingen.',
          'Danke. Achten Sie auf die Unterschiede bei Klarheit, Tempo und natürlicher Sprechweise.',
          'Ein gutes Stimmenpaar sollte auch bei einer schnellen Antwort leicht zu unterscheiden sein.',
          'Genau. Wenn beide Stimmen klar und ausgewogen wirken, ist das Gespräch bereit.'
      ]),
      french: Object.freeze([
          'Bienvenue dans l’émission. Ce court échange nous aidera à comparer la façon dont nos voix sonnent ensemble.',
          'Merci. Écoutez les différences de clarté, de rythme et de naturel.',
          'Une bonne paire de voix doit rester facile à distinguer, même pendant une réponse rapide.',
          'Exactement. Si les deux voix sont claires et équilibrées, la conversation est prête.'
      ]),
      spanish: Object.freeze([
          'Bienvenidos al programa. Este breve intercambio nos ayudará a comparar cómo suenan nuestras voces juntas.',
          'Gracias. Escucha las diferencias de claridad, ritmo y naturalidad.',
          'Una buena pareja de voces debe distinguirse con facilidad incluso durante una respuesta rápida.',
          'Exactamente. Si ambas voces suenan claras y equilibradas, la conversación está lista.'
      ])
  });
  ctx.expose("CONVERSATION_PREVIEW_TEMPLATES", CONVERSATION_PREVIEW_TEMPLATES);
  let conversationPreviewTask = null;
  ctx.defineMutable("conversationPreviewTask", () => conversationPreviewTask, value => { conversationPreviewTask = value; });
  let conversationPreviewDuplicateApprovalSignature = '';
  ctx.defineMutable("conversationPreviewDuplicateApprovalSignature", () => conversationPreviewDuplicateApprovalSignature, value => { conversationPreviewDuplicateApprovalSignature = value; });
  let activeConversationPreviewPlayback = null;
  ctx.defineMutable("activeConversationPreviewPlayback", () => activeConversationPreviewPlayback, value => { activeConversationPreviewPlayback = value; });
  function getConversationPreviewState() {
      ctx.appState.conversationPreviewState ||= {
          status: 'idle',
          cacheKey: '',
          message: '',
          duplicateWarningVisible: false
      };
      return ctx.appState.conversationPreviewState;
  }
  ctx.expose("getConversationPreviewState", getConversationPreviewState);
  function setConversationPreviewState(nextState) {
      Object.assign(getConversationPreviewState(), nextState);
      updateConversationPreviewControl();
      return getConversationPreviewState();
  }
  ctx.expose("setConversationPreviewState", setConversationPreviewState);
  function stableSerialiseConversationPreview(value) {
      if (Array.isArray(value))
          return `[${value.map(stableSerialiseConversationPreview).join(',')}]`;
      if (value && typeof value === 'object') {
          return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialiseConversationPreview(value[key])}`).join(',')}}`;
      }
      return JSON.stringify(value);
  }
  ctx.expose("stableSerialiseConversationPreview", stableSerialiseConversationPreview);
  function getConversationPreviewTemplate(language) {
      const key = ctx.normaliseVoicePreviewValue(language, { lowerCase: true });
      return CONVERSATION_PREVIEW_TEMPLATES[key] || CONVERSATION_PREVIEW_TEMPLATES.english;
  }
  ctx.expose("getConversationPreviewTemplate", getConversationPreviewTemplate);
  function buildConversationPreviewDialogue({ language = ctx.getLanguage(), speakers = ctx.appState.speakers } = {}) {
      const source = Array.isArray(speakers) ? speakers : [];
      const [first = {}, second = {}] = source;
      const template = getConversationPreviewTemplate(language);
      return [
          { speaker: ctx.normaliseWhitespace(first.speakerName), text: template[0] },
          { speaker: ctx.normaliseWhitespace(second.speakerName), text: template[1] },
          { speaker: ctx.normaliseWhitespace(first.speakerName), text: template[2] },
          { speaker: ctx.normaliseWhitespace(second.speakerName), text: template[3] }
      ];
  }
  ctx.expose("buildConversationPreviewDialogue", buildConversationPreviewDialogue);
  function validateConversationPreviewDialogue(dialogue, speakers = ctx.appState.speakers) {
      const configuredNames = (Array.isArray(speakers) ? speakers : []).map(speaker => ctx.normaliseWhitespace(speaker.speakerName));
      const configuredSet = new Set(configuredNames);
      const issues = [];
      if (!Array.isArray(dialogue) || dialogue.length < 2)
          return [{ message: 'The conversation preview script is missing or too short.' }];
      dialogue.forEach((line, index) => {
          const name = ctx.normaliseWhitespace(line?.speaker);
          if (!configuredSet.has(name))
              issues.push({ index, speaker: name, message: `Preview line ${index + 1} uses an unknown speaker.` });
          if (!ctx.normaliseWhitespace(line?.text))
              issues.push({ index, speaker: name, message: `Preview line ${index + 1} has no spoken text.` });
      });
      if (dialogue[0]?.speaker !== configuredNames[0] || dialogue[1]?.speaker !== configuredNames[1]) {
          issues.push({ message: 'The conversation preview speaker order does not match the configured speaker order.' });
      }
      return issues;
  }
  ctx.expose("validateConversationPreviewDialogue", validateConversationPreviewDialogue);
  function buildConversationPreviewPrompt({ language, speakers, dialogue }) {
      const languageName = ctx.normaliseVoicePreviewValue(language) || 'English';
      const languageKey = ctx.normaliseVoicePreviewValue(languageName, { lowerCase: true });
      const source = Array.isArray(speakers) ? speakers : [];
      const directions = source.map(speaker => {
          const name = ctx.normaliseWhitespace(speaker.speakerName);
          const delivery = ctx.normaliseVoicePreviewValue(speaker.deliveryInstructions) || 'Speak naturally and clearly at a conversational pace.';
          return `- ${name}: ${delivery}`;
      }).join('\n');
      const languageInstruction = CONVERSATION_PREVIEW_TEMPLATES[languageKey]
          ? `Speak the dialogue exactly as written in ${languageName}.`
          : `Translate only the spoken dialogue into ${languageName} before speaking it. Keep the speaker labels unchanged.`;
      const transcript = dialogue.map(line => `${ctx.normaliseWhitespace(line.speaker)}: ${ctx.normaliseWhitespace(line.text)}`).join('\n');
      return `Create a short two-speaker conversation preview.\n\nLANGUAGE\n${languageInstruction}\n\nDELIVERY INSTRUCTIONS\n${directions}\n\nRULES\n- Do not speak these instructions.\n- Speak only the dialogue under CONVERSATION.\n- Preserve the configured speaker order and speaker labels.\n- Keep the exchange natural, clear and brief.\n- Do not add an introduction, explanation or extra speaker.\n\nCONVERSATION\n${transcript}`;
  }
  ctx.expose("buildConversationPreviewPrompt", buildConversationPreviewPrompt);
  function buildConversationPreviewDescriptor({ language = ctx.getLanguage(), ttsModel = ctx.getTtsModel(), speakers = ctx.appState.speakers } = {}) {
      const normalisedSpeakers = (Array.isArray(speakers) ? speakers : []).map(speaker => ({
          id: ctx.normaliseVoicePreviewValue(speaker?.id),
          speakerName: ctx.normaliseVoicePreviewValue(speaker?.speakerName),
          geminiVoiceName: ctx.normaliseVoicePreviewValue(speaker?.geminiVoiceName),
          deliveryInstructions: ctx.normaliseVoicePreviewValue(speaker?.deliveryInstructions)
      }));
      const descriptor = {
          previewVersion: CONVERSATION_PREVIEW_TEMPLATE_VERSION,
          audioFormatVersion: CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION,
          language: ctx.normaliseVoicePreviewValue(language) || 'English',
          ttsModel: ctx.normaliseVoicePreviewValue(ttsModel),
          speakers: normalisedSpeakers
      };
      const dialogue = buildConversationPreviewDialogue({ language: descriptor.language, speakers: normalisedSpeakers });
      const dialogueIssues = validateConversationPreviewDialogue(dialogue, normalisedSpeakers);
      if (dialogueIssues.length)
          throw new Error(dialogueIssues[0].message);
      const speakerVoiceConfigs = ctx.buildSpeakerVoiceConfigs(normalisedSpeakers);
      const stableKeyInput = stableSerialiseConversationPreview({
          previewVersion: descriptor.previewVersion,
          audioFormatVersion: descriptor.audioFormatVersion,
          language: descriptor.language.toLocaleLowerCase(),
          ttsModel: descriptor.ttsModel.toLocaleLowerCase(),
          speakers: normalisedSpeakers.map(speaker => ({
              id: speaker.id,
              speakerName: speaker.speakerName,
              geminiVoiceName: speaker.geminiVoiceName,
              deliveryInstructions: speaker.deliveryInstructions
          }))
      });
      return {
          ...descriptor,
          dialogue,
          speakerVoiceConfigs,
          prompt: buildConversationPreviewPrompt({ language: descriptor.language, speakers: normalisedSpeakers, dialogue }),
          cacheKey: `conversation-preview-${CONVERSATION_PREVIEW_TEMPLATE_VERSION}-${ctx.hashVoicePreviewValue(stableKeyInput)}`
      };
  }
  ctx.expose("buildConversationPreviewDescriptor", buildConversationPreviewDescriptor);
  function buildConversationPreviewRequestBody(descriptor) {
      return ctx.buildTtsRequestBody(descriptor.prompt, descriptor.speakerVoiceConfigs);
  }
  ctx.expose("buildConversationPreviewRequestBody", buildConversationPreviewRequestBody);
  function validateConversationPreviewMapping(descriptor) {
      if (!descriptor || descriptor.speakers.length !== 2 || descriptor.speakerVoiceConfigs.length !== 2)
          return false;
      return descriptor.speakers.every((speaker, index) => {
          const mapping = descriptor.speakerVoiceConfigs[index];
          return mapping?.speaker === speaker.speakerName &&
              mapping?.voiceConfig?.prebuiltVoiceConfig?.voiceName === speaker.geminiVoiceName;
      });
  }
  ctx.expose("validateConversationPreviewMapping", validateConversationPreviewMapping);
  function validateConversationPreviewSetup() {
      const errors = [];
      if (!ctx.appState.connection.apiKey.trim()) {
          const field = document.getElementById('setupApiKey') || ctx.els.connectionChip;
          errors.push({ id: field?.id || 'connectionChip', field, container: field?.parentElement, message: 'Enter a Gemini API key.' });
      }
      if (!ctx.getTtsModel()) {
          const field = document.getElementById('setupCustomTtsModel') || ctx.els.connectionChip;
          errors.push({ id: field?.id || 'connectionChip', field, container: field?.parentElement, message: 'Enter a valid TTS model ID.' });
      }
      if (!ctx.getLanguage()) {
          errors.push({ id: 'customLanguage', field: ctx.els.customLanguage, container: ctx.els.customLanguage?.parentElement, message: 'Enter a language.' });
      }
      for (const issue of ctx.validateSpeakerRecords(ctx.appState.speakers)) {
          const target = ctx.getSpeakerValidationTarget(issue.index, issue.field);
          errors.push({ ...target, message: issue.message });
      }
      if (!errors.length) {
          try {
              const descriptor = buildConversationPreviewDescriptor();
              if (!validateConversationPreviewMapping(descriptor)) {
                  errors.push({ id: 'conversationPreviewButton', field: document.getElementById('conversationPreviewButton'), message: 'The speaker-to-voice mapping is invalid.' });
              }
          }
          catch (error) {
              errors.push({ id: 'conversationPreviewButton', field: document.getElementById('conversationPreviewButton'), message: error.message || 'The conversation preview setup is invalid.' });
          }
      }
      return errors;
  }
  ctx.expose("validateConversationPreviewSetup", validateConversationPreviewSetup);
  function focusFirstConversationPreviewError(errors) {
      const first = errors?.[0];
      if (!first)
          return;
      requestAnimationFrame(() => {
          const target = document.getElementById(first.id) || first.field;
          if (target?.focus)
              target.focus();
      });
  }
  ctx.expose("focusFirstConversationPreviewError", focusFirstConversationPreviewError);
  function getConversationPreviewDuplicateSignature(speakers = ctx.appState.speakers) {
      return ctx.getDuplicateVoiceSignature(speakers);
  }
  ctx.expose("getConversationPreviewDuplicateSignature", getConversationPreviewDuplicateSignature);
  function isConversationPreviewDuplicateApproved(speakers = ctx.appState.speakers) {
      const signature = getConversationPreviewDuplicateSignature(speakers);
      return Boolean(signature && signature === conversationPreviewDuplicateApprovalSignature);
  }
  ctx.expose("isConversationPreviewDuplicateApproved", isConversationPreviewDuplicateApproved);
  function approveConversationPreviewDuplicateVoice(speakers = ctx.appState.speakers) {
      conversationPreviewDuplicateApprovalSignature = getConversationPreviewDuplicateSignature(speakers);
      setConversationPreviewState({ duplicateWarningVisible: false });
      return Boolean(conversationPreviewDuplicateApprovalSignature);
  }
  ctx.expose("approveConversationPreviewDuplicateVoice", approveConversationPreviewDuplicateVoice);
  function resetConversationPreviewDuplicateApproval() {
      conversationPreviewDuplicateApprovalSignature = '';
      setConversationPreviewState({ duplicateWarningVisible: false });
  }
  ctx.expose("resetConversationPreviewDuplicateApproval", resetConversationPreviewDuplicateApproval);
  function showConversationPreviewDuplicateWarning() {
      setConversationPreviewState({ duplicateWarningVisible: true });
      requestAnimationFrame(() => document.getElementById('conversationPreviewDuplicateWarning')?.focus());
      return false;
  }
  ctx.expose("showConversationPreviewDuplicateWarning", showConversationPreviewDuplicateWarning);
  function renderConversationPreviewMarkup() {
      const state = getConversationPreviewState();
      const duplicateVoice = getConversationPreviewDuplicateSignature();
      const warningHidden = !(state.duplicateWarningVisible && duplicateVoice);
      return `<section id="conversationPreviewSection" class="section-card subtle" aria-labelledby="conversationPreviewTitle">
      <div class="section-title-row">
        <div>
          <h3 id="conversationPreviewTitle">Conversation preview</h3>
          <p>Hear both configured speakers together before generating the full podcast.</p>
        </div>
      </div>
      <button id="conversationPreviewButton" class="secondary-button full-width" type="button" data-conversation-preview-action="preview" aria-describedby="conversationPreviewStatus">Preview conversation</button>
      <p id="conversationPreviewStatus" class="field-help" role="status" aria-live="polite">Generate a short two-speaker comparison in ${ctx.escapeHtml(ctx.getLanguage() || 'the selected language')}.</p>
      <audio id="conversationPreviewPlayer" controls preload="metadata" hidden aria-label="Two-speaker conversation preview" style="width:100%;margin-top:12px"></audio>
      <section id="conversationPreviewDuplicateWarning" class="duplicate-voice-warning${warningHidden ? ' hidden' : ''}" role="alert" tabindex="-1" aria-labelledby="conversationPreviewDuplicateWarningTitle" style="margin-top:14px">
        <h3 id="conversationPreviewDuplicateWarningTitle">Both speakers currently use ${ctx.escapeHtml(duplicateVoice)}.</h3>
        <p>The conversation may be difficult to follow.</p>
        <div class="button-row mt-14">
          <button class="primary-button" type="button" data-conversation-preview-duplicate-action="use-anyway" aria-label="Use the same voice for both speakers anyway">Use anyway</button>
          <button class="secondary-button" type="button" data-conversation-preview-duplicate-action="choose-another" aria-label="Choose another voice for the second speaker">Choose another voice</button>
        </div>
      </section>
    </section>`;
  }
  ctx.expose("renderConversationPreviewMarkup", renderConversationPreviewMarkup);
  function updateConversationPreviewControl() {
      const button = document.getElementById('conversationPreviewButton');
      const status = document.getElementById('conversationPreviewStatus');
      const warning = document.getElementById('conversationPreviewDuplicateWarning');
      if (!button || !status)
          return;
      const state = getConversationPreviewState();
      const loading = state.status === 'loading';
      const labels = {
          idle: 'Preview conversation',
          loading: 'Generating conversation preview…',
          ready: 'Replay conversation preview',
          error: 'Try conversation preview again'
      };
      const label = labels[state.status] || labels.idle;
      button.disabled = loading;
      button.setAttribute('aria-disabled', String(loading));
      button.setAttribute('aria-busy', String(loading));
      button.setAttribute('aria-label', `${label} using both configured speakers`);
      button.innerHTML = loading ? `<span class="spinner" aria-hidden="true"></span><span>${label}</span>` : label;
      status.classList.toggle('field-error', state.status === 'error');
      status.textContent = state.message || (state.status === 'ready'
          ? 'Conversation preview is cached locally and ready to replay.'
          : `Generate a short two-speaker comparison in ${ctx.getLanguage() || 'the selected language'}.`);
      if (warning) {
          const showWarning = state.duplicateWarningVisible && Boolean(getConversationPreviewDuplicateSignature());
          warning.classList.toggle('hidden', !showWarning);
          const title = document.getElementById('conversationPreviewDuplicateWarningTitle');
          if (title)
              title.textContent = `Both speakers currently use ${getConversationPreviewDuplicateSignature()}.`;
      }
  }
  ctx.expose("updateConversationPreviewControl", updateConversationPreviewControl);
  function releaseConversationPreviewPlayback() {
      if (!activeConversationPreviewPlayback)
          return;
      try {
          activeConversationPreviewPlayback.audio.pause();
      }
      catch { }
      try {
          URL.revokeObjectURL(activeConversationPreviewPlayback.url);
      }
      catch { }
      activeConversationPreviewPlayback = null;
  }
  ctx.expose("releaseConversationPreviewPlayback", releaseConversationPreviewPlayback);
  function resetConversationPreviewState(reason = '') {
      releaseConversationPreviewPlayback();
      ctx.appState.conversationPreviewState = { status: 'idle', cacheKey: '', message: reason, duplicateWarningVisible: false };
      updateConversationPreviewControl();
      return ctx.appState.conversationPreviewState;
  }
  ctx.expose("resetConversationPreviewState", resetConversationPreviewState);
  function getCurrentConversationPreviewDescriptor() {
      try {
          return buildConversationPreviewDescriptor();
      }
      catch {
          return null;
      }
  }
  ctx.expose("getCurrentConversationPreviewDescriptor", getCurrentConversationPreviewDescriptor);
  function invalidateStaleConversationPreviewState(reason = '') {
      const state = getConversationPreviewState();
      const descriptor = getCurrentConversationPreviewDescriptor();
      if (!state.cacheKey || !descriptor || state.cacheKey === descriptor.cacheKey) {
          updateConversationPreviewControl();
          return false;
      }
      resetConversationPreviewState(reason);
      return true;
  }
  ctx.expose("invalidateStaleConversationPreviewState", invalidateStaleConversationPreviewState);
  function isValidConversationPreviewRecord(record, cacheKey = '') {
      return Boolean(record &&
          record.previewVersion === CONVERSATION_PREVIEW_TEMPLATE_VERSION &&
          record.audioFormatVersion === CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION &&
          (!cacheKey || record.cacheKey === cacheKey) &&
          record.blob &&
          typeof record.blob.arrayBuffer === 'function' &&
          Number(record.blob.size) > 44);
  }
  ctx.expose("isValidConversationPreviewRecord", isValidConversationPreviewRecord);
  async function playConversationPreviewBlob(blob) {
      if (!isValidConversationPreviewRecord({
          previewVersion: CONVERSATION_PREVIEW_TEMPLATE_VERSION,
          audioFormatVersion: CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION,
          cacheKey: 'playback',
          blob
      }, 'playback'))
          throw new Error('Conversation preview audio is unreadable.');
      if (!URL?.createObjectURL)
          throw new Error('This browser cannot play locally generated audio previews.');
      const player = document.getElementById('conversationPreviewPlayer');
      if (!player)
          throw new Error('Conversation preview playback control is unavailable.');
      releaseConversationPreviewPlayback();
      const url = URL.createObjectURL(blob);
      player.src = url;
      player.hidden = false;
      player.load?.();
      activeConversationPreviewPlayback = { audio: player, url };
      try {
          await player.play();
          return player;
      }
      catch (error) {
          releaseConversationPreviewPlayback();
          throw new Error(`Conversation preview playback failed: ${error?.message || error}`);
      }
  }
  ctx.expose("playConversationPreviewBlob", playConversationPreviewBlob);
  async function requestConversationPreviewRecord(descriptor, fetchImpl = fetch) {
      if (!validateConversationPreviewMapping(descriptor))
          throw new Error('The speaker-to-voice mapping is invalid.');
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(descriptor.ttsModel)}:generateContent`;
      const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.appState.connection.apiKey },
          body: JSON.stringify(buildConversationPreviewRequestBody(descriptor))
      });
      const raw = await response.text();
      let data;
      try {
          data = JSON.parse(raw);
      }
      catch {
          throw ctx.createApiError(response.status, 'Gemini returned non-JSON conversation-preview data.', raw);
      }
      if (!response.ok)
          throw ctx.createApiError(response.status, data?.error?.message || `Conversation preview failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          throw ctx.createApiError(response.status, `Conversation preview ended unexpectedly with finish reason ${candidate.finishReason}.`, JSON.stringify(data, null, 2));
      }
      const part = data?.candidates?.flatMap(item => item?.content?.parts || []).find(item => item?.inlineData?.data);
      if (!part)
          throw ctx.createApiError(response.status, 'Gemini returned an empty conversation-preview audio response.', JSON.stringify(data, null, 2));
      const pcmBytes = ctx.base64ToBytes(part.inlineData.data);
      if (pcmBytes.byteLength < 2 || pcmBytes.byteLength % 2 !== 0)
          throw new Error('Gemini returned invalid conversation-preview PCM audio.');
      const sampleRate = ctx.sampleRateFromMimeType(part.inlineData.mimeType);
      const blob = ctx.pcm16ToWavBlob(pcmBytes, sampleRate, 1);
      if (!blob || blob.size <= 44)
          throw new Error('Gemini returned invalid conversation-preview audio.');
      return {
          cacheKey: descriptor.cacheKey,
          previewVersion: CONVERSATION_PREVIEW_TEMPLATE_VERSION,
          audioFormatVersion: CONVERSATION_PREVIEW_AUDIO_FORMAT_VERSION,
          language: descriptor.language,
          ttsModel: descriptor.ttsModel,
          speakers: ctx.deepClone(descriptor.speakers),
          speakerVoiceConfigs: ctx.deepClone(descriptor.speakerVoiceConfigs),
          sampleRate,
          blob,
          createdAt: new Date().toISOString()
      };
  }
  ctx.expose("requestConversationPreviewRecord", requestConversationPreviewRecord);
  async function getOrGenerateConversationPreviewRecord(descriptor, { fetchImpl = fetch, cacheBackend = ctx.voicePreviewCacheBackend } = {}) {
      const record = await requestConversationPreviewRecord(descriptor, fetchImpl);
      const storageError = await ctx.writeVoicePreviewCache(record, cacheBackend);
      return { record, storageError };
  }
  ctx.expose("getOrGenerateConversationPreviewRecord", getOrGenerateConversationPreviewRecord);
  function showConversationPreviewFailure(descriptor, error) {
      const currentDescriptor = getCurrentConversationPreviewDescriptor();
      if (descriptor && currentDescriptor && currentDescriptor.cacheKey !== descriptor.cacheKey)
          return false;
      setConversationPreviewState({
          status: 'error',
          cacheKey: descriptor?.cacheKey || '',
          message: CONVERSATION_PREVIEW_FAILURE_MESSAGE,
          duplicateWarningVisible: false
      });
      ctx.announce('Conversation preview could not be generated.');
      const mapped = ctx.mapError(error);
      ctx.showServiceError({
          title: 'Conversation preview could not be generated',
          message: 'Conversation preview could not be generated.',
          suggestion: 'Check the speaker settings, API key, model availability or free-tier limit.',
          details: `${mapped.message}${mapped.suggestion ? `\n${mapped.suggestion}` : ''}\n\n${error?.details || error?.stack || String(error)}`,
          retry: null
      });
      return false;
  }
  ctx.expose("showConversationPreviewFailure", showConversationPreviewFailure);
  async function runConversationPreview(options = {}) {
      ctx.syncCreateInputs();
      const errors = validateConversationPreviewSetup();
      if (errors.length) {
          ctx.showValidationErrors(errors);
          focusFirstConversationPreviewError(errors);
          ctx.announce('Conversation preview settings need attention.');
          return false;
      }
      ctx.clearValidation();
      const descriptor = buildConversationPreviewDescriptor();
      if (getConversationPreviewDuplicateSignature() && !isConversationPreviewDuplicateApproved()) {
          return showConversationPreviewDuplicateWarning();
      }
      ctx.hideServiceError();
      setConversationPreviewState({
          status: 'loading',
          cacheKey: descriptor.cacheKey,
          message: 'Generating conversation preview…',
          duplicateWarningVisible: false
      });
      ctx.announce('Generating conversation preview using both configured speakers.');
      const cacheBackend = options.cacheBackend || ctx.voicePreviewCacheBackend;
      const player = options.player || playConversationPreviewBlob;
      const cacheRead = await ctx.readVoicePreviewCache(descriptor.cacheKey, cacheBackend);
      let storageUnavailable = Boolean(cacheRead.storageError);
      if (cacheRead.record) {
          if (!isValidConversationPreviewRecord(cacheRead.record, descriptor.cacheKey)) {
              await ctx.removeVoicePreviewCache(descriptor.cacheKey, cacheBackend);
          }
          else {
              try {
                  await player(cacheRead.record.blob);
                  if (getCurrentConversationPreviewDescriptor()?.cacheKey !== descriptor.cacheKey)
                      return resetConversationPreviewState();
                  setConversationPreviewState({
                      status: 'ready',
                      cacheKey: descriptor.cacheKey,
                      message: 'Conversation preview is cached locally and ready to replay.',
                      duplicateWarningVisible: false
                  });
                  ctx.announce('Conversation preview is ready and playing.');
                  return true;
              }
              catch {
                  await ctx.removeVoicePreviewCache(descriptor.cacheKey, cacheBackend);
              }
          }
      }
      try {
          const { record, storageError } = await getOrGenerateConversationPreviewRecord(descriptor, {
              fetchImpl: options.fetchImpl || fetch,
              cacheBackend
          });
          storageUnavailable ||= Boolean(storageError);
          if (getCurrentConversationPreviewDescriptor()?.cacheKey !== descriptor.cacheKey)
              return resetConversationPreviewState();
          try {
              await player(record.blob);
          }
          catch (error) {
              await ctx.removeVoicePreviewCache(descriptor.cacheKey, cacheBackend);
              throw error;
          }
          setConversationPreviewState({
              status: 'ready',
              cacheKey: descriptor.cacheKey,
              message: storageUnavailable
                  ? 'Conversation preview is ready, but browser storage was unavailable, so it is cached only for this session.'
                  : 'Conversation preview is cached locally and ready to replay.',
              duplicateWarningVisible: false
          });
          ctx.announce('Conversation preview is ready and playing.');
          return true;
      }
      catch (error) {
          return showConversationPreviewFailure(descriptor, error);
      }
  }
  ctx.expose("runConversationPreview", runConversationPreview);
  function generateConversationPreview(options = {}) {
      if (conversationPreviewTask)
          return conversationPreviewTask;
      conversationPreviewTask = runConversationPreview(options);
      conversationPreviewTask.finally(() => {
          conversationPreviewTask = null;
      });
      return conversationPreviewTask;
  }
  ctx.expose("generateConversationPreview", generateConversationPreview);
  async function handleConversationPreviewDuplicateChoice(action, options = {}) {
      if (action === 'use-anyway') {
          approveConversationPreviewDuplicateVoice();
          return generateConversationPreview(options);
      }
      if (action === 'choose-another') {
          setConversationPreviewState({ duplicateWarningVisible: false });
          requestAnimationFrame(() => document.getElementById('speakerVoice1')?.focus());
      }
      return false;
  }
  ctx.expose("handleConversationPreviewDuplicateChoice", handleConversationPreviewDuplicateChoice);
  const renderSpeakerCardsWithoutConversationPreview = ctx.renderSpeakerCards;
  ctx.expose("renderSpeakerCardsWithoutConversationPreview", renderSpeakerCardsWithoutConversationPreview);
  ctx.renderSpeakerCards = function renderSpeakerCardsWithConversationPreview() {
      releaseConversationPreviewPlayback();
      renderSpeakerCardsWithoutConversationPreview();
      ctx.els.speakerList.insertAdjacentHTML('beforeend', renderConversationPreviewMarkup());
      invalidateStaleConversationPreviewState();
      updateConversationPreviewControl();
  };
  const resetProjectWithoutConversationPreview = ctx.resetProject;
  ctx.expose("resetProjectWithoutConversationPreview", resetProjectWithoutConversationPreview);
  ctx.resetProject = function resetProjectWithConversationPreview(options) {
      resetConversationPreviewDuplicateApproval();
      resetConversationPreviewState();
      return resetProjectWithoutConversationPreview(options);
  };
  ctx.els.speakerList.addEventListener('click', event => {
      const previewButton = event.target.closest('[data-conversation-preview-action="preview"]');
      if (previewButton && !previewButton.disabled) {
          generateConversationPreview();
          return;
      }
      const duplicateButton = event.target.closest('[data-conversation-preview-duplicate-action]');
      if (duplicateButton)
          handleConversationPreviewDuplicateChoice(duplicateButton.dataset.conversationPreviewDuplicateAction);
  });
  ctx.els.createForm.addEventListener('input', event => {
      if (event.target === ctx.els.language || event.target === ctx.els.customLanguage) {
          queueMicrotask(() => invalidateStaleConversationPreviewState('Podcast language changed. Generate a new conversation preview.'));
      }
  });
  ctx.els.speakerList.addEventListener('input', event => {
      const card = event.target.closest('[data-speaker-index]');
      const field = event.target.dataset.speakerField;
      if (!card || !['speakerName', 'deliveryInstructions'].includes(field))
          return;
      queueMicrotask(() => invalidateStaleConversationPreviewState(`${field === 'speakerName' ? 'Speaker name' : 'Delivery instructions'} changed. Generate a new conversation preview.`));
  });
  ctx.els.speakerList.addEventListener('change', event => {
      const card = event.target.closest('[data-speaker-index]');
      const field = event.target.dataset.speakerField;
      if (!card || !['gender', 'voiceType', 'geminiVoiceName'].includes(field))
          return;
      resetConversationPreviewDuplicateApproval();
      queueMicrotask(() => invalidateStaleConversationPreviewState('Voice selection changed. Generate a new conversation preview.'));
  });
  for (const formHost of [ctx.els.connectionSetupForm, ctx.els.connectionSettingsForm]) {
      formHost.addEventListener('change', () => queueMicrotask(() => invalidateStaleConversationPreviewState('TTS model changed. Generate a new conversation preview.')));
  }
  ctx.els.swapCharacters.addEventListener('click', () => {
      resetConversationPreviewDuplicateApproval();
      queueMicrotask(() => invalidateStaleConversationPreviewState('Speaker order changed. Generate a new conversation preview.'));
  });
  ctx.els.clearStoredDataButton.addEventListener('click', () => {
      resetConversationPreviewDuplicateApproval();
      resetConversationPreviewState();
  });
  window.addEventListener('beforeunload', releaseConversationPreviewPlayback);
  function initialiseApp() {
      ctx.loadPreferences();
      ctx.applyTheme();
      ctx.populateInputsFromState();
      ctx.renderConnectionForms();
      ctx.renderSpeakerCards();
      if (ctx.appState.script)
          ctx.resetHistory();
      ctx.renderCurrentStage({ focus: false });
      ctx.els.saveState.textContent = 'Saved locally';
  }
  ctx.expose("initialiseApp", initialiseApp);
  initialiseApp();
}
