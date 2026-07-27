export function installPreferences(ctx) {
  const CORRUPT_PROJECT_BACKUP_KEY = `${ctx.STORAGE_KEY}.corruptBackup`;
  ctx.expose("CORRUPT_PROJECT_BACKUP_KEY", CORRUPT_PROJECT_BACKUP_KEY);
  function preserveCorruptProject(rawValue, error, now = new Date().toISOString()) {
      const raw = String(rawValue ?? '');
      const details = error?.stack || error?.message || String(error || 'Unknown saved-project error.');
      try {
          localStorage.setItem(CORRUPT_PROJECT_BACKUP_KEY, JSON.stringify({ capturedAt: now, raw, details }));
      }
      catch { }
      ctx.appState.projectLoadWarning = 'The saved project is corrupt and could not be loaded safely.';
      ctx.appState.projectLoadWarningDetails = details;
  }
  ctx.expose("preserveCorruptProject", preserveCorruptProject);
  function readStoredProjectSafely(now = new Date().toISOString()) {
      const raw = localStorage.getItem(ctx.STORAGE_KEY) || '';
      if (!raw)
          return { project: {}, corrupt: false };
      try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
              throw new Error('Saved project data is not a project object.');
          return { project: parsed, corrupt: false };
      }
      catch (error) {
          preserveCorruptProject(raw, error, now);
          return { project: {}, corrupt: true, error };
      }
  }
  ctx.expose("readStoredProjectSafely", readStoredProjectSafely);
  function migrateStoredProjectSafely(savedProject, now = new Date().toISOString()) {
      try {
          return migratePodcastProject(savedProject, now);
      }
      catch (error) {
          let raw = '';
          try {
              raw = JSON.stringify(savedProject);
          }
          catch {
              raw = String(savedProject);
          }
          preserveCorruptProject(raw, error, now);
          return { project: createDefaultPodcastProject(), migrated: false, failed: true };
      }
  }
  ctx.expose("migrateStoredProjectSafely", migrateStoredProjectSafely);
  function normaliseProjectSpeaker(speaker, index, { legacy = false } = {}) {
      const source = speaker && typeof speaker === 'object' ? ctx.deepClone(speaker) : {};
      const geminiVoiceName = ctx.normaliseWhitespace(source.geminiVoiceName ?? source.voice);
      const catalogueVoice = ctx.getGeminiTtsVoice(geminiVoiceName);
      const extras = { ...source };
      for (const key of ['id', 'speakerName', 'characterName', 'name', 'gender', 'voiceType', 'geminiVoiceName', 'voice', 'personality', 'deliveryInstructions', 'direction', 'voiceUnavailable'])
          delete extras[key];
      const result = {
          ...extras,
          id: legacy ? `host-${index + 1}` : ctx.normaliseWhitespace(source.id) || `host-${index + 1}`,
          speakerName: ctx.normaliseWhitespace(source.speakerName ?? source.characterName ?? source.name) || `Host ${index + 1}`,
          gender: legacy ? (catalogueVoice?.gender || '') : (ctx.GEMINI_TTS_VOICE_GENDERS.includes(String(source.gender || '').toLowerCase()) ? String(source.gender).toLowerCase() : ''),
          voiceType: legacy ? (catalogueVoice?.type || '') : ctx.normaliseWhitespace(source.voiceType).toLowerCase(),
          geminiVoiceName,
          personality: ctx.normaliseWhitespace(source.personality),
          deliveryInstructions: ctx.normaliseWhitespace(source.deliveryInstructions ?? source.direction)
      };
      if (geminiVoiceName && !catalogueVoice)
          result.voiceUnavailable = true;
      return result;
  }
  ctx.expose("normaliseProjectSpeaker", normaliseProjectSpeaker);
  function createDefaultPodcastProject() {
      return {
          schemaVersion: ctx.PODCAST_PROJECT_SCHEMA_VERSION,
          topic: '',
          language: 'English',
          customLanguage: '',
          durationMinutes: 5,
          format: 'Friendly conversation',
          customFormat: '',
          tones: ['Informative', 'Casual'],
          instructions: '',
          speakers: ctx.createDefaultPodcastSpeakers(),
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
              maxTtsCharacters: ctx.DEFAULT_MAX_TTS_CHARACTERS,
              speakingRate: 140
          },
          lastModified: ''
      };
  }
  ctx.expose("createDefaultPodcastProject", createDefaultPodcastProject);
  function migratePodcastProject(savedProject, now = new Date().toISOString()) {
      const source = savedProject && typeof savedProject === 'object' ? savedProject : {};
      if (!Object.keys(source).length)
          return { project: createDefaultPodcastProject(), migrated: false };
      if (Number(source.schemaVersion) === ctx.PODCAST_PROJECT_SCHEMA_VERSION && Array.isArray(source.speakers)) {
          return { project: ctx.deepClone(source), migrated: false };
      }
      const defaults = createDefaultPodcastProject();
      const podcast = source.podcast && typeof source.podcast === 'object' ? source.podcast : source;
      const legacySpeakers = Array.isArray(source.speakers)
          ? source.speakers
          : Array.isArray(source.characters)
              ? source.characters
              : (source.characterName || source.name || source.voice ? [source] : []);
      const speakers = legacySpeakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index, { legacy: true }));
      while (speakers.length < 2)
          speakers.push({ ...defaults.speakers[speakers.length] });
      const selectedModels = source.selectedModels && typeof source.selectedModels === 'object' ? source.selectedModels : {};
      const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
      return {
          migrated: true,
          project: {
              schemaVersion: ctx.PODCAST_PROJECT_SCHEMA_VERSION,
              topic: podcast.topic ?? defaults.topic,
              language: podcast.language ?? defaults.language,
              customLanguage: podcast.customLanguage ?? defaults.customLanguage,
              durationMinutes: podcast.durationMinutes ?? defaults.durationMinutes,
              format: podcast.format ?? defaults.format,
              customFormat: podcast.customFormat ?? defaults.customFormat,
              tones: Array.isArray(podcast.tones) ? ctx.deepClone(podcast.tones) : defaults.tones,
              instructions: podcast.instructions ?? defaults.instructions,
              speakers,
              script: source.script ?? defaults.script,
              audioCacheReferences: source.audioCacheReferences && typeof source.audioCacheReferences === 'object' ? ctx.deepClone(source.audioCacheReferences) : {},
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
  ctx.expose("migratePodcastProject", migratePodcastProject);
  function createPodcastProjectSnapshot(state = ctx.appState) {
      const speakers = Array.isArray(state.speakers) ? state.speakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index)) : ctx.createDefaultPodcastSpeakers();
      while (speakers.length < 2)
          speakers.push(ctx.createDefaultPodcastSpeakers()[speakers.length]);
      return {
          schemaVersion: ctx.PODCAST_PROJECT_SCHEMA_VERSION,
          topic: state.podcast.topic,
          language: state.podcast.language,
          customLanguage: state.podcast.customLanguage,
          durationMinutes: state.podcast.durationMinutes,
          format: state.podcast.format,
          customFormat: state.podcast.customFormat,
          tones: ctx.deepClone(state.podcast.tones),
          instructions: state.podcast.instructions,
          speakers,
          script: ctx.deepClone(state.script ?? state.legacyScript ?? null),
          audioCacheReferences: ctx.deepClone(state.audioCacheReferences || {}),
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
  ctx.expose("createPodcastProjectSnapshot", createPodcastProjectSnapshot);
  function stableProjectValue(value) {
      if (Array.isArray(value))
          return value.map(stableProjectValue);
      if (!value || typeof value !== 'object')
          return value;
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableProjectValue(value[key])]));
  }
  ctx.expose("stableProjectValue", stableProjectValue);
  function projectContentSignature(project) {
      const comparable = ctx.deepClone(project || {});
      delete comparable.lastModified;
      return JSON.stringify(stableProjectValue(comparable));
  }
  ctx.expose("projectContentSignature", projectContentSignature);
  function savePreferences(now = new Date().toISOString()) {
      const storedResult = readStoredProjectSafely(now);
      const stored = storedResult.project;
      const previousResult = migrateStoredProjectSafely(stored, now);
      const hasStoredProject = Boolean(Object.keys(stored).length);
      const nextProject = createPodcastProjectSnapshot();
      const contentChanged = !hasStoredProject || projectContentSignature(nextProject) !== projectContentSignature(previousResult.project);
      nextProject.lastModified = contentChanged ? now : (previousResult.project.lastModified || ctx.appState.lastModified || '');
      ctx.appState.schemaVersion = ctx.PODCAST_PROJECT_SCHEMA_VERSION;
      ctx.appState.lastModified = nextProject.lastModified;
      if (contentChanged || previousResult.migrated)
          localStorage.setItem(ctx.STORAGE_KEY, JSON.stringify(nextProject));
      if (ctx.appState.connection.rememberKey && ctx.appState.connection.apiKey) {
          localStorage.setItem(ctx.API_KEY_STORAGE_KEY, ctx.appState.connection.apiKey);
          sessionStorage.removeItem(ctx.SESSION_KEY);
      }
      else {
          localStorage.removeItem(ctx.API_KEY_STORAGE_KEY);
          if (ctx.appState.connection.apiKey)
              sessionStorage.setItem(ctx.SESSION_KEY, ctx.appState.connection.apiKey);
          else
              sessionStorage.removeItem(ctx.SESSION_KEY);
      }
      return nextProject;
  }
  ctx.expose("savePreferences", savePreferences);
  function loadPreferences(now = new Date().toISOString()) {
      const storedResult = readStoredProjectSafely(now);
      const saved = storedResult.project;
      const hasSavedProject = Boolean(Object.keys(saved).length);
      const migration = migrateStoredProjectSafely(saved, now);
      const project = migration.project;
      if (hasSavedProject && migration.migrated)
          localStorage.setItem(ctx.STORAGE_KEY, JSON.stringify(project));
      ctx.appState.schemaVersion = ctx.PODCAST_PROJECT_SCHEMA_VERSION;
      ctx.appState.settings.theme = project.settings?.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      ctx.appState.settings.maxTtsCharacters = Number(project.settings?.maxTtsCharacters) || ctx.DEFAULT_MAX_TTS_CHARACTERS;
      ctx.appState.settings.speakingRate = Number(project.settings?.speakingRate) || 140;
      ctx.appState.connection.textModel = project.selectedModels?.textModel || ctx.appState.connection.textModel;
      ctx.appState.connection.customTextModel = project.selectedModels?.customTextModel || '';
      ctx.appState.connection.ttsModel = project.selectedModels?.ttsModel || ctx.appState.connection.ttsModel;
      ctx.appState.connection.customTtsModel = project.selectedModels?.customTtsModel || '';
      ctx.appState.podcast = {
          ...ctx.appState.podcast,
          topic: project.topic ?? ctx.appState.podcast.topic,
          language: project.language ?? ctx.appState.podcast.language,
          customLanguage: project.customLanguage ?? ctx.appState.podcast.customLanguage,
          durationMinutes: project.durationMinutes ?? ctx.appState.podcast.durationMinutes,
          format: project.format ?? ctx.appState.podcast.format,
          customFormat: project.customFormat ?? ctx.appState.podcast.customFormat,
          tones: Array.isArray(project.tones) ? ctx.deepClone(project.tones) : ctx.appState.podcast.tones,
          instructions: project.instructions ?? ctx.appState.podcast.instructions
      };
      ctx.appState.speakers = Array.isArray(project.speakers) ? project.speakers.slice(0, 2).map((speaker, index) => normaliseProjectSpeaker(speaker, index)) : ctx.createDefaultPodcastSpeakers();
      while (ctx.appState.speakers.length < 2)
          ctx.appState.speakers.push(ctx.createDefaultPodcastSpeakers()[ctx.appState.speakers.length]);
      ctx.appState.audioCacheReferences = project.audioCacheReferences && typeof project.audioCacheReferences === 'object' ? ctx.deepClone(project.audioCacheReferences) : {};
      ctx.appState.lastModified = project.lastModified || '';
      ctx.appState.script = null;
      ctx.appState.legacyScript = null;
      if (project.script?.segments?.length) {
          ctx.appState.script = ctx.deepClone(project.script);
          ctx.appState.originalScript = ctx.deepClone(project.script);
      }
      else if (project.script != null) {
          ctx.appState.legacyScript = ctx.deepClone(project.script);
      }
      const storedApiKey = localStorage.getItem(ctx.API_KEY_STORAGE_KEY);
      ctx.appState.connection.apiKey = storedApiKey || sessionStorage.getItem(ctx.SESSION_KEY) || '';
      ctx.appState.connection.rememberKey = Boolean(storedApiKey);
      return migration;
  }
  ctx.expose("loadPreferences", loadPreferences);
}
