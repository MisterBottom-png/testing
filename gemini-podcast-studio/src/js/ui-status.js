function setBusy(busy, kind = '', messages = []) {
  appState.busy = busy;
  els.createStage.setAttribute('aria-busy', String(busy && kind === 'script'));
  els.scriptStage.setAttribute('aria-busy', String(busy && ['refine', 'audio'].includes(kind)));
  clearInterval(progressTimer); clearInterval(progressMessageTimer);
  const status = kind === 'script' ? { shell: els.createLoading, message: els.createLoadingMessage, elapsed: els.createElapsed } : { shell: els.scriptLoading, message: els.scriptLoadingMessage, elapsed: els.scriptElapsed };
  els.createLoading.classList.remove('visible'); els.scriptLoading.classList.remove('visible');
  els.generateScriptButton.disabled = busy; els.generateAudioButton.disabled = busy;
  if (!busy) { restoreActionLabels(); renderConnectionStatus(); renderCurrentStage({ focus: false }); return; }
  const safeMessages = messages.length ? messages : ['Working…']; let index = 0; progressStartedAt = performance.now();
  status.message.textContent = safeMessages[0]; status.elapsed.textContent = '0:00'; status.shell.classList.add('visible');
  if (kind === 'audio') els.scriptLoadingTitle.textContent = 'Generating podcast audio';
  else if (kind === 'voice') els.scriptLoadingTitle.textContent = 'Generating voice preview';
  else els.scriptLoadingTitle.textContent = 'Refining script';
  const activeButton = kind === 'script' ? els.generateScriptButton : els.generateAudioButton;
  activeButton.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${kind === 'audio' ? 'Generating audio…' : kind === 'script' ? 'Generating script…' : 'Working…'}</span>`;
  progressTimer = setInterval(() => { status.elapsed.textContent = formatDuration((performance.now() - progressStartedAt) / 1000); }, 250);
  progressMessageTimer = setInterval(() => { index = (index + 1) % safeMessages.length; status.message.textContent = safeMessages[index]; }, 2600);
}
function restoreActionLabels() {
  els.generateScriptButton.innerHTML = '<span>Generate script</span>';
  els.generateAudioButton.innerHTML = '<span>Generate audio</span>';
}
function createApiError(status, message, details = '') { const error = new Error(message); error.status = status; error.details = details; return error; }
function mapError(error) {
  const status = Number(error?.status || 0); const message = String(error?.message || 'Unknown error.');
  if (status === 400) return { message, suggestion: 'Check the model IDs and generation settings.' };
  if (status === 401 || status === 403) return { message, suggestion: 'Verify the API key and confirm that Gemini API access is enabled.' };
  if (status === 429) return { message, suggestion: 'The key may have reached a quota or rate limit. Retry later.' };
  if (status >= 500) return { message, suggestion: 'The Gemini service may be temporarily unavailable.' };
  if (error instanceof TypeError && /fetch/i.test(message)) return { message: 'The browser could not reach the Gemini API.', suggestion: 'Check the network or serve this file from localhost.' };
  return { message, suggestion: 'Review the technical details, adjust the request, and retry.' };
}
function showServiceError({ title, message, suggestion, details = '', retry = null }) {
  els.serviceErrorTitle.textContent = title; els.serviceErrorMessage.textContent = message; els.serviceErrorSuggestion.textContent = suggestion;
  els.serviceErrorDetails.textContent = details || 'No additional technical details.'; els.retryButton.classList.toggle('hidden', typeof retry !== 'function'); els.retryButton.onclick = typeof retry === 'function' ? retry : null;
  els.serviceError.classList.add('visible'); els.serviceError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideServiceError() { els.serviceError.classList.remove('visible'); els.retryButton.onclick = null; }
function handleGenerationError(error, title, fallbackSuggestion, retry) {
  console.error(error); const mapped = mapError(error);
  showServiceError({ title, message: mapped.message, suggestion: mapped.suggestion || fallbackSuggestion, details: error?.details || error?.stack || String(error), retry });
}

function resetProject({ preserveConnection = true, preservePreferences = true } = {}) {
  revokeAudioUrl(); appState.schemaVersion = PODCAST_PROJECT_SCHEMA_VERSION; appState.currentStage = 'create'; appState.script = null; appState.legacyScript = null; appState.originalScript = null; appState.history = []; appState.historyIndex = -1;
  appState.podcast = { topic: '', durationMinutes: 5, language: 'English', customLanguage: '', format: 'Friendly conversation', customFormat: '', tones: ['Informative', 'Casual'], instructions: '' };
  appState.speakers = createDefaultPodcastSpeakers();
  appState.audioCacheReferences = {};
  appState.lastModified = '';
  appState.expandedSpeakers.clear();
  if (!preserveConnection) appState.connection = { apiKey: '', rememberKey: false, textModel: 'gemini-3.6-flash', customTextModel: '', ttsModel: 'gemini-3.1-flash-tts-preview', customTtsModel: '' };
  if (!preservePreferences) appState.settings = { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', maxTtsCharacters: DEFAULT_MAX_TTS_CHARACTERS, speakingRate: 140 };
  populateInputsFromState(); renderConnectionForms(); renderSpeakerCards(); applyTheme(); savePreferences(); renderCurrentStage(); hideServiceError(); clearValidation();
}
function clearStoredData() {
  localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(API_KEY_STORAGE_KEY); sessionStorage.removeItem(SESSION_KEY);
  els.settingsDialog.close(); resetProject({ preserveConnection: false, preservePreferences: false }); announce('Stored data cleared.');
}
