function queueSave() {
  els.saveState.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { savePreferences(); els.saveState.textContent = 'Saved locally'; }, 260);
}

const CORRUPT_PROJECT_BACKUP_KEY = `${STORAGE_KEY}.corruptBackup`;

function preserveCorruptProject(rawValue, error, now = new Date().toISOString()) {
  const raw = String(rawValue ?? '');
  const details = error?.stack || error?.message || String(error || 'Unknown saved-project error.');
  try {
    localStorage.setItem(CORRUPT_PROJECT_BACKUP_KEY, JSON.stringify({ capturedAt: now, raw, details }));
  } catch {}
  appState.projectLoadWarning = 'The saved project is corrupt and could not be loaded safely.';
  appState.projectLoadWarningDetails = details;
}

function readStoredProjectSafely(now = new Date().toISOString()) {
  const raw = localStorage.getItem(STORAGE_KEY) || '';
  if (!raw) return { project: {}, corrupt: false };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved project data is not a project object.');
    return { project: parsed, corrupt: false };
  } catch (error) {
    preserveCorruptProject(raw, error, now);
    return { project: {}, corrupt: true, error };
  }
}

function migrateStoredProjectSafely(savedProject, now = new Date().toISOString()) {
  try {
    return migratePodcastProject(savedProject, now);
  } catch (error) {
    let raw = '';
    try { raw = JSON.stringify(savedProject); } catch { raw = String(savedProject); }
    preserveCorruptProject(raw, error, now);
    return { project: createDefaultPodcastProject(), migrated: false, failed: true };
  }
}

function normaliseProjectSpeaker(speaker, index, { legacy = false } = {}) {
  const source = speaker && typeof speaker === 'object' ? deepClone(speaker) : {};
  const geminiVoiceName = normaliseWhitespace(source.geminiVoiceName ?? source.voice);
  const catalogueVoice = getGeminiTtsVoice(geminiVoiceName);
  const extras = { ...source };
  for (const key of ['id', 'speakerName', 'characterName', 'name', 'gender', 'voiceType', 'geminiVoiceName', 'voice', 'personality', 'deliveryInstructions', 'direction', 'voiceUnavailable']) delete extras[key];

  const result = {
    ...extras,
    id: legacy ? `host-${index + 1}` : normaliseWhitespace(source.id) || `host-${index + 1}`,
    speakerName: normaliseWhitespace(source.speakerName ?? source.characterName ?? source.name) || `Host ${index + 1}`,
    gender: legacy ? (catalogueVoice?.gender || '') : (GEMINI_TTS_VOICE_GENDERS.includes(String(source.gender || '').toLowerCase()) ? String(source.gender).toLowerCase() : ''),
    voiceType: legacy ? (catalogueVoice?.type || '') : normaliseWhitespace(source.voiceType).toLowerCase(),
    geminiVoiceName,
    personality: normaliseWhitespace(source.personality),
    deliveryInstructions: normaliseWhitespace(source.deliveryInstructions ?? source.direction)
  };

  if (geminiVoiceName && !catalogueVoice) result.voiceUnavailable = true;
  return result;
}

function createDefaultPodcastProject() {
  return {
    schemaVersion: PODCAST_PROJECT_SCHEMA_VERSION,
    topic: '',
    language: 'English',
    customLanguage: '',
    durationMinutes: 5,
    format: 'Friendly conversation',
    customFormat: '',
    tones: ['Informative', 'Casual'],
    instructions: '',
    speakers: createDefaultPodcastSpeakers(),
    script: null,
    audioCacheReferences: {},
    selectedModels: {
      textModel: 'gemini-3.6-flash',
      customTextModel: '',
      ttsModel: 'gemini-3.1-flash-tts-preview',
      customTtsModel: ''
    },
    settings: {
      theme: 'light',
      maxTtsCharacters: DEFAULT_MAX_TTS_CHARACTERS,
      speakingRate: 140
    },
    lastModified: ''
  };
}

function migratePodcastProject(savedProject, now = new Date().toISOString()) {
  const source = savedProject && typeof savedProject === 'object' ? savedProject : {};
  if (!Object.keys(source).length) return { project: createDefaultPodcastProject(), migrated: false };
  if (Number(source.schemaVersion) === PODCAST_PROJECT_SCHEMA_VERSION && Array.isArray(source.speakers)) {
    return { project: deepClone(source), migrated: false };
  }

  const defaults = createDefaultPodcastProject();
  const podcast = source.podcast && typeof source.podcast === 'object' ? source.podcast : source;
  const legacySpeakers = Array.isArray(source.speakers)
    ? source.speakers
    : Array.isArray(source.characters)
      ? source.characters
      : (source.characterName || source.name || source.voice ? [source] : []);
  const speakers = legacySpeakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index, { legacy: true }));
  while (speakers.length < 2) speakers.push({ ...defaults.speakers[speakers.length] });

  const selectedModels = source.selectedModels && typeof source.selectedModels === 'object' ? source.selectedModels : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};

  return {
    migrated: true,
    project: {
      schemaVersion: PODCAST_PROJECT_SCHEMA_VERSION,
      topic: podcast.topic ?? defaults.topic,
      language: podcast.language ?? defaults.language,
      customLanguage: podcast.customLanguage ?? defaults.customLanguage,
      durationMinutes: podcast.durationMinutes ?? defaults.durationMinutes,
      format: podcast.format ?? defaults.format,
      customFormat: podcast.customFormat ?? defaults.customFormat,
      tones: Array.isArray(podcast.tones) ? deepClone(podcast.tones) : defaults.tones,
      instructions: podcast.instructions ?? defaults.instructions,
      speakers,
      script: source.script ?? defaults.script,
      audioCacheReferences: source.audioCacheReferences && typeof source.audioCacheReferences === 'object' ? deepClone(source.audioCacheReferences) : {},
      selectedModels: {
        textModel: selectedModels.textModel ?? source.textModel ?? defaults.selectedModels.textModel,
        customTextModel: selectedModels.customTextModel ?? source.customTextModel ?? defaults.selectedModels.customTextModel,
        ttsModel: selectedModels.ttsModel ?? source.ttsModel ?? defaults.selectedModels.ttsModel,
        customTtsModel: selectedModels.customTtsModel ?? source.customTtsModel ?? defaults.selectedModels.customTtsModel
      },
      settings: {
        theme: settings.theme ?? source.theme ?? defaults.settings.theme,
        maxTtsCharacters: settings.maxTtsCharacters ?? source.maxTtsCharacters ?? defaults.settings.maxTtsCharacters,
        speakingRate: settings.speakingRate ?? source.speakingRate ?? defaults.settings.speakingRate
      },
      lastModified: now
    }
  };
}

function createPodcastProjectSnapshot(state = appState) {
  const speakers = Array.isArray(state.speakers) ? state.speakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index)) : createDefaultPodcastSpeakers();
  while (speakers.length < 2) speakers.push(createDefaultPodcastSpeakers()[speakers.length]);
  return {
    schemaVersion: PODCAST_PROJECT_SCHEMA_VERSION,
    topic: state.podcast.topic,
    language: state.podcast.language,
    customLanguage: state.podcast.customLanguage,
    durationMinutes: state.podcast.durationMinutes,
    format: state.podcast.format,
    customFormat: state.podcast.customFormat,
    tones: deepClone(state.podcast.tones),
    instructions: state.podcast.instructions,
    speakers,
    script: deepClone(state.script ?? state.legacyScript ?? null),
    audioCacheReferences: deepClone(state.audioCacheReferences || {}),
    selectedModels: {
      textModel: state.connection.textModel,
      customTextModel: state.connection.customTextModel,
      ttsModel: state.connection.ttsModel,
      customTtsModel: state.connection.customTtsModel
    },
    settings: {
      theme: state.settings.theme,
      maxTtsCharacters: state.settings.maxTtsCharacters,
      speakingRate: state.settings.speakingRate
    },
    lastModified: state.lastModified || ''
  };
}

function stableProjectValue(value) {
  if (Array.isArray(value)) return value.map(stableProjectValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableProjectValue(value[key])]));
}

function projectContentSignature(project) {
  const comparable = deepClone(project || {});
  delete comparable.lastModified;
  return JSON.stringify(stableProjectValue(comparable));
}

function savePreferences(now = new Date().toISOString()) {
  const storedResult = readStoredProjectSafely(now);
  const stored = storedResult.project;
  const previousResult = migrateStoredProjectSafely(stored, now);
  const hasStoredProject = Boolean(Object.keys(stored).length);
  const nextProject = createPodcastProjectSnapshot();
  const contentChanged = !hasStoredProject || projectContentSignature(nextProject) !== projectContentSignature(previousResult.project);
  nextProject.lastModified = contentChanged ? now : (previousResult.project.lastModified || appState.lastModified || '');
  appState.schemaVersion = PODCAST_PROJECT_SCHEMA_VERSION;
  appState.lastModified = nextProject.lastModified;

  if (contentChanged || previousResult.migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProject));
  if (appState.connection.rememberKey && appState.connection.apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, appState.connection.apiKey);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    if (appState.connection.apiKey) sessionStorage.setItem(SESSION_KEY, appState.connection.apiKey);
    else sessionStorage.removeItem(SESSION_KEY);
  }
  return nextProject;
}

function loadPreferences(now = new Date().toISOString()) {
  const storedResult = readStoredProjectSafely(now);
  const saved = storedResult.project;
  const hasSavedProject = Boolean(Object.keys(saved).length);
  const migration = migrateStoredProjectSafely(saved, now);
  const project = migration.project;
  if (hasSavedProject && migration.migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(project));

  appState.schemaVersion = PODCAST_PROJECT_SCHEMA_VERSION;
  appState.settings.theme = project.settings?.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  appState.settings.maxTtsCharacters = Number(project.settings?.maxTtsCharacters) || DEFAULT_MAX_TTS_CHARACTERS;
  appState.settings.speakingRate = Number(project.settings?.speakingRate) || 140;
  appState.connection.textModel = project.selectedModels?.textModel || appState.connection.textModel;
  appState.connection.customTextModel = project.selectedModels?.customTextModel || '';
  appState.connection.ttsModel = project.selectedModels?.ttsModel || appState.connection.ttsModel;
  appState.connection.customTtsModel = project.selectedModels?.customTtsModel || '';
  appState.podcast = {
    ...appState.podcast,
    topic: project.topic ?? appState.podcast.topic,
    language: project.language ?? appState.podcast.language,
    customLanguage: project.customLanguage ?? appState.podcast.customLanguage,
    durationMinutes: project.durationMinutes ?? appState.podcast.durationMinutes,
    format: project.format ?? appState.podcast.format,
    customFormat: project.customFormat ?? appState.podcast.customFormat,
    tones: Array.isArray(project.tones) ? deepClone(project.tones) : appState.podcast.tones,
    instructions: project.instructions ?? appState.podcast.instructions
  };
  appState.speakers = Array.isArray(project.speakers) ? project.speakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index)) : createDefaultPodcastSpeakers();
  while (appState.speakers.length < 2) appState.speakers.push(createDefaultPodcastSpeakers()[appState.speakers.length]);
  appState.audioCacheReferences = project.audioCacheReferences && typeof project.audioCacheReferences === 'object' ? deepClone(project.audioCacheReferences) : {};
  appState.lastModified = project.lastModified || '';
  appState.script = null;
  appState.legacyScript = null;
  if (project.script?.segments?.length) {
    appState.script = deepClone(project.script);
    appState.originalScript = deepClone(project.script);
  } else if (project.script != null) {
    appState.legacyScript = deepClone(project.script);
  }

  const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  appState.connection.apiKey = storedApiKey || sessionStorage.getItem(SESSION_KEY) || '';
  appState.connection.rememberKey = Boolean(storedApiKey);
  return migration;
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
