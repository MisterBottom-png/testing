function queueSave() {
  els.saveState.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { savePreferences(); els.saveState.textContent = 'Saved locally'; }, 260);
}
function savePreferences() {
  const payload = {
    theme: appState.settings.theme,
    maxTtsCharacters: appState.settings.maxTtsCharacters,
    speakingRate: appState.settings.speakingRate,
    textModel: appState.connection.textModel,
    customTextModel: appState.connection.customTextModel,
    ttsModel: appState.connection.ttsModel,
    customTtsModel: appState.connection.customTtsModel,
    podcast: appState.podcast,
    characters: appState.characters,
    script: appState.script
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (appState.connection.rememberKey && appState.connection.apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, appState.connection.apiKey);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    if (appState.connection.apiKey) sessionStorage.setItem(SESSION_KEY, appState.connection.apiKey);
    else sessionStorage.removeItem(SESSION_KEY);
  }
}
function loadPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { saved = {}; }
  appState.settings.theme = saved.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  appState.settings.maxTtsCharacters = Number(saved.maxTtsCharacters) || DEFAULT_MAX_TTS_CHARACTERS;
  appState.settings.speakingRate = Number(saved.speakingRate) || 140;
  appState.connection.textModel = saved.textModel || appState.connection.textModel;
  appState.connection.customTextModel = saved.customTextModel || '';
  appState.connection.ttsModel = saved.ttsModel || appState.connection.ttsModel;
  appState.connection.customTtsModel = saved.customTtsModel || '';
  appState.podcast = { ...appState.podcast, ...(saved.podcast || {}) };
  if (Array.isArray(saved.characters) && saved.characters.length === 2) appState.characters = saved.characters;
  if (saved.script?.segments?.length) {
    appState.script = saved.script;
    appState.originalScript = deepClone(saved.script);
  }
  const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  appState.connection.apiKey = storedApiKey || sessionStorage.getItem(SESSION_KEY) || '';
  appState.connection.rememberKey = Boolean(storedApiKey);
}

function connectionFormMarkup(prefix) {
  const textModel = appState.connection.textModel;
  const ttsModel = appState.connection.ttsModel;
  return `
    <div class="field-grid three" data-connection-form="${prefix}">
      <div class="field full">
        <label for="${prefix}ApiKey">Gemini API key</label>
        <div class="key-wrap">
          <input id="${prefix}ApiKey" type="password" data-connection-field="apiKey" value="${escapeHtml(appState.connection.apiKey)}" placeholder="Paste Google AI Studio API key" autocomplete="off" spellcheck="false" />
          <button class="key-toggle" type="button" data-toggle-key aria-label="Show API key">Show</button>
        </div>
        <label class="check-row" for="${prefix}RememberKey"><input id="${prefix}RememberKey" type="checkbox" data-connection-field="rememberKey"${appState.connection.rememberKey ? ' checked' : ''} /><span><strong>Remember on this device.</strong> Off by default.</span></label>
      </div>
      <div class="field">
        <label for="${prefix}TextModel">Text model</label>
        <select id="${prefix}TextModel" data-connection-field="textModel">
          <option value="gemini-3.6-flash"${textModel === 'gemini-3.6-flash' ? ' selected' : ''}>Gemini 3.6 Flash</option>
          <option value="gemini-3.5-flash"${textModel === 'gemini-3.5-flash' ? ' selected' : ''}>Gemini 3.5 Flash</option>
          <option value="gemini-2.5-flash"${textModel === 'gemini-2.5-flash' ? ' selected' : ''}>Gemini 2.5 Flash</option>
          <option value="custom"${textModel === 'custom' ? ' selected' : ''}>Custom model ID…</option>
        </select>
      </div>
      <div class="field${textModel === 'custom' ? '' : ' hidden'}" data-custom-model="textModel">
        <label for="${prefix}CustomTextModel">Custom text model ID</label>
        <input id="${prefix}CustomTextModel" data-connection-field="customTextModel" value="${escapeHtml(appState.connection.customTextModel)}" placeholder="gemini-…" spellcheck="false" />
      </div>
      <div class="field">
        <label for="${prefix}TtsModel">TTS model</label>
        <select id="${prefix}TtsModel" data-connection-field="ttsModel">
          <option value="gemini-3.1-flash-tts-preview"${ttsModel === 'gemini-3.1-flash-tts-preview' ? ' selected' : ''}>Gemini 3.1 Flash TTS Preview</option>
          <option value="gemini-2.5-flash-preview-tts"${ttsModel === 'gemini-2.5-flash-preview-tts' ? ' selected' : ''}>Gemini 2.5 Flash Preview TTS</option>
          <option value="gemini-2.5-pro-preview-tts"${ttsModel === 'gemini-2.5-pro-preview-tts' ? ' selected' : ''}>Gemini 2.5 Pro Preview TTS</option>
          <option value="custom"${ttsModel === 'custom' ? ' selected' : ''}>Custom model ID…</option>
        </select>
      </div>
      <div class="field${ttsModel === 'custom' ? '' : ' hidden'}" data-custom-model="ttsModel">
        <label for="${prefix}CustomTtsModel">Custom TTS model ID</label>
        <input id="${prefix}CustomTtsModel" data-connection-field="customTtsModel" value="${escapeHtml(appState.connection.customTtsModel)}" placeholder="gemini-…-tts-preview" spellcheck="false" />
      </div>
    </div>
    <p class="hint mt-12"><strong>Private testing mode.</strong> A public deployment should route requests through a secure backend.</p>`;
}
function renderConnectionForms() {
  els.connectionSetupForm.innerHTML = connectionFormMarkup('setup');
  els.connectionSettingsForm.innerHTML = connectionFormMarkup('settings');
  els.connectionSetup.classList.toggle('hidden', Boolean(appState.connection.apiKey));
  renderConnectionStatus();
}
function renderConnectionStatus() {
  const connected = Boolean(appState.connection.apiKey && getTextModel() && getTtsModel());
  els.connectionChip.classList.toggle('connected', connected);
  els.connectionLabel.textContent = connected ? 'Gemini connected' : 'Gemini not connected';
  els.connectionModels.textContent = connected ? `${getTextModel()} · ${getTtsModel()}` : 'Add API key';
}
function syncConnectionForm(form) {
  for (const control of form.querySelectorAll('[data-connection-field]')) {
    const field = control.dataset.connectionField;
    appState.connection[field] = control.type === 'checkbox' ? control.checked : control.value.trim();
  }
  renderConnectionForms();
  queueSave();
}
