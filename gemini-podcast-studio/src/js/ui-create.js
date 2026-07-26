function applyTheme() {
  document.documentElement.dataset.theme = appState.settings.theme;
  const dark = appState.settings.theme === 'dark';
  els.themeButton.innerHTML = dark ? ICONS.sun : ICONS.moon;
  els.themeButton.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  els.settingsButton.innerHTML = ICONS.settings;
  els.closeSettingsIcon.innerHTML = ICONS.close;
}
function populateInputsFromState() {
  els.topic.value = appState.podcast.topic;
  const preset = [2, 3, 5, 7].includes(Number(appState.podcast.durationMinutes));
  const durationInput = document.querySelector(`input[name="duration"][value="${preset ? appState.podcast.durationMinutes : 'custom'}"]`);
  if (durationInput) durationInput.checked = true;
  els.customDuration.value = appState.podcast.durationMinutes;
  els.customDurationField.classList.toggle('hidden', preset);
  els.language.value = appState.podcast.language;
  els.customLanguage.value = appState.podcast.customLanguage;
  els.customLanguage.classList.toggle('hidden', appState.podcast.language !== 'custom');
  els.podcastFormat.value = appState.podcast.format;
  els.customFormat.value = appState.podcast.customFormat;
  els.customFormat.classList.toggle('hidden', appState.podcast.format !== 'custom');
  els.instructions.value = appState.podcast.instructions;
  for (const input of els.toneChoices.querySelectorAll('input[type="checkbox"]')) input.checked = appState.podcast.tones.includes(input.value);
  els.maxTtsCharacters.value = appState.settings.maxTtsCharacters;
  els.speakingRate.value = appState.settings.speakingRate;
  updateTargetSummary();
}
function syncCreateInputs() {
  appState.podcast.topic = els.topic.value.trim();
  const selectedDuration = document.querySelector('input[name="duration"]:checked')?.value || '5';
  appState.podcast.durationMinutes = selectedDuration === 'custom' ? Math.min(10, Math.max(1, Number(els.customDuration.value) || 1)) : Number(selectedDuration);
  appState.podcast.language = els.language.value;
  appState.podcast.customLanguage = els.customLanguage.value.trim();
  appState.podcast.format = els.podcastFormat.value;
  appState.podcast.customFormat = els.customFormat.value.trim();
  appState.podcast.tones = [...els.toneChoices.querySelectorAll('input:checked')].map(input => input.value);
  appState.podcast.instructions = els.instructions.value.trim();
  queueSave();
  updateTargetSummary();
}
function updateTargetSummary() {
  const target = getTargetWords();
  const duration = formatDuration((target / appState.settings.speakingRate) * 60);
  els.targetWords.textContent = `approximately ${target.toLocaleString('en-GB')} spoken words`;
  els.estimatedDuration.textContent = duration;
  els.createActionHint.textContent = `Approx. ${target.toLocaleString('en-GB')} words · ${duration}`;
}

function formatVoiceTypeLabel(type) {
  const normalised = normaliseWhitespace(type);
  return normalised ? `${normalised.charAt(0).toUpperCase()}${normalised.slice(1)}` : '';
}
function getMatchingVoices({ gender = '', voiceType = '' } = {}) {
  return getGeminiTtsVoices({ gender, type: voiceType });
}
function getSpeakerVoiceTypes(speaker) {
  return speaker?.gender ? getAvailableVoiceTypes(speaker.gender) : [];
}
function getSpeakerVoiceChoices(speaker) {
  if (!speaker?.gender || !speaker?.voiceType) return [];
  return getMatchingVoices({ gender: speaker.gender, voiceType: speaker.voiceType });
}

let duplicateVoiceApprovalSignature = '';
let duplicateVoiceWarningVisible = false;

function getDuplicateVoiceSignature(speakers = appState.speakers) {
  if (!Array.isArray(speakers) || speakers.length < 2) return '';
  const firstVoice = normaliseWhitespace(speakers[0]?.geminiVoiceName);
  const secondVoice = normaliseWhitespace(speakers[1]?.geminiVoiceName);
  return firstVoice && firstVoice === secondVoice && getGeminiTtsVoice(firstVoice) ? firstVoice : '';
}
function approveDuplicateVoice(speakers = appState.speakers) {
  duplicateVoiceApprovalSignature = getDuplicateVoiceSignature(speakers);
  duplicateVoiceWarningVisible = false;
  return Boolean(duplicateVoiceApprovalSignature);
}
function isDuplicateVoiceApproved(speakers = appState.speakers) {
  const signature = getDuplicateVoiceSignature(speakers);
  return Boolean(signature && signature === duplicateVoiceApprovalSignature);
}
function resetDuplicateVoiceApproval() {
  duplicateVoiceApprovalSignature = '';
  duplicateVoiceWarningVisible = false;
}
function showDuplicateVoiceWarning() {
  duplicateVoiceWarningVisible = true;
  renderSpeakerCards();
  requestAnimationFrame(() => document.getElementById('duplicateVoiceWarning')?.focus());
}

function updateSpeakerField(speaker, field, value) {
  if (!speaker || typeof speaker !== 'object') return speaker;
  const nextValue = String(value ?? '');

  if (field === 'speakerName') speaker.speakerName = nextValue.slice(0, 40);
  if (field === 'personality') speaker.personality = nextValue;
  if (field === 'deliveryInstructions') speaker.deliveryInstructions = nextValue;

  if (field === 'gender') {
    speaker.gender = GEMINI_TTS_VOICE_GENDERS.includes(nextValue) ? nextValue : '';
    const availableTypes = getSpeakerVoiceTypes(speaker);
    if (!availableTypes.includes(speaker.voiceType)) speaker.voiceType = '';
    const selectedVoice = getGeminiTtsVoice(speaker.geminiVoiceName);
    if (!selectedVoice || selectedVoice.gender !== speaker.gender || (speaker.voiceType && selectedVoice.type !== speaker.voiceType)) {
      speaker.geminiVoiceName = '';
      delete speaker.voiceUnavailable;
    }
  }

  if (field === 'voiceType') {
    const availableTypes = getSpeakerVoiceTypes(speaker);
    speaker.voiceType = availableTypes.includes(nextValue) ? nextValue : '';
    const selectedVoice = getGeminiTtsVoice(speaker.geminiVoiceName);
    if (!selectedVoice || selectedVoice.gender !== speaker.gender || selectedVoice.type !== speaker.voiceType) {
      speaker.geminiVoiceName = '';
      delete speaker.voiceUnavailable;
    }
  }

  if (field === 'geminiVoiceName') {
    const selectedVoice = getGeminiTtsVoice(nextValue);
    const matchesFilters = selectedVoice && selectedVoice.gender === speaker.gender && selectedVoice.type === speaker.voiceType;
    if (!nextValue) {
      speaker.geminiVoiceName = '';
      delete speaker.voiceUnavailable;
    } else if (!selectedVoice) {
      speaker.geminiVoiceName = nextValue;
      speaker.voiceUnavailable = true;
    } else if (matchesFilters) {
      speaker.geminiVoiceName = nextValue;
      delete speaker.voiceUnavailable;
    } else {
      speaker.geminiVoiceName = '';
      delete speaker.voiceUnavailable;
    }
  }

  return speaker;
}

function validateSpeakerRecords(speakers) {
  const issues = [];
  const source = Array.isArray(speakers) ? speakers : [];

  for (let index = 0; index < 2; index += 1) {
    const speaker = source[index] || {};
    const trimmedName = String(speaker.speakerName ?? '').trim();
    if (source[index]) source[index].speakerName = trimmedName;

    if (!trimmedName) issues.push({ index, field: 'speakerName', message: `Host ${index + 1} needs a speaker name.` });
    if (!GEMINI_TTS_VOICE_GENDERS.includes(speaker.gender)) issues.push({ index, field: 'gender', message: `Select a gender for Host ${index + 1}.` });

    const availableTypes = speaker.gender ? getAvailableVoiceTypes(speaker.gender) : [];
    if (!speaker.voiceType) {
      issues.push({ index, field: 'voiceType', message: `Select a voice type for Host ${index + 1}.` });
    } else if (!availableTypes.includes(speaker.voiceType)) {
      issues.push({ index, field: 'voiceType', message: `The selected voice type is not available for Host ${index + 1}'s gender.` });
    }

    if (!speaker.geminiVoiceName) {
      issues.push({ index, field: 'geminiVoiceName', message: `Select a Gemini voice for Host ${index + 1}.` });
      continue;
    }

    const selectedVoice = getGeminiTtsVoice(speaker.geminiVoiceName);
    if (!selectedVoice) {
      issues.push({ index, field: 'geminiVoiceName', message: `${speaker.geminiVoiceName} is not available in the Gemini voice catalogue.` });
      continue;
    }
    if (speaker.gender && selectedVoice.gender !== speaker.gender) {
      issues.push({ index, field: 'geminiVoiceName', message: `${selectedVoice.apiName} does not match the selected gender.` });
    }
    if (speaker.voiceType && selectedVoice.type !== speaker.voiceType) {
      issues.push({ index, field: 'geminiVoiceName', message: `${selectedVoice.apiName} does not match the selected voice type.` });
    }
  }

  const firstName = String(source[0]?.speakerName ?? '').trim();
  const secondName = String(source[1]?.speakerName ?? '').trim();
  if (firstName && secondName && firstName.toLocaleLowerCase() === secondName.toLocaleLowerCase()) {
    issues.push({ index: 0, field: 'speakerName', message: 'Speaker names must be different.' });
    issues.push({ index: 1, field: 'speakerName', message: 'Speaker names must be different.' });
  }

  return issues;
}

function renderSpeakerCards() {
  const cards = appState.speakers.map((speaker, index) => {
    const positionLabel = `Host ${index + 1}`;
    const selectedVoiceName = speaker.geminiVoiceName || '';
    const selectedVoice = getGeminiTtsVoice(selectedVoiceName);
    const availableTypes = getSpeakerVoiceTypes(speaker);
    const availableVoices = getSpeakerVoiceChoices(speaker);
    const voiceTypeDisabled = !speaker.gender;
    const filtersReady = Boolean(speaker.gender && speaker.voiceType);
    const noMatchingVoices = filtersReady && availableVoices.length === 0;
    const voiceDisabled = !filtersReady || noMatchingVoices;
    const selectedVoiceAvailable = selectedVoice && selectedVoice.gender === speaker.gender && selectedVoice.type === speaker.voiceType;
    const previewDisabled = !selectedVoiceAvailable;
    const voiceTypePlaceholder = voiceTypeDisabled ? 'Select gender first' : 'Select a voice type';
    const voicePlaceholder = noMatchingVoices
      ? 'No matching voices are available'
      : !speaker.gender
        ? 'Select gender first'
        : !speaker.voiceType
          ? 'Select voice type first'
          : 'Select a Gemini voice';
    const unavailableOption = selectedVoiceName && !selectedVoiceAvailable
      ? `<option value="${escapeHtml(selectedVoiceName)}" selected>${escapeHtml(selectedVoiceName)} · Unavailable voice</option>`
      : '';
    const voiceTypeOptions = availableTypes.map(type => `<option value="${escapeHtml(type)}"${speaker.voiceType === type ? ' selected' : ''}>${escapeHtml(formatVoiceTypeLabel(type))}</option>`).join('');
    const voiceOptions = unavailableOption + availableVoices.map(({ apiName, description }) => `<option value="${apiName}"${selectedVoiceName === apiName ? ' selected' : ''}>${apiName} · ${description}</option>`).join('');
    const voiceTypeHelp = voiceTypeDisabled
      ? 'Select a gender to choose a voice type.'
      : speaker.voiceType
        ? `Selected type: ${formatVoiceTypeLabel(speaker.voiceType)}.`
        : 'Select a voice type.';
    const voiceHelp = noMatchingVoices
      ? 'No matching voices are available. Choose another gender or voice type.'
      : selectedVoiceAvailable
        ? `${selectedVoice.apiName} · ${selectedVoice.description}`
        : selectedVoiceName
          ? `${selectedVoiceName} is unavailable. Select a gender and voice type to choose another voice.`
          : voiceDisabled
            ? 'Select gender and voice type first.'
            : 'Select a Gemini voice.';

    return `<article class="speaker-card speaker-config-card expanded" data-speaker-index="${index}" aria-labelledby="speakerCardTitle${index}">
      <div class="speaker-card-head">
        <span class="speaker-id" aria-hidden="true">${index === 0 ? 'A' : 'B'}</span>
        <div class="speaker-copy">
          <h3 id="speakerCardTitle${index}">${positionLabel}</h3>
          <p class="speaker-description">Configure the podcast character and Gemini TTS voice independently.</p>
        </div>
      </div>
      <div class="speaker-editor">
        <div class="field-grid">
          <div class="field full">
            <label for="speakerName${index}">Speaker name</label>
            <input id="speakerName${index}" type="text" data-speaker-field="speakerName" value="${escapeHtml(speaker.speakerName)}" maxlength="40" placeholder="For example, James" />
          </div>
          <fieldset id="speakerGenderGroup${index}" class="field full speaker-gender-field">
            <legend>Gender</legend>
            <div class="choice-group speaker-gender-options">
              <input class="choice-input" id="speakerGenderMale${index}" type="radio" name="speakerGender${index}" value="male" data-speaker-field="gender"${speaker.gender === 'male' ? ' checked' : ''} />
              <label class="chip-label" for="speakerGenderMale${index}">Male</label>
              <input class="choice-input" id="speakerGenderFemale${index}" type="radio" name="speakerGender${index}" value="female" data-speaker-field="gender"${speaker.gender === 'female' ? ' checked' : ''} />
              <label class="chip-label" for="speakerGenderFemale${index}">Female</label>
            </div>
          </fieldset>
          <div class="field">
            <label for="speakerVoiceType${index}">Voice type</label>
            <select id="speakerVoiceType${index}" data-speaker-field="voiceType" aria-describedby="speakerVoiceTypeHelp${index}"${voiceTypeDisabled ? ' disabled' : ''}>
              <option value="">${voiceTypePlaceholder}</option>${voiceTypeOptions}
            </select>
            <p id="speakerVoiceTypeHelp${index}" class="voice-description">${escapeHtml(voiceTypeHelp)}</p>
          </div>
          <div class="field">
            <label for="speakerVoice${index}">Gemini voice</label>
            <select id="speakerVoice${index}" data-speaker-field="geminiVoiceName" aria-describedby="speakerVoiceHelp${index}"${voiceDisabled ? ' disabled' : ''}>
              <option value="">${voicePlaceholder}</option>${voiceOptions}
            </select>
            <p id="speakerVoiceHelp${index}" class="voice-description">${escapeHtml(voiceHelp)}</p>
          </div>
          <div class="field full speaker-preview-row">
            <button id="speakerPreview${index}" class="secondary-button" type="button"${previewDisabled ? ' disabled' : ''}>Preview voice</button>
            <p class="field-help">Audio preview will be added in a later step.</p>
          </div>
          <div class="field full">
            <label for="speakerPersonality${index}">Personality</label>
            <textarea id="speakerPersonality${index}" data-speaker-field="personality" placeholder="Calm, curious and analytical">${escapeHtml(speaker.personality)}</textarea>
          </div>
          <div class="field full">
            <label for="speakerDelivery${index}">Delivery instructions</label>
            <textarea id="speakerDelivery${index}" data-speaker-field="deliveryInstructions" placeholder="Natural pace, conversational">${escapeHtml(speaker.deliveryInstructions)}</textarea>
          </div>
        </div>
      </div>
    </article>`;
  }).join('');

  const duplicateVoice = getDuplicateVoiceSignature();
  if (!duplicateVoice) duplicateVoiceWarningVisible = false;
  const warning = duplicateVoiceWarningVisible && duplicateVoice
    ? `<section id="duplicateVoiceWarning" class="section-card subtle duplicate-voice-warning" role="alert" tabindex="-1" aria-labelledby="duplicateVoiceWarningTitle">
        <h3 id="duplicateVoiceWarningTitle">Both speakers currently use ${escapeHtml(duplicateVoice)}.</h3>
        <p>The conversation may be difficult to follow.</p>
        <div class="button-row mt-14">
          <button class="primary-button" type="button" data-duplicate-voice-action="use-anyway">Use anyway</button>
          <button class="secondary-button" type="button" data-duplicate-voice-action="choose-another">Choose another voice</button>
        </div>
      </section>`
    : '';

  els.speakerList.innerHTML = cards + warning;
}
function resetSpeaker(index) {
  appState.speakers[index] = { ...createDefaultPodcastSpeakers()[index] };
  resetDuplicateVoiceApproval();
  renderSpeakerCards(); queueSave();
}

function clearValidation() {
  els.createErrorSummary.classList.add('hidden');
  els.createErrorList.innerHTML = '';
  for (const node of els.createForm.querySelectorAll('[aria-invalid="true"]')) node.removeAttribute('aria-invalid');
  for (const node of els.createForm.querySelectorAll('[data-validation-error-id]')) {
    const errorId = node.dataset.validationErrorId;
    const describedBy = (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== errorId);
    if (describedBy.length) node.setAttribute('aria-describedby', describedBy.join(' '));
    else node.removeAttribute('aria-describedby');
    delete node.dataset.validationErrorId;
  }
  for (const node of els.createForm.querySelectorAll('.field-error')) node.remove();
}
function getSpeakerValidationTarget(index, field) {
  if (field === 'speakerName') {
    const node = document.getElementById(`speakerName${index}`);
    return { id: node?.id || `speakerCardTitle${index}`, field: node, container: node?.parentElement };
  }
  if (field === 'gender') {
    const group = document.getElementById(`speakerGenderGroup${index}`);
    return { id: `speakerGenderMale${index}`, field: group, container: group };
  }
  if (field === 'voiceType') {
    const node = document.getElementById(`speakerVoiceType${index}`);
    return { id: node?.id || `speakerCardTitle${index}`, field: node, container: node?.parentElement };
  }
  const node = document.getElementById(`speakerVoice${index}`);
  return { id: node?.id || `speakerCardTitle${index}`, field: node, container: node?.parentElement };
}
function validatePodcastBrief() {
  const errors = [];
  if (!appState.connection.apiKey.trim()) errors.push({ id: 'setupApiKey', field: document.getElementById('setupApiKey') || els.connectionChip, message: 'Enter a Gemini API key.' });
  if (!getTextModel()) errors.push({ id: 'setupCustomTextModel', field: document.getElementById('setupCustomTextModel'), message: 'Enter a valid text model ID.' });
  if (!getTtsModel()) errors.push({ id: 'setupCustomTtsModel', field: document.getElementById('setupCustomTtsModel'), message: 'Enter a valid TTS model ID.' });
  if (!appState.podcast.topic.trim()) errors.push({ id: 'topic', field: els.topic, message: 'Enter a podcast topic.' });
  if (!getLanguage()) errors.push({ id: 'customLanguage', field: els.customLanguage, message: 'Enter a language.' });
  if (!getPodcastFormat()) errors.push({ id: 'customFormat', field: els.customFormat, message: 'Enter a podcast format.' });
  if (!(appState.podcast.durationMinutes > 0 && appState.podcast.durationMinutes <= 10)) errors.push({ id: 'customDuration', field: els.customDuration, message: 'Choose a duration between 1 and 10 minutes.' });

  for (const issue of validateSpeakerRecords(appState.speakers)) {
    const target = getSpeakerValidationTarget(issue.index, issue.field);
    errors.push({ ...target, message: issue.message });
  }
  appState.speakers.forEach((speaker, index) => {
    const input = document.getElementById(`speakerName${index}`);
    if (input) input.value = speaker.speakerName;
  });

  return errors;
}
function showValidationErrors(errors) {
  clearValidation();
  els.createErrorList.innerHTML = errors.map(error => `<li><a href="#${escapeHtml(error.id)}">${escapeHtml(error.message)}</a></li>`).join('');
  els.createErrorSummary.classList.remove('hidden');
  errors.forEach((error, index) => {
    if (error.field?.setAttribute) error.field.setAttribute('aria-invalid', 'true');
    const container = error.container || error.field?.parentElement;
    if (!container) return;
    const errorId = `validationError${index}`;
    const message = document.createElement('p');
    message.id = errorId;
    message.className = 'field-error';
    message.textContent = error.message;
    container.appendChild(message);
    if (error.field?.setAttribute) {
      const describedBy = new Set((error.field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(errorId);
      error.field.setAttribute('aria-describedby', [...describedBy].join(' '));
      error.field.dataset.validationErrorId = errorId;
    }
  });
  els.createErrorSummary.focus();
}
