'use strict';

const FINAL_REVIEW_AUDIO_REGENERATION_MESSAGE = 'Podcast audio is out of date and must be regenerated.';

const finalReviewBaseClearValidation = clearValidation;
clearValidation = function clearValidationWithErrorMessageCleanup() {
  finalReviewBaseClearValidation();
  for (const node of els.createForm.querySelectorAll('[aria-errormessage]')) node.removeAttribute('aria-errormessage');
};

validateSpeakerRecords = function validateSpeakerRecordsWithFinalMessages(speakers) {
  const issues = [];
  const source = Array.isArray(speakers) ? speakers : [];

  for (let index = 0; index < 2; index += 1) {
    const host = `Host ${index + 1}`;
    const speaker = source[index] || {};
    const trimmedName = String(speaker.speakerName ?? '').trim();
    if (source[index]) source[index].speakerName = trimmedName;

    if (!trimmedName) issues.push({ index, field: 'speakerName', message: `Enter a name for ${host}.` });
    if (!GEMINI_TTS_VOICE_GENDERS.includes(speaker.gender)) issues.push({ index, field: 'gender', message: `Choose a gender for ${host}.` });

    const availableTypes = speaker.gender ? getAvailableVoiceTypes(speaker.gender) : [];
    if (!speaker.voiceType) {
      issues.push({ index, field: 'voiceType', message: `Choose a voice type for ${host}.` });
    } else if (!availableTypes.includes(speaker.voiceType)) {
      issues.push({ index, field: 'voiceType', message: 'No matching voices are available. Choose another gender or voice type.' });
    }

    if (!speaker.geminiVoiceName) {
      issues.push({ index, field: 'geminiVoiceName', message: `Choose a Gemini voice for ${host}.` });
      continue;
    }

    const selectedVoice = getGeminiTtsVoice(speaker.geminiVoiceName);
    if (!selectedVoice) {
      issues.push({ index, field: 'geminiVoiceName', message: 'The selected Gemini voice is unavailable. Choose another voice.' });
      continue;
    }
    if (selectedVoice.gender !== speaker.gender || selectedVoice.type !== speaker.voiceType) {
      issues.push({ index, field: 'geminiVoiceName', message: 'The selected voice does not match the chosen gender or voice type. Choose another voice.' });
    }
  }

  const firstName = String(source[0]?.speakerName ?? '').trim();
  const secondName = String(source[1]?.speakerName ?? '').trim();
  if (firstName && secondName && firstName.toLocaleLowerCase() === secondName.toLocaleLowerCase()) {
    issues.push({ index: 0, field: 'speakerName', message: 'Each speaker must have a different name.' });
    issues.push({ index: 1, field: 'speakerName', message: 'Each speaker must have a different name.' });
  }

  return issues;
};

function finalReviewFocusableTarget(error) {
  const field = error?.field;
  if (field?.matches?.('fieldset')) return field.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)');
  if (field?.focus && !field.disabled) return field;
  const linked = error?.id ? document.getElementById(error.id) : null;
  if (linked?.focus && !linked.disabled) return linked;
  return null;
}

showValidationErrors = function showValidationErrorsWithFieldFocus(errors) {
  clearValidation();
  const source = Array.isArray(errors) ? errors : [];
  els.createErrorList.innerHTML = source.map((error, index) => {
    const targetId = error.id || `validationTarget${index}`;
    return `<li><a href="#${escapeHtml(targetId)}">${escapeHtml(error.message)}</a></li>`;
  }).join('');
  els.createErrorSummary.classList.remove('hidden');

  source.forEach((error, index) => {
    const field = error.field;
    if (field?.setAttribute) field.setAttribute('aria-invalid', 'true');
    const container = error.container || field?.parentElement;
    if (!container) return;
    const errorId = `validationError${index}`;
    const message = document.createElement('p');
    message.id = errorId;
    message.className = 'field-error';
    message.setAttribute('role', 'alert');
    message.textContent = error.message;
    container.appendChild(message);
    if (field?.setAttribute) {
      const describedBy = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(errorId);
      field.setAttribute('aria-describedby', [...describedBy].join(' '));
      field.setAttribute('aria-errormessage', errorId);
      field.dataset.validationErrorId = errorId;
    }
  });

  els.createErrorSummary.focus({ preventScroll: true });
  const firstTarget = source.map(finalReviewFocusableTarget).find(Boolean);
  requestAnimationFrame(() => firstTarget?.focus({ preventScroll: false }));
};

function enhanceFinalSpeakerAccessibility() {
  appState.speakers.forEach((speaker, index) => {
    const host = `Host ${index + 1}`;
    const card = els.speakerList.querySelector(`[data-speaker-index="${index}"]`);
    card?.setAttribute('aria-label', `${host} speaker configuration`);

    const name = document.getElementById(`speakerName${index}`);
    if (name) {
      name.required = true;
      name.setAttribute('aria-required', 'true');
      name.setAttribute('autocomplete', 'off');
    }

    const genderGroup = document.getElementById(`speakerGenderGroup${index}`);
    if (genderGroup) {
      genderGroup.setAttribute('aria-required', 'true');
      genderGroup.setAttribute('aria-label', `Gender for ${host}`);
      for (const radio of genderGroup.querySelectorAll('input[type="radio"]')) radio.required = true;
    }

    for (const id of [`speakerVoiceType${index}`, `speakerVoice${index}`]) {
      const select = document.getElementById(id);
      if (!select) continue;
      select.required = true;
      select.setAttribute('aria-required', 'true');
      select.setAttribute('aria-disabled', String(select.disabled));
    }

    const preview = document.getElementById(`speakerPreview${index}`);
    if (preview) preview.setAttribute('aria-disabled', String(preview.disabled));
  });

  for (const [id, descriptionId] of [
    ['duplicateVoiceWarning', 'duplicateVoiceWarningDescription'],
    ['conversationPreviewDuplicateWarning', 'conversationPreviewDuplicateWarningDescription']
  ]) {
    const warning = document.getElementById(id);
    if (!warning) continue;
    warning.setAttribute('role', 'alertdialog');
    warning.setAttribute('aria-modal', 'false');
    const description = warning.querySelector('p');
    if (description) {
      description.id = descriptionId;
      warning.setAttribute('aria-describedby', descriptionId);
    }
  }

  const conversationPlayer = document.getElementById('conversationPreviewPlayer');
  if (conversationPlayer) conversationPlayer.setAttribute('aria-keyshortcuts', 'Space');
}

const finalReviewBaseRenderSpeakerCards = renderSpeakerCards;
renderSpeakerCards = function renderSpeakerCardsWithFinalAccessibility() {
  finalReviewBaseRenderSpeakerCards();
  enhanceFinalSpeakerAccessibility();
};
enhanceFinalSpeakerAccessibility();

els.speakerList.addEventListener('change', event => {
  if (!event.target?.matches?.('[data-speaker-field]')) return;
  const controlId = event.target.id;
  requestAnimationFrame(() => document.getElementById(controlId)?.focus({ preventScroll: true }));
});

const finalReviewBaseMapError = mapError;
mapError = function mapErrorWithFinalCoverage(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || 'Unknown error.');
  const lower = message.toLocaleLowerCase();
  if (error?.name === 'AbortError') return { message: 'The request was cancelled before it completed.', suggestion: 'Start the preview again when ready.' };
  if (status === 400 && /model|unsupported|not found|invalid argument/.test(lower)) return { message, suggestion: 'The selected Gemini model may be unsupported or unavailable. Choose another model.' };
  if (status === 400) return { message, suggestion: 'Check the speaker settings and generation request.' };
  if (status === 401 || status === 403) return { message: 'The Gemini API key was rejected or does not have access.', suggestion: 'Check the API key and confirm Gemini API access is enabled.' };
  if (status === 429 && /quota|exhaust/.test(lower)) return { message: 'The Gemini API quota has been exhausted.', suggestion: 'Wait for the quota to reset or use another authorised key.' };
  if (status === 429) return { message: 'The Gemini API rate limit was reached.', suggestion: 'Wait before trying again. Automatic retries are disabled to protect quota.' };
  if (status >= 500) return { message, suggestion: 'The Gemini service may be temporarily unavailable. Try again later.' };
  if (error instanceof SyntaxError || /non-json|invalid .*response|could not be parsed/.test(lower)) return { message: 'Gemini returned an invalid response.', suggestion: 'Try again once. If it continues, change the selected model.' };
  if (error instanceof TypeError && /fetch|network|failed to fetch/.test(lower)) return { message: 'The network connection was interrupted.', suggestion: 'Check the connection and try again manually.' };
  return finalReviewBaseMapError(error);
};

getTtsSpeakerValidationIssue = function getTtsSpeakerValidationIssueWithFinalMessage(script = appState.script, speakers = appState.speakers) {
  const issue = validateScriptSpeakers(script, speakers)[0];
  if (!issue) return null;
  return {
    title: 'Script speaker mismatch',
    message: 'The script contains a speaker who is not configured.',
    suggestion: 'Update the script or speaker settings before generating audio.'
  };
};

const finalReviewBaseInvalidatePodcastAudio = invalidatePodcastAudio;
invalidatePodcastAudio = function invalidatePodcastAudioWithRegenerationNotice(reason = '') {
  const hadAudio = Boolean(appState.audio?.url || appState.audio?.blob || Object.keys(appState.audioCacheReferences || {}).length);
  const result = finalReviewBaseInvalidatePodcastAudio(reason);
  if (reason === 'audio-regeneration') {
    appState.audioRegenerationRequired = false;
    appState.audioInvalidationNotice = '';
  } else if (hadAudio && reason) {
    appState.audioRegenerationRequired = true;
    appState.audioInvalidationNotice = FINAL_REVIEW_AUDIO_REGENERATION_MESSAGE;
    announce(FINAL_REVIEW_AUDIO_REGENERATION_MESSAGE);
  }
  if (appState.currentStage === 'script' && appState.script) renderScriptMetrics();
  return result;
};

const finalReviewBaseRenderScriptMetrics = renderScriptMetrics;
renderScriptMetrics = function renderScriptMetricsWithAudioInvalidationNotice() {
  finalReviewBaseRenderScriptMetrics();
  if (!appState.audioRegenerationRequired || !els.scriptValidation) return;
  els.scriptValidation.className = 'validation-status warning';
  els.scriptValidation.textContent = appState.audioInvalidationNotice || FINAL_REVIEW_AUDIO_REGENERATION_MESSAGE;
};

const finalReviewStyle = document.createElement('style');
finalReviewStyle.dataset.finalReviewStyles = 'true';
finalReviewStyle.textContent = `
  [aria-invalid="true"] {
    border-color: var(--danger);
    box-shadow: 0 0 0 1px var(--danger);
  }
  fieldset[aria-invalid="true"] {
    padding: 10px;
    border: 1px solid var(--danger);
    border-radius: var(--radius-md);
  }
  .field-error::before { content: "Error: "; }
  .duplicate-voice-warning {
    min-width: 0;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--warning) 55%, var(--outline));
    border-radius: var(--radius-md);
    background: var(--surface);
    overflow-wrap: anywhere;
  }
  .speaker-preview-row,
  #conversationPreviewSection {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  #conversationPreviewSection audio:not([hidden]) { display: block; }
  @media (max-width: 700px) {
    #conversationPreviewSection .button-row > *,
    #conversationPreviewButton,
    .speaker-preview-row > button { width: 100%; }
  }
`;
document.head.appendChild(finalReviewStyle);

if (appState.projectLoadWarning) {
  queueMicrotask(() => {
    announce(appState.projectLoadWarning);
    showServiceError({
      title: 'Saved project could not be loaded',
      message: appState.projectLoadWarning,
      suggestion: 'The unreadable data was preserved in a local backup. Review the project settings before saving again.',
      details: appState.projectLoadWarningDetails || 'No additional technical details.',
      retry: null
    });
  });
}

els.clearStoredDataButton.addEventListener('click', () => {
  try {
    if (typeof CORRUPT_PROJECT_BACKUP_KEY !== 'undefined') localStorage.removeItem(CORRUPT_PROJECT_BACKUP_KEY);
  } catch {}
});
