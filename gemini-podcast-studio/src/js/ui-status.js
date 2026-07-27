export function installUiStatus(ctx) {
  function queueSave() {
      ctx.els.saveState.textContent = 'Saving…';
      clearTimeout(ctx.saveTimer);
      ctx.saveTimer = setTimeout(() => { ctx.savePreferences(); ctx.els.saveState.textContent = 'Saved locally'; }, 260);
  }
  ctx.expose("queueSave", queueSave);
  function setBusy(busy, kind = '', messages = []) {
      ctx.appState.busy = busy;
      ctx.els.createStage.setAttribute('aria-busy', String(busy && kind === 'script'));
      ctx.els.scriptStage.setAttribute('aria-busy', String(busy && ['refine', 'audio'].includes(kind)));
      clearInterval(ctx.progressTimer);
      clearInterval(ctx.progressMessageTimer);
      const status = kind === 'script' ? { shell: ctx.els.createLoading, message: ctx.els.createLoadingMessage, elapsed: ctx.els.createElapsed } : { shell: ctx.els.scriptLoading, message: ctx.els.scriptLoadingMessage, elapsed: ctx.els.scriptElapsed };
      ctx.els.createLoading.classList.remove('visible');
      ctx.els.scriptLoading.classList.remove('visible');
      ctx.els.generateScriptButton.disabled = busy;
      ctx.els.generateAudioButton.disabled = busy;
      if (!busy) {
          restoreActionLabels();
          ctx.renderConnectionStatus();
          ctx.renderCurrentStage({ focus: false });
          return;
      }
      const safeMessages = messages.length ? messages : ['Working…'];
      let index = 0;
      ctx.progressStartedAt = performance.now();
      status.message.textContent = safeMessages[0];
      status.elapsed.textContent = '0:00';
      status.shell.classList.add('visible');
      if (kind === 'audio')
          ctx.els.scriptLoadingTitle.textContent = 'Generating podcast audio';
      else if (kind === 'voice')
          ctx.els.scriptLoadingTitle.textContent = 'Generating voice preview';
      else
          ctx.els.scriptLoadingTitle.textContent = 'Refining script';
      const activeButton = kind === 'script' ? ctx.els.generateScriptButton : ctx.els.generateAudioButton;
      activeButton.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${kind === 'audio' ? 'Generating audio…' : kind === 'script' ? 'Generating script…' : 'Working…'}</span>`;
      ctx.progressTimer = setInterval(() => { status.elapsed.textContent = ctx.formatDuration((performance.now() - ctx.progressStartedAt) / 1000); }, 250);
      ctx.progressMessageTimer = setInterval(() => { index = (index + 1) % safeMessages.length; status.message.textContent = safeMessages[index]; }, 2600);
  }
  ctx.expose("setBusy", setBusy);
  function restoreActionLabels() {
      ctx.els.generateScriptButton.innerHTML = '<span>Generate script</span>';
      ctx.els.generateAudioButton.innerHTML = '<span>Generate audio</span>';
  }
  ctx.expose("restoreActionLabels", restoreActionLabels);
  function showServiceError({ title, message, suggestion, details = '', retry = null }) {
      ctx.els.serviceErrorTitle.textContent = title;
      ctx.els.serviceErrorMessage.textContent = message;
      ctx.els.serviceErrorSuggestion.textContent = suggestion;
      ctx.els.serviceErrorDetails.textContent = ctx.redactDiagnosticString(details || 'No additional technical details.');
      ctx.els.retryButton.classList.toggle('hidden', typeof retry !== 'function');
      ctx.els.retryButton.onclick = typeof retry === 'function' ? retry : null;
      ctx.els.serviceError.classList.add('visible');
      ctx.els.serviceError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  ctx.expose("showServiceError", showServiceError);
  function hideServiceError() { ctx.els.serviceError.classList.remove('visible'); ctx.els.retryButton.onclick = null; }
  ctx.expose("hideServiceError", hideServiceError);
  function handleGenerationError(error, title, fallbackSuggestion, retry) {
      ctx.diagnosticLog('error', title, error);
      const mapped = ctx.mapError(error);
      showServiceError({ title, message: mapped.message, suggestion: mapped.suggestion || fallbackSuggestion, details: error?.details || error?.stack || String(error), retry });
  }
  ctx.expose("handleGenerationError", handleGenerationError);
  function resetProject({ preserveConnection = true, preservePreferences = true } = {}) {
      ctx.revokeAudioUrl();
      ctx.appState.schemaVersion = ctx.PODCAST_PROJECT_SCHEMA_VERSION;
      ctx.appState.currentStage = 'create';
      ctx.appState.script = null;
      ctx.appState.legacyScript = null;
      ctx.appState.originalScript = null;
      ctx.appState.history = [];
      ctx.appState.historyIndex = -1;
      ctx.appState.podcast = { topic: '', durationMinutes: 5, language: 'English', customLanguage: '', format: 'Friendly conversation', customFormat: '', tones: ['Informative', 'Casual'], instructions: '' };
      ctx.appState.speakers = ctx.createDefaultPodcastSpeakers();
      ctx.appState.audioCacheReferences = {};
      ctx.appState.lastModified = '';
      ctx.appState.expandedSpeakers.clear();
      if (!preserveConnection)
          ctx.appState.connection = { apiKey: '', rememberKey: false, textModel: 'gemini-3.6-flash', customTextModel: '', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' };
      if (!preservePreferences)
          ctx.appState.settings = { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', maxTtsCharacters: ctx.DEFAULT_MAX_TTS_CHARACTERS, speakingRate: 140 };
      ctx.populateInputsFromState();
      ctx.renderConnectionForms();
      ctx.renderSpeakerCards();
      ctx.applyTheme();
      ctx.savePreferences();
      ctx.renderCurrentStage();
      hideServiceError();
      ctx.clearValidation();
  }
  ctx.expose("resetProject", resetProject);
  function clearStoredData() {
      localStorage.removeItem(ctx.STORAGE_KEY);
      localStorage.removeItem(ctx.API_KEY_STORAGE_KEY);
      sessionStorage.removeItem(ctx.SESSION_KEY);
      ctx.els.settingsDialog.close();
      ctx.resetProject({ preserveConnection: false, preservePreferences: false });
      ctx.announce('Stored data cleared.');
  }
  ctx.expose("clearStoredData", clearStoredData);
}
