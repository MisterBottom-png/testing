export function installUiConnection(ctx) {
  function connectionFormMarkup(prefix) {
      const textModel = ctx.appState.connection.textModel;
      const ttsModel = ctx.appState.connection.ttsModel;
      return `
      <div class="field-grid three" data-connection-form="${prefix}">
        <div class="field full">
          <label for="${prefix}ApiKey">Gemini API key</label>
          <div class="key-wrap">
            <input id="${prefix}ApiKey" type="password" data-connection-field="apiKey" value="${ctx.escapeHtml(ctx.appState.connection.apiKey)}" placeholder="Paste Google AI Studio API key" autocomplete="off" spellcheck="false" />
            <button class="key-toggle" type="button" data-toggle-key aria-label="Show API key">Show</button>
          </div>
          <label class="check-row" for="${prefix}RememberKey"><input id="${prefix}RememberKey" type="checkbox" data-connection-field="rememberKey"${ctx.appState.connection.rememberKey ? ' checked' : ''} /><span><strong>Remember on this device.</strong> Off by default.</span></label>
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
          <input id="${prefix}CustomTextModel" data-connection-field="customTextModel" value="${ctx.escapeHtml(ctx.appState.connection.customTextModel)}" placeholder="gemini-…" spellcheck="false" />
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
          <input id="${prefix}CustomTtsModel" data-connection-field="customTtsModel" value="${ctx.escapeHtml(ctx.appState.connection.customTtsModel)}" placeholder="gemini-…-tts-preview" spellcheck="false" />
        </div>
      </div>
      <p class="hint mt-12"><strong>Private testing mode.</strong> A public deployment should route requests through a secure backend.</p>`;
  }
  ctx.expose("connectionFormMarkup", connectionFormMarkup);
  function renderConnectionForms() {
      ctx.els.connectionSetupForm.innerHTML = connectionFormMarkup('setup');
      ctx.els.connectionSettingsForm.innerHTML = connectionFormMarkup('settings');
      ctx.els.connectionSetup.classList.toggle('hidden', Boolean(ctx.appState.connection.apiKey));
      renderConnectionStatus();
  }
  ctx.expose("renderConnectionForms", renderConnectionForms);
  function renderConnectionStatus() {
      const connected = Boolean(ctx.appState.connection.apiKey && ctx.getTextModel() && ctx.getTtsModel());
      ctx.els.connectionChip.classList.toggle('connected', connected);
      ctx.els.connectionLabel.textContent = connected ? 'Gemini connected' : 'Gemini not connected';
      ctx.els.connectionModels.textContent = connected ? `${ctx.getTextModel()} · ${ctx.getTtsModel()}` : 'Add API key';
  }
  ctx.expose("renderConnectionStatus", renderConnectionStatus);
  function syncConnectionForm(form) {
      for (const control of form.querySelectorAll('[data-connection-field]')) {
          const field = control.dataset.connectionField;
          ctx.appState.connection[field] = control.type === 'checkbox' ? control.checked : control.value.trim();
      }
      renderConnectionForms();
      ctx.queueSave();
  }
  ctx.expose("syncConnectionForm", syncConnectionForm);
}
