export function installPreferences(services) {
  function queueSave() {
    services.els.saveState.textContent = 'Saving…';
    clearTimeout(services.saveTimer);
    services.saveTimer = setTimeout(() => {
      savePreferences();
      services.els.saveState.textContent = 'Saved locally';
    }, 260);
  }
  const CORRUPT_PROJECT_BACKUP_KEY = `${services.STORAGE_KEY}.corruptBackup`;
  function preserveCorruptProject(rawValue, error, now = new Date().toISOString()) {
    const raw = String(rawValue ?? '');
    const details = error?.stack || error?.message || String(error || 'Unknown saved-project error.');
    try {
      localStorage.setItem(CORRUPT_PROJECT_BACKUP_KEY, JSON.stringify({
        capturedAt: now,
        raw,
        details
      }));
    } catch {}
    services.appState.projectLoadWarning = 'The saved project is corrupt and could not be loaded safely.';
    services.appState.projectLoadWarningDetails = details;
  }
  function readStoredProjectSafely(now = new Date().toISOString()) {
    const raw = localStorage.getItem(services.STORAGE_KEY) || '';
    if (!raw) return {
      project: {},
      corrupt: false
    };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved project data is not a project object.');
      return {
        project: parsed,
        corrupt: false
      };
    } catch (error) {
      preserveCorruptProject(raw, error, now);
      return {
        project: {},
        corrupt: true,
        error
      };
    }
  }
  function migrateStoredProjectSafely(savedProject, now = new Date().toISOString()) {
    try {
      return migratePodcastProject(savedProject, now);
    } catch (error) {
      let raw = '';
      try {
        raw = JSON.stringify(savedProject);
      } catch {
        raw = String(savedProject);
      }
      preserveCorruptProject(raw, error, now);
      return {
        project: createDefaultPodcastProject(),
        migrated: false,
        failed: true
      };
    }
  }
  function normaliseProjectSpeaker(speaker, index, {
    legacy = false
  } = {}) {
    const source = speaker && typeof speaker === 'object' ? services.deepClone(speaker) : {};
    const geminiVoiceName = services.normaliseWhitespace(source.geminiVoiceName ?? source.voice);
    const catalogueVoice = services.getGeminiTtsVoice(geminiVoiceName);
    const extras = {
      ...source
    };
    for (const key of ['id', 'speakerName', 'characterName', 'name', 'gender', 'voiceType', 'geminiVoiceName', 'voice', 'personality', 'deliveryInstructions', 'direction', 'voiceUnavailable']) delete extras[key];
    const result = {
      ...extras,
      id: legacy ? `host-${index + 1}` : services.normaliseWhitespace(source.id) || `host-${index + 1}`,
      speakerName: services.normaliseWhitespace(source.speakerName ?? source.characterName ?? source.name) || `Host ${index + 1}`,
      gender: legacy ? catalogueVoice?.gender || '' : services.GEMINI_TTS_VOICE_GENDERS.includes(String(source.gender || '').toLowerCase()) ? String(source.gender).toLowerCase() : '',
      voiceType: legacy ? catalogueVoice?.type || '' : services.normaliseWhitespace(source.voiceType).toLowerCase(),
      geminiVoiceName,
      personality: services.normaliseWhitespace(source.personality),
      deliveryInstructions: services.normaliseWhitespace(source.deliveryInstructions ?? source.direction)
    };
    if (geminiVoiceName && !catalogueVoice) result.voiceUnavailable = true;
    return result;
  }
  function normaliseSelectedModels(selectedModels = {}) {
    const source = selectedModels && typeof selectedModels === 'object' ? services.deepClone(selectedModels) : {};
    const text = services.normaliseModelSelection(source.textModel, source.customTextModel, services.SUPPORTED_TEXT_MODELS, services.DEFAULT_TEXT_MODEL);
    const tts = services.normaliseModelSelection(source.ttsModel, source.customTtsModel, services.SUPPORTED_TTS_MODELS, services.DEFAULT_TTS_MODEL);
    return {
      ...source,
      textModel: text.selection,
      customTextModel: text.customValue,
      ttsModel: tts.selection,
      customTtsModel: tts.customValue
    };
  }
  function createDefaultPodcastProject() {
    return {
      schemaVersion: services.PODCAST_PROJECT_SCHEMA_VERSION,
      topic: '',
      language: 'English',
      customLanguage: '',
      durationMinutes: services.DEFAULT_DURATION_MINUTES,
      format: 'Friendly conversation',
      customFormat: '',
      tones: ['Informative', 'Casual'],
      instructions: '',
      speakers: services.createDefaultPodcastSpeakers(),
      script: null,
      audioCacheReferences: {},
      selectedModels: {
        textModel: services.DEFAULT_TEXT_MODEL,
        customTextModel: '',
        ttsModel: services.DEFAULT_TTS_MODEL,
        customTtsModel: ''
      },
      settings: {
        theme: 'light',
        maxTtsCharacters: services.DEFAULT_MAX_TTS_CHARACTERS,
        speakingRate: services.DEFAULT_SPEAKING_RATE
      },
      lastModified: ''
    };
  }
  function migratePodcastProject(savedProject, now = new Date().toISOString()) {
    const source = savedProject && typeof savedProject === 'object' ? savedProject : {};
    if (!Object.keys(source).length) return {
      project: createDefaultPodcastProject(),
      migrated: false
    };
    if (Number(source.schemaVersion) === services.PODCAST_PROJECT_SCHEMA_VERSION && Array.isArray(source.speakers)) {
      const project = services.deepClone(source);
      const previousModels = project.selectedModels && typeof project.selectedModels === 'object' ? project.selectedModels : {};
      project.selectedModels = normaliseSelectedModels(previousModels);
      return {
        project,
        migrated: JSON.stringify(previousModels) !== JSON.stringify(project.selectedModels)
      };
    }
    const defaults = createDefaultPodcastProject();
    const podcast = source.podcast && typeof source.podcast === 'object' ? source.podcast : source;
    const legacySpeakers = Array.isArray(source.speakers) ? source.speakers : Array.isArray(source.characters) ? source.characters : source.characterName || source.name || source.voice ? [source] : [];
    const speakers = legacySpeakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index, {
      legacy: true
    }));
    while (speakers.length < 2) speakers.push({
      ...defaults.speakers[speakers.length]
    });
    const selectedModels = source.selectedModels && typeof source.selectedModels === 'object' ? source.selectedModels : {};
    const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
    return {
      migrated: true,
      project: {
        schemaVersion: services.PODCAST_PROJECT_SCHEMA_VERSION,
        topic: podcast.topic ?? defaults.topic,
        language: podcast.language ?? defaults.language,
        customLanguage: podcast.customLanguage ?? defaults.customLanguage,
        durationMinutes: podcast.durationMinutes ?? defaults.durationMinutes,
        format: podcast.format ?? defaults.format,
        customFormat: podcast.customFormat ?? defaults.customFormat,
        tones: Array.isArray(podcast.tones) ? services.deepClone(podcast.tones) : defaults.tones,
        instructions: podcast.instructions ?? defaults.instructions,
        speakers,
        script: source.script ?? defaults.script,
        audioCacheReferences: source.audioCacheReferences && typeof source.audioCacheReferences === 'object' ? services.deepClone(source.audioCacheReferences) : {},
        selectedModels: normaliseSelectedModels({
          ...selectedModels,
          textModel: selectedModels.textModel ?? source.textModel ?? defaults.selectedModels.textModel,
          customTextModel: selectedModels.customTextModel ?? source.customTextModel ?? defaults.selectedModels.customTextModel,
          ttsModel: selectedModels.ttsModel ?? source.ttsModel ?? defaults.selectedModels.ttsModel,
          customTtsModel: selectedModels.customTtsModel ?? source.customTtsModel ?? defaults.selectedModels.customTtsModel
        }),
        settings: {
          theme: settings.theme ?? source.theme ?? defaults.settings.theme,
          maxTtsCharacters: settings.maxTtsCharacters ?? source.maxTtsCharacters ?? defaults.settings.maxTtsCharacters,
          speakingRate: settings.speakingRate ?? source.speakingRate ?? defaults.settings.speakingRate
        },
        lastModified: now
      }
    };
  }
  function isSafeSavedScript(script, speakers) {
    if (!script || typeof script !== 'object' || Array.isArray(script) || !Array.isArray(script.segments) || script.segments.length < 2) return false;
    const names = new Set((Array.isArray(speakers) ? speakers : []).map(speaker => services.normaliseWhitespace(speaker?.speakerName)).filter(Boolean));
    return names.size === 2 && typeof script.title === 'string' && script.segments.every(segment => segment && typeof segment === 'object' && !Array.isArray(segment) && typeof segment.speaker === 'string' && names.has(services.normaliseWhitespace(segment.speaker)) && typeof segment.direction === 'string' && typeof segment.text === 'string' && Boolean(services.normaliseWhitespace(segment.text)));
  }
  function createPodcastProjectSnapshot(state = services.appState) {
    const speakers = Array.isArray(state.speakers) ? state.speakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index)) : services.createDefaultPodcastSpeakers();
    while (speakers.length < 2) speakers.push(services.createDefaultPodcastSpeakers()[speakers.length]);
    return {
      schemaVersion: services.PODCAST_PROJECT_SCHEMA_VERSION,
      topic: state.podcast.topic,
      language: state.podcast.language,
      customLanguage: state.podcast.customLanguage,
      durationMinutes: state.podcast.durationMinutes,
      format: state.podcast.format,
      customFormat: state.podcast.customFormat,
      tones: services.deepClone(state.podcast.tones),
      instructions: state.podcast.instructions,
      speakers,
      script: services.deepClone(state.script ?? state.legacyScript ?? null),
      audioCacheReferences: services.deepClone(state.audioCacheReferences || {}),
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
    const comparable = services.deepClone(project || {});
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
    nextProject.lastModified = contentChanged ? now : previousResult.project.lastModified || services.appState.lastModified || '';
    services.appState.schemaVersion = services.PODCAST_PROJECT_SCHEMA_VERSION;
    services.appState.lastModified = nextProject.lastModified;
    if (contentChanged || previousResult.migrated) localStorage.setItem(services.STORAGE_KEY, JSON.stringify(nextProject));
    if (services.appState.connection.rememberKey && services.appState.connection.apiKey) {
      localStorage.setItem(services.API_KEY_STORAGE_KEY, services.appState.connection.apiKey);
      sessionStorage.removeItem(services.SESSION_KEY);
    } else {
      localStorage.removeItem(services.API_KEY_STORAGE_KEY);
      if (services.appState.connection.apiKey) sessionStorage.setItem(services.SESSION_KEY, services.appState.connection.apiKey);else sessionStorage.removeItem(services.SESSION_KEY);
    }
    return nextProject;
  }
  function loadPreferences(now = new Date().toISOString()) {
    const storedResult = readStoredProjectSafely(now);
    const saved = storedResult.project;
    const hasSavedProject = Boolean(Object.keys(saved).length);
    const migration = migrateStoredProjectSafely(saved, now);
    const project = migration.project;
    if (hasSavedProject && migration.migrated) localStorage.setItem(services.STORAGE_KEY, JSON.stringify(project));
    services.appState.schemaVersion = services.PODCAST_PROJECT_SCHEMA_VERSION;
    services.appState.settings.theme = project.settings?.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    services.appState.settings.maxTtsCharacters = Number(project.settings?.maxTtsCharacters) || services.DEFAULT_MAX_TTS_CHARACTERS;
    services.appState.settings.speakingRate = Number(project.settings?.speakingRate) || services.DEFAULT_SPEAKING_RATE;
    services.appState.connection.textModel = project.selectedModels?.textModel ?? services.DEFAULT_TEXT_MODEL;
    services.appState.connection.customTextModel = project.selectedModels?.customTextModel ?? '';
    services.appState.connection.ttsModel = project.selectedModels?.ttsModel ?? services.DEFAULT_TTS_MODEL;
    services.appState.connection.customTtsModel = project.selectedModels?.customTtsModel ?? '';
    services.appState.podcast = {
      ...services.appState.podcast,
      topic: project.topic ?? services.appState.podcast.topic,
      language: project.language ?? services.appState.podcast.language,
      customLanguage: project.customLanguage ?? services.appState.podcast.customLanguage,
      durationMinutes: project.durationMinutes ?? services.appState.podcast.durationMinutes,
      format: project.format ?? services.appState.podcast.format,
      customFormat: project.customFormat ?? services.appState.podcast.customFormat,
      tones: Array.isArray(project.tones) ? services.deepClone(project.tones) : services.appState.podcast.tones,
      instructions: project.instructions ?? services.appState.podcast.instructions
    };
    services.appState.speakers = Array.isArray(project.speakers) ? project.speakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index)) : services.createDefaultPodcastSpeakers();
    while (services.appState.speakers.length < 2) services.appState.speakers.push(services.createDefaultPodcastSpeakers()[services.appState.speakers.length]);
    services.appState.audioCacheReferences = project.audioCacheReferences && typeof project.audioCacheReferences === 'object' ? services.deepClone(project.audioCacheReferences) : {};
    services.appState.lastModified = project.lastModified || '';
    services.appState.script = null;
    services.appState.legacyScript = null;
    if (project.script?.segments?.length && isSafeSavedScript(project.script, services.appState.speakers)) {
      services.appState.script = services.deepClone(project.script);
      services.appState.originalScript = services.deepClone(project.script);
    } else if (project.script != null) {
      services.appState.legacyScript = services.deepClone(project.script);
      if (Number(project.schemaVersion) === services.PODCAST_PROJECT_SCHEMA_VERSION) {
        services.appState.projectLoadWarning = 'The saved script was invalid and was not loaded.';
      }
    }
    const storedApiKey = localStorage.getItem(services.API_KEY_STORAGE_KEY);
    services.appState.connection.apiKey = storedApiKey || sessionStorage.getItem(services.SESSION_KEY) || '';
    services.appState.connection.rememberKey = Boolean(storedApiKey);
    return migration;
  }
  Object.assign(services, {
    queueSave,
    CORRUPT_PROJECT_BACKUP_KEY,
    preserveCorruptProject,
    readStoredProjectSafely,
    migrateStoredProjectSafely,
    normaliseProjectSpeaker,
    normaliseSelectedModels,
    isSafeSavedScript,
    createDefaultPodcastProject,
    migratePodcastProject,
    createPodcastProjectSnapshot,
    stableProjectValue,
    projectContentSignature,
    savePreferences,
    loadPreferences
  });
  return services;
}
