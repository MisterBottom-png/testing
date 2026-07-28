export function installConnectionUi(services) {
  function modelOptionsMarkup(options, selectedValue) {
    return options.map(option => `<option value="${services.escapeHtml(option.value)}"${selectedValue === option.value ? ' selected' : ''}>${services.escapeHtml(option.label)}</option>`).join('');
  }
  function connectionFormMarkup(prefix) {
    const textModel = services.appState.connection.textModel;
    const ttsModel = services.appState.connection.ttsModel;
    return `
    <div class="field-grid three" data-connection-form="${prefix}">
      <div class="field full">
        <label for="${prefix}ApiKey">Gemini API key</label>
        <div class="key-wrap">
          <input id="${prefix}ApiKey" type="password" data-connection-field="apiKey" value="${services.escapeHtml(services.appState.connection.apiKey)}" placeholder="Paste Google AI Studio API key" autocomplete="off" spellcheck="false" />
          <button class="key-toggle" type="button" data-toggle-key aria-label="Show API key">Show</button>
        </div>
        <label class="check-row" for="${prefix}RememberKey"><input id="${prefix}RememberKey" type="checkbox" data-connection-field="rememberKey"${services.appState.connection.rememberKey ? ' checked' : ''} /><span><strong>Remember on this device.</strong> Off by default.</span></label>
      </div>
      <div class="field">
        <label for="${prefix}TextModel">Text model</label>
        <select id="${prefix}TextModel" data-connection-field="textModel">
          ${modelOptionsMarkup(services.TEXT_MODEL_OPTIONS, textModel)}
        </select>
      </div>
      <div class="field${textModel === services.CUSTOM_MODEL_VALUE ? '' : ' hidden'}" data-custom-model="textModel">
        <label for="${prefix}CustomTextModel">Custom text model ID</label>
        <input id="${prefix}CustomTextModel" data-connection-field="customTextModel" value="${services.escapeHtml(services.appState.connection.customTextModel)}" placeholder="gemini-…" spellcheck="false" />
      </div>
      <div class="field">
        <label for="${prefix}TtsModel">TTS model</label>
        <select id="${prefix}TtsModel" data-connection-field="ttsModel">
          ${modelOptionsMarkup(services.TTS_MODEL_OPTIONS, ttsModel)}
        </select>
      </div>
      <div class="field${ttsModel === services.CUSTOM_MODEL_VALUE ? '' : ' hidden'}" data-custom-model="ttsModel">
        <label for="${prefix}CustomTtsModel">Custom TTS model ID</label>
        <input id="${prefix}CustomTtsModel" data-connection-field="customTtsModel" value="${services.escapeHtml(services.appState.connection.customTtsModel)}" placeholder="gemini-…-tts-preview" spellcheck="false" />
      </div>
    </div>
    <p class="hint mt-12"><strong>Private testing mode.</strong> A public deployment should route requests through a secure backend.</p>`;
  }
  function renderConnectionForms() {
    services.els.connectionSetupForm.innerHTML = connectionFormMarkup('setup');
    services.els.connectionSettingsForm.innerHTML = connectionFormMarkup('settings');
    services.els.connectionSetup.classList.toggle('hidden', Boolean(services.appState.connection.apiKey));
    renderConnectionStatus();
  }
  function renderConnectionStatus() {
    const configured = Boolean(services.appState.connection.apiKey && services.getTextModel() && services.getTtsModel());
    services.els.connectionChip.classList.toggle('connected', configured);
    services.els.connectionLabel.textContent = configured ? 'Gemini configured' : 'Gemini not configured';
    services.els.connectionModels.textContent = configured ? `${services.getTextModel()} · ${services.getTtsModel()}` : 'Add API key';
  }
  function syncConnectionForm(form) {
    for (const control of form.querySelectorAll('[data-connection-field]')) {
      const field = control.dataset.connectionField;
      services.appState.connection[field] = control.type === 'checkbox' ? control.checked : control.value.trim();
    }
    renderConnectionForms();
    services.queueSave();
  }
  Object.assign(services, {
    modelOptionsMarkup,
    connectionFormMarkup,
    renderConnectionForms,
    renderConnectionStatus,
    syncConnectionForm
  });
  return services;
}
