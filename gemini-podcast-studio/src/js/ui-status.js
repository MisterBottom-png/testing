export function installStatusUi(services) {
  const DIAGNOSTIC_REDACTION = '[REDACTED]';
  const DIAGNOSTIC_SENSITIVE_FIELD_PATTERN = /(?:api[-_ ]?key|x-goog-api-key|authorization|headers?|query|prompt|contents?|body|request(?:data)?|response(?:data)?|raw|inlineData|audioData)/i;
  function redactDiagnosticString(value) {
    let result = String(value ?? '');
    const configuredKey = String(services.appState?.connection?.apiKey || '');
    if (configuredKey) result = result.split(configuredKey).join(DIAGNOSTIC_REDACTION);
    return result.replace(/([?&](?:key|api[_-]?key|x-goog-api-key)=)[^&#\s]+/gi, `$1${DIAGNOSTIC_REDACTION}`).replace(/((?:x-goog-api-key|authorization|api[-_ ]?key)\s*[:=]\s*)[^\s,;}\]]+/gi, `$1${DIAGNOSTIC_REDACTION}`);
  }
  function redactDiagnosticValue(value, seen = new WeakSet()) {
    if (typeof value === 'string') return redactDiagnosticString(value);
    if (value == null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value instanceof Error) {
      return {
        name: redactDiagnosticString(value.name),
        message: redactDiagnosticString(value.message),
        status: Number(value.status || 0) || undefined,
        stack: redactDiagnosticString(value.stack || '')
      };
    }
    if (Array.isArray(value)) return value.map(item => redactDiagnosticValue(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, DIAGNOSTIC_SENSITIVE_FIELD_PATTERN.test(key) ? DIAGNOSTIC_REDACTION : redactDiagnosticValue(item, seen)]));
  }
  function diagnosticLog(level, event, details = null) {
    const method = ['error', 'warn', 'info'].includes(level) ? level : 'log';
    const payload = {
      event: redactDiagnosticString(event),
      details: redactDiagnosticValue(details)
    };
    console[method]('[Gemini Podcast Studio]', payload);
    return payload;
  }
  function setBusy(busy, kind = '', messages = []) {
    services.appState.busy = busy;
    services.els.createStage.setAttribute('aria-busy', String(busy && kind === 'script'));
    services.els.scriptStage.setAttribute('aria-busy', String(busy && ['refine', 'audio'].includes(kind)));
    clearInterval(services.progressTimer);
    clearInterval(services.progressMessageTimer);
    const status = kind === 'script' ? {
      shell: services.els.createLoading,
      message: services.els.createLoadingMessage,
      elapsed: services.els.createElapsed
    } : {
      shell: services.els.scriptLoading,
      message: services.els.scriptLoadingMessage,
      elapsed: services.els.scriptElapsed
    };
    services.els.createLoading.classList.remove('visible');
    services.els.scriptLoading.classList.remove('visible');
    services.els.generateScriptButton.disabled = busy;
    services.els.generateAudioButton.disabled = busy;
    if (!busy) {
      restoreActionLabels();
      services.renderConnectionStatus();
      services.renderCurrentStage({
        focus: false
      });
      return;
    }
    const safeMessages = messages.length ? messages : ['Working…'];
    let index = 0;
    services.progressStartedAt = performance.now();
    status.message.textContent = safeMessages[0];
    status.elapsed.textContent = '0:00';
    status.shell.classList.add('visible');
    if (kind === 'audio') services.els.scriptLoadingTitle.textContent = 'Generating podcast audio';else if (kind === 'voice') services.els.scriptLoadingTitle.textContent = 'Generating voice preview';else services.els.scriptLoadingTitle.textContent = 'Refining script';
    const activeButton = kind === 'script' ? services.els.generateScriptButton : services.els.generateAudioButton;
    activeButton.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${kind === 'audio' ? 'Generating audio…' : kind === 'script' ? 'Generating script…' : 'Working…'}</span>`;
    services.progressTimer = setInterval(() => {
      status.elapsed.textContent = services.formatDuration((performance.now() - services.progressStartedAt) / 1000);
    }, 250);
    services.progressMessageTimer = setInterval(() => {
      index = (index + 1) % safeMessages.length;
      status.message.textContent = safeMessages[index];
    }, 2600);
  }
  function restoreActionLabels() {
    services.els.generateScriptButton.innerHTML = '<span>Generate script</span>';
    services.els.generateAudioButton.innerHTML = '<span>Generate audio</span>';
  }
  function createApiError(status, message, details = '') {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    return error;
  }
  function mapError(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || 'Unknown error.');
    if (status === 400) return {
      message,
      suggestion: 'Check the model IDs and generation settings.'
    };
    if (status === 401 || status === 403) return {
      message,
      suggestion: 'Verify the API key and confirm that Gemini API access is enabled.'
    };
    if (status === 429) return {
      message,
      suggestion: 'The key may have reached a quota or rate limit. Retry later.'
    };
    if (status >= 500) return {
      message,
      suggestion: 'The Gemini service may be temporarily unavailable.'
    };
    if (error instanceof TypeError && /fetch/i.test(message)) return {
      message: 'The browser could not reach the Gemini API.',
      suggestion: 'Check the network or serve this file from localhost.'
    };
    return {
      message,
      suggestion: 'Review the technical details, adjust the request, and retry.'
    };
  }
  function showServiceError({
    title,
    message,
    suggestion,
    details = '',
    retry = null
  }) {
    services.els.serviceErrorTitle.textContent = title;
    services.els.serviceErrorMessage.textContent = message;
    services.els.serviceErrorSuggestion.textContent = suggestion;
    services.els.serviceErrorDetails.textContent = redactDiagnosticString(details || 'No additional technical details.');
    services.els.retryButton.classList.toggle('hidden', typeof retry !== 'function');
    services.els.retryButton.onclick = typeof retry === 'function' ? retry : null;
    services.els.serviceError.classList.add('visible');
    services.els.serviceError.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }
  function hideServiceError() {
    services.els.serviceError.classList.remove('visible');
    services.els.retryButton.onclick = null;
  }
  function handleGenerationError(error, title, fallbackSuggestion, retry) {
    diagnosticLog('error', title, error);
    const mapped = services.mapError(error);
    showServiceError({
      title,
      message: mapped.message,
      suggestion: mapped.suggestion || fallbackSuggestion,
      details: error?.details || error?.stack || String(error),
      retry
    });
  }
  function resetProject({
    preserveConnection = true,
    preservePreferences = true
  } = {}) {
    services.revokeAudioUrl();
    services.appState.schemaVersion = services.PODCAST_PROJECT_SCHEMA_VERSION;
    services.appState.currentStage = 'create';
    services.appState.script = null;
    services.appState.legacyScript = null;
    services.appState.originalScript = null;
    services.appState.history = [];
    services.appState.historyIndex = -1;
    services.appState.podcast = {
      topic: '',
      durationMinutes: services.DEFAULT_DURATION_MINUTES,
      language: 'English',
      customLanguage: '',
      format: 'Friendly conversation',
      customFormat: '',
      tones: ['Informative', 'Casual'],
      instructions: ''
    };
    services.appState.speakers = services.createDefaultPodcastSpeakers();
    services.appState.audioCacheReferences = {};
    services.appState.lastModified = '';
    services.appState.expandedSpeakers.clear();
    if (!preserveConnection) services.appState.connection = {
      apiKey: '',
      rememberKey: false,
      textModel: services.DEFAULT_TEXT_MODEL,
      customTextModel: '',
      ttsModel: services.DEFAULT_TTS_MODEL,
      customTtsModel: ''
    };
    if (!preservePreferences) services.appState.settings = {
      theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      maxTtsCharacters: services.DEFAULT_MAX_TTS_CHARACTERS,
      speakingRate: services.DEFAULT_SPEAKING_RATE
    };
    services.populateInputsFromState();
    services.renderConnectionForms();
    services.renderSpeakerCards();
    services.applyTheme();
    services.savePreferences();
    services.renderCurrentStage();
    hideServiceError();
    services.clearValidation();
  }
  function clearStoredData() {
    localStorage.removeItem(services.STORAGE_KEY);
    localStorage.removeItem(services.API_KEY_STORAGE_KEY);
    sessionStorage.removeItem(services.SESSION_KEY);
    services.els.settingsDialog.close();
    services.resetProject({
      preserveConnection: false,
      preservePreferences: false
    });
    services.announce('Stored data cleared.');
  }
  Object.assign(services, {
    DIAGNOSTIC_REDACTION,
    DIAGNOSTIC_SENSITIVE_FIELD_PATTERN,
    redactDiagnosticString,
    redactDiagnosticValue,
    diagnosticLog,
    setBusy,
    restoreActionLabels,
    createApiError,
    mapError,
    showServiceError,
    hideServiceError,
    handleGenerationError,
    resetProject,
    clearStoredData
  });
  return services;
}
