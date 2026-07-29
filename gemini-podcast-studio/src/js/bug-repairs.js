export function installBugRepairs(services) {
  const transientTtsStatuses = new Set([500, 502, 503, 504]);
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const normalise = value => typeof services.normaliseWhitespace === 'function'
    ? services.normaliseWhitespace(value)
    : String(value ?? '').replace(/\s+/g, ' ').trim();

  function getEditableScriptIssues(script = services.appState.script, speakers = services.appState.speakers) {
    if (!Array.isArray(script?.segments)) {
      return [{ code: 'MISSING_SEGMENTS', message: 'The script has no editable dialogue segments.' }];
    }

    const issues = [];
    if (script.segments.length < 2) {
      issues.push({ code: 'TOO_FEW_SEGMENTS', message: 'The script must contain at least two dialogue segments.' });
    }

    const maximumSegments = typeof services.getMaxScriptSegments === 'function'
      ? services.getMaxScriptSegments()
      : Number.POSITIVE_INFINITY;
    if (script.segments.length > maximumSegments) {
      issues.push({
        code: 'TOO_MANY_SEGMENTS',
        message: `The script contains ${script.segments.length} segments; the maximum is ${maximumSegments}.`
      });
    }

    const configuredNames = new Set((Array.isArray(speakers) ? speakers.slice(0, 2) : [])
      .map(speaker => normalise(speaker?.speakerName))
      .filter(Boolean));
    if (configuredNames.size !== 2) {
      issues.push({
        code: 'INVALID_SPEAKER_CONFIGURATION',
        message: 'Exactly two different configured speaker names are required.'
      });
    }

    script.segments.forEach((segment, index) => {
      if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
        issues.push({ code: 'INVALID_SEGMENT', index, message: `Segment ${index + 1} is invalid.` });
        return;
      }
      const speaker = normalise(segment.speaker);
      if (!configuredNames.has(speaker)) {
        issues.push({ code: 'UNKNOWN_SPEAKER', index, message: `Segment ${index + 1} uses an unconfigured speaker.` });
      }
      if (typeof segment.text !== 'string' || !normalise(segment.text)) {
        issues.push({ code: 'EMPTY_SEGMENT_TEXT', index, message: `Segment ${index + 1} has no spoken text.` });
      }
      if (typeof segment.direction !== 'string') {
        issues.push({ code: 'INVALID_DIRECTION', index, message: `Segment ${index + 1} has an invalid performance direction.` });
      }
    });

    return issues;
  }

  function isRetryableTtsStatus(status) {
    return transientTtsStatuses.has(Number(status));
  }

  async function requestTtsChunk(endpoint, transcript, speakerVoiceConfigs, {
    fetchImpl = fetch,
    sleep = delay,
    maxAttempts = 3
  } = {}) {
    const requestBody = services.buildTtsRequestBody(transcript, speakerVoiceConfigs);
    const attemptLimit = Math.min(3, Math.max(1, Math.trunc(Number(maxAttempts) || 1)));

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': services.appState.connection.apiKey
          },
          body: JSON.stringify(requestBody)
        });
      } catch (error) {
        if (attempt < attemptLimit && error instanceof TypeError) {
          await sleep(attempt * 250);
          continue;
        }
        throw error;
      }

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        if (isRetryableTtsStatus(response.status) && attempt < attemptLimit) {
          await sleep(attempt * 250);
          continue;
        }
        throw services.createApiError(response.status, 'Gemini returned non-JSON audio response data.', raw);
      }

      if (!response.ok) {
        if (isRetryableTtsStatus(response.status) && attempt < attemptLimit) {
          await sleep(attempt * 250);
          continue;
        }
        throw services.createApiError(
          response.status,
          data?.error?.message || `Audio request failed with HTTP ${response.status}.`,
          JSON.stringify(data, null, 2)
        );
      }

      const audioPart = data?.candidates
        ?.flatMap(candidate => candidate?.content?.parts || [])
        .find(part => part?.inlineData?.data);
      if (!audioPart) {
        throw services.createApiError(response.status, 'Gemini returned no audio.', JSON.stringify(data, null, 2));
      }

      return {
        pcmBytes: services.base64ToBytes(audioPart.inlineData.data),
        sampleRate: services.sampleRateFromMimeType(audioPart.inlineData.mimeType)
      };
    }

    throw new Error('TTS request exhausted all retry attempts.');
  }

  async function generateTtsPcm({ transcript, speakerVoiceConfigs = services.buildSpeakerVoiceConfigs() } = {}) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(services.getTtsModel())}:generateContent`;
    return requestTtsChunk(endpoint, transcript, speakerVoiceConfigs);
  }

  function getTtsScriptValidationIssue(script = services.appState.script, speakers = services.appState.speakers) {
    const issue = getEditableScriptIssues(script, speakers)[0];
    if (!issue) return null;
    return {
      title: 'Script is not ready',
      message: issue.message,
      suggestion: 'Correct the script before generating audio.'
    };
  }

  async function generatePodcastAudio() {
    if (!services.appState.script?.segments?.length) return;

    const speakerIssue = services.getTtsSpeakerValidationIssue?.();
    if (speakerIssue) {
      return services.showServiceError({ ...speakerIssue, details: '', retry: null });
    }

    const scriptIssue = getTtsScriptValidationIssue();
    if (scriptIssue) {
      return services.showServiceError({ ...scriptIssue, details: '', retry: null });
    }

    const invalidSpeaker = services.appState.speakers.find(speaker => {
      const voice = services.getGeminiTtsVoice(speaker.geminiVoiceName);
      return !voice || voice.gender !== speaker.gender || voice.type !== speaker.voiceType;
    });
    if (invalidSpeaker) {
      return services.showServiceError({
        title: 'Voice selection required',
        message: `${invalidSpeaker.speakerName || 'A speaker'} does not have a valid matching Gemini voice.`,
        suggestion: 'Select an available voice matching the chosen gender and voice type.',
        details: '',
        retry: null
      });
    }

    let chunks;
    try {
      chunks = services.createTtsChunks();
    } catch (error) {
      return services.showServiceError({
        title: 'Script segment is too long',
        message: error.message,
        suggestion: 'Split the long dialogue segment into shorter turns.',
        details: '',
        retry: null
      });
    }
    if (!chunks.length) return;

    const speakerVoiceConfigs = services.buildSpeakerVoiceConfigs();
    const mappingSignature = services.getSpeakerVoiceMappingSignature();
    services.hideServiceError();
    services.appState.lastAction = 'generate-audio';
    services.setBusy(true, 'audio', services.AUDIO_PROGRESS_MESSAGES);

    const startedAt = performance.now();
    const pcmParts = [];
    let sampleRate = 0;
    let pendingUrl = '';

    try {
      for (const chunk of chunks) {
        if (services.els.scriptLoadingMessage) {
          services.els.scriptLoadingMessage.textContent = chunks.length > 1
            ? `Generating audio chunk ${chunk.index + 1} of ${chunks.length}…`
            : 'Generating the conversation…';
        }

        let result;
        try {
          result = await services.generateTtsPcm({ transcript: chunk.transcript, speakerVoiceConfigs });
        } catch (error) {
          const chunkError = services.createApiError(
            Number(error?.status || 0),
            `TTS chunk ${chunk.index + 1} of ${chunks.length} failed. No partial audio was saved.`,
            error?.details || error?.stack || String(error)
          );
          chunkError.cause = error;
          throw chunkError;
        }

        if (sampleRate && result.sampleRate !== sampleRate) {
          throw new Error('Gemini returned inconsistent audio sample rates between TTS chunks.');
        }
        sampleRate = sampleRate || result.sampleRate;
        pcmParts.push(result.pcmBytes);
      }

      const pcmBytes = services.concatPcmBytes(pcmParts);
      const resolvedSampleRate = sampleRate || 24000;
      const wavBlob = services.pcm16ToWavBlob(pcmBytes, resolvedSampleRate, 1);
      pendingUrl = URL.createObjectURL(wavBlob);

      services.invalidatePodcastAudio('audio-regeneration');
      services.appState.audio = {
        blob: wavBlob,
        url: pendingUrl,
        sampleRate: resolvedSampleRate,
        generationSeconds: (performance.now() - startedAt) / 1000,
        durationSeconds: pcmBytes.byteLength / (resolvedSampleRate * 2),
        createdAt: new Date().toISOString()
      };
      pendingUrl = '';
      services.appState.audioCacheReferences = {
        voiceMappingSignature: mappingSignature,
        chunks: chunks.map(chunk => ({
          index: chunk.index,
          cacheKey: services.buildTtsChunkCacheKey({
            transcript: chunk.transcript,
            mappingSignature,
            index: chunk.index
          }),
          speakerOrder: speakerVoiceConfigs.map(config => config.speaker)
        }))
      };
      services.queueSave();
      services.setStage('audio');
    } catch (error) {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      services.handleGenerationError(
        error,
        'Audio generation failed',
        'Try a shorter script or select a different TTS model.',
        generatePodcastAudio
      );
    } finally {
      services.setBusy(false);
    }
  }

  function flushTypingHistory() {
    if (!services.typingHistoryTimer) return false;
    clearTimeout(services.typingHistoryTimer);
    services.typingHistoryTimer = null;
    services.snapshotScript();
    return true;
  }

  function undo() {
    flushTypingHistory();
    if (services.appState.historyIndex <= 0) return false;
    services.appState.historyIndex -= 1;
    services.appState.script = services.deepClone(services.appState.history[services.appState.historyIndex]);
    services.invalidatePodcastAudio('script-undo');
    services.renderScriptStage();
    services.queueSave();
    services.announce('Undid the last script change.');
    return true;
  }

  function redo() {
    flushTypingHistory();
    if (services.appState.historyIndex >= services.appState.history.length - 1) return false;
    services.appState.historyIndex += 1;
    services.appState.script = services.deepClone(services.appState.history[services.appState.historyIndex]);
    services.invalidatePodcastAudio('script-redo');
    services.renderScriptStage();
    services.queueSave();
    services.announce('Redid the script change.');
    return true;
  }

  function canPerformSegmentAction(segments, index, action) {
    if (!Array.isArray(segments) || !Number.isInteger(index) || index < 0 || index >= segments.length) return false;
    if (action === 'up') return index > 0;
    if (action === 'down') return index < segments.length - 1;
    if (action === 'delete') return segments.length > 2;
    return ['insert', 'duplicate'].includes(action);
  }

  function performSegmentAction(index, action) {
    const segments = services.appState.script?.segments;
    if (!canPerformSegmentAction(segments, index, action)) return false;

    flushTypingHistory();
    services.snapshotScript();
    if (action === 'up') [segments[index - 1], segments[index]] = [segments[index], segments[index - 1]];
    if (action === 'down') [segments[index + 1], segments[index]] = [segments[index], segments[index + 1]];
    if (action === 'duplicate') segments.splice(index + 1, 0, services.deepClone(segments[index]));
    if (action === 'delete') segments.splice(index, 1);
    if (action === 'insert') {
      const nextSpeaker = services.appState.speakers.find(speaker => speaker.speakerName !== segments[index].speaker)?.speakerName
        || services.appState.speakers[0].speakerName;
      segments.splice(index + 1, 0, { speaker: nextSpeaker, direction: '', text: '' });
    }

    services.appState.script.estimatedWords = services.getWordCount();
    services.invalidatePodcastAudio('script-structure-changed');
    services.snapshotScript({ force: true });
    services.queueSave();
    services.renderScriptStage();
    const focusIndex = action === 'delete'
      ? Math.min(index, segments.length - 1)
      : action === 'up'
        ? index - 1
        : action === 'down'
          ? index + 1
          : index + 1;
    requestAnimationFrame(() => services.els.scriptPanel
      .querySelector(`[data-segment-index="${focusIndex}"] textarea`)?.focus());
    services.announce(`Segment ${index + 1} ${action === 'delete' ? 'deleted' : action === 'duplicate' ? 'duplicated' : action === 'insert' ? 'inserted' : `moved ${action}`}.`);
    return true;
  }

  function reorderSegments(from, to) {
    const segments = services.appState.script?.segments;
    if (!Array.isArray(segments)
      || !Number.isInteger(from)
      || !Number.isInteger(to)
      || from === to
      || from < 0
      || to < 0
      || from >= segments.length
      || to >= segments.length) return false;

    flushTypingHistory();
    const [segment] = segments.splice(from, 1);
    segments.splice(to, 0, segment);
    services.invalidatePodcastAudio('script-reordered');
    services.snapshotScript({ force: true });
    services.queueSave();
    services.renderScriptStage();
    services.els.reorderStatus.textContent = `Segment moved to position ${to + 1} of ${segments.length}.`;
    return true;
  }

  const baseRenderScriptMetrics = services.renderScriptMetrics;
  function renderScriptMetrics() {
    baseRenderScriptMetrics();
    const issues = getEditableScriptIssues();
    if (!issues.length || !services.els.scriptValidation) return;
    services.els.scriptValidation.className = 'validation-status warning';
    services.els.scriptValidation.textContent = issues.map(issue => issue.message).join(' ');
    services.els.generateAudioButton.disabled = true;
  }

  const baseResetProject = services.resetProject;
  function resetProject(options = {}) {
    const result = baseResetProject(options);
    services.appState.podcast.durationMinutes = services.DEFAULT_DURATION_MINUTES;
    if (!options.preserveConnection) {
      services.appState.connection.textModel = services.DEFAULT_TEXT_MODEL;
      services.appState.connection.ttsModel = services.DEFAULT_TTS_MODEL;
    }
    if (!options.preservePreferences) {
      services.appState.settings.speakingRate = services.DEFAULT_SPEAKING_RATE;
    }
    services.populateInputsFromState();
    services.renderConnectionForms();
    services.savePreferences();
    services.renderCurrentStage({ focus: false });
    return result;
  }

  function commitSettingsFromDialog() {
    services.appState.settings.maxTtsCharacters = Math.min(
      30000,
      Math.max(2000, Number(services.els.maxTtsCharacters.value) || services.DEFAULT_MAX_TTS_CHARACTERS)
    );
    services.appState.settings.speakingRate = Math.min(
      200,
      Math.max(100, Number(services.els.speakingRate.value) || services.DEFAULT_SPEAKING_RATE)
    );
    services.queueSave();
    if (services.appState.currentStage === 'script') services.renderScriptMetrics();
    services.updateTargetSummary();
  }

  function renderConnectionStatus() {
    const configured = Boolean(
      services.appState.connection.apiKey
      && services.getTextModel()
      && services.getTtsModel()
    );
    services.els.connectionChip.classList.toggle('connected', configured);
    services.els.connectionLabel.textContent = configured ? 'Gemini configured' : 'Gemini not configured';
    services.els.connectionModels.textContent = configured
      ? `${services.getTextModel()} · ${services.getTtsModel()}`
      : 'Add API key';
  }

  function validateCurrentProject(project) {
    if (Number(project?.schemaVersion) !== services.PODCAST_PROJECT_SCHEMA_VERSION) return;
    if (!Array.isArray(project.speakers)) throw new Error('Saved project has no speaker records.');
    const speakers = project.speakers.slice(0, 2).map((speaker, index) => services.normaliseProjectSpeaker(speaker, index));
    while (speakers.length < 2) speakers.push(services.createDefaultPodcastSpeakers()[speakers.length]);
    if (project.script == null) return;
    const issues = getEditableScriptIssues(project.script, speakers);
    if (issues.length) throw new Error(`Saved project is invalid: ${issues[0].message}`);
  }

  const baseMigratePodcastProject = services.migratePodcastProject;
  function migratePodcastProject(project, now) {
    validateCurrentProject(project);
    return baseMigratePodcastProject(project, now);
  }

  const baseLoadPreferences = services.loadPreferences;
  function loadPreferences(now = new Date().toISOString()) {
    const raw = localStorage.getItem(services.STORAGE_KEY) || '';
    if (raw) {
      try {
        validateCurrentProject(JSON.parse(raw));
      } catch (error) {
        services.preserveCorruptProject(raw, error, now);
        localStorage.removeItem(services.STORAGE_KEY);
      }
    }

    const result = baseLoadPreferences(now);
    services.appState.settings.maxTtsCharacters = Math.min(
      30000,
      Math.max(2000, Number(services.appState.settings.maxTtsCharacters) || services.DEFAULT_MAX_TTS_CHARACTERS)
    );
    services.appState.settings.speakingRate = Math.min(
      200,
      Math.max(100, Number(services.appState.settings.speakingRate) || services.DEFAULT_SPEAKING_RATE)
    );
    const duration = Number(services.appState.podcast.durationMinutes);
    services.appState.podcast.durationMinutes = duration >= 1 && duration <= 10
      ? duration
      : services.DEFAULT_DURATION_MINUTES;
    return result;
  }

  services.els.settingsDialog?.addEventListener?.('close', commitSettingsFromDialog);

  Object.assign(services, {
    transientTtsStatuses,
    getEditableScriptIssues,
    isRetryableTtsStatus,
    requestTtsChunk,
    generateTtsPcm,
    getTtsScriptValidationIssue,
    generatePodcastAudio,
    flushTypingHistory,
    undo,
    redo,
    canPerformSegmentAction,
    performSegmentAction,
    reorderSegments,
    renderScriptMetrics,
    resetProject,
    commitSettingsFromDialog,
    renderConnectionStatus,
    validateCurrentProject,
    migratePodcastProject,
    loadPreferences
  });

  return services;
}
