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

function renderSpeakerCards() {
  els.speakerList.innerHTML = appState.characters.map((character, index) => {
    const expanded = appState.expandedSpeakers.has(index);
    const options = getGeminiTtsVoices().map(({ apiName, description }) => `<option value="${apiName}"${character.voice === apiName ? ' selected' : ''}>${apiName} — ${description}</option>`).join('');
    return `<article class="speaker-card${expanded ? ' expanded' : ''}" data-speaker-index="${index}">
      <div class="speaker-card-head">
        <span class="speaker-id">${index === 0 ? 'A' : 'B'}</span>
        <div class="speaker-copy">
          <div class="speaker-name-line"><h3>${escapeHtml(character.name || `Speaker ${index + 1}`)}</h3><span class="voice-label">${escapeHtml(character.voice)}</span></div>
          <p class="speaker-description">${escapeHtml(character.role || 'Podcast participant')} · ${escapeHtml(character.personality || 'Natural and engaging')}</p>
        </div>
        <div class="speaker-actions">
          <button class="ghost-button compact-button" type="button" data-speaker-action="voice-test">Test voice</button>
          <button class="secondary-button compact-button" type="button" data-speaker-action="toggle" aria-expanded="${expanded}">${expanded ? 'Done' : 'Edit'}</button>
          <details class="menu icon-menu">
            <summary class="menu-summary" aria-label="More speaker actions">${ICONS.more}</summary>
            <div class="menu-popover"><button class="menu-item" type="button" data-speaker-action="randomise">Randomise</button><button class="menu-item" type="button" data-speaker-action="reset">Reset</button></div>
          </details>
        </div>
      </div>
      <div class="speaker-editor${expanded ? '' : ' hidden'}">
        <div class="field-grid">
          <div class="field"><label for="speakerName${index}">Name</label><input id="speakerName${index}" data-speaker-field="name" value="${escapeHtml(character.name)}" maxlength="40" /></div>
          <div class="field"><label for="speakerRole${index}">Role</label><input id="speakerRole${index}" data-speaker-field="role" value="${escapeHtml(character.role)}" placeholder="Host, scientist, journalist…" /></div>
          <div class="field"><label for="speakerVoice${index}">Gemini voice</label><select id="speakerVoice${index}" data-speaker-field="voice">${options}</select><p class="voice-description">${escapeHtml(character.voice)} · ${escapeHtml(voiceDescription(character.voice))}</p></div>
          <div class="field"><label for="speakerAccent${index}">Accent or language note</label><input id="speakerAccent${index}" data-speaker-field="accent" value="${escapeHtml(character.accent)}" placeholder="Optional pronunciation note" /></div>
          <div class="field full"><label for="speakerPersonality${index}">Personality</label><textarea id="speakerPersonality${index}" data-speaker-field="personality">${escapeHtml(character.personality)}</textarea></div>
          <div class="field full"><label for="speakerDirection${index}">Performance direction</label><textarea id="speakerDirection${index}" data-speaker-field="direction">${escapeHtml(character.direction)}</textarea></div>
        </div>
      </div>
    </article>`;
  }).join('');
}
function resetCharacter(index) {
  appState.characters[index] = { id: `speaker-${index ? 'b' : 'a'}`, ...(index ? CHARACTER_TEMPLATES[1] : CHARACTER_TEMPLATES[0]), voice: index ? 'Charon' : 'Aoede' };
  renderSpeakerCards(); queueSave();
}
function randomiseCharacter(index) {
  const other = appState.characters[index ? 0 : 1];
  const templates = CHARACTER_TEMPLATES.filter(template => template.name !== other.name);
  const template = templates[Math.floor(Math.random() * templates.length)];
  const voices = getGeminiTtsVoices().filter(({ apiName }) => apiName !== other.voice);
  appState.characters[index] = { id: `speaker-${index ? 'b' : 'a'}`, ...template, voice: voices[Math.floor(Math.random() * voices.length)]?.apiName || '' };
  renderSpeakerCards(); queueSave();
}

function clearValidation() {
  els.createErrorSummary.classList.add('hidden');
  els.createErrorList.innerHTML = '';
  for (const node of els.createForm.querySelectorAll('[aria-invalid="true"]')) node.removeAttribute('aria-invalid');
  for (const node of els.createForm.querySelectorAll('.field-error')) node.remove();
}
function validatePodcastBrief() {
  const errors = [];
  const names = appState.characters.map(character => normaliseWhitespace(character.name));
  if (!appState.connection.apiKey.trim()) errors.push({ id: 'setupApiKey', field: document.getElementById('setupApiKey') || els.connectionChip, message: 'Enter a Gemini API key.' });
  if (!getTextModel()) errors.push({ id: 'setupCustomTextModel', field: document.getElementById('setupCustomTextModel'), message: 'Enter a valid text model ID.' });
  if (!getTtsModel()) errors.push({ id: 'setupCustomTtsModel', field: document.getElementById('setupCustomTtsModel'), message: 'Enter a valid TTS model ID.' });
  if (!appState.podcast.topic.trim()) errors.push({ id: 'topic', field: els.topic, message: 'Enter a podcast topic.' });
  if (!getLanguage()) errors.push({ id: 'customLanguage', field: els.customLanguage, message: 'Enter a language.' });
  if (!getPodcastFormat()) errors.push({ id: 'customFormat', field: els.customFormat, message: 'Enter a podcast format.' });
  if (!(appState.podcast.durationMinutes > 0 && appState.podcast.durationMinutes <= 10)) errors.push({ id: 'customDuration', field: els.customDuration, message: 'Choose a duration between 1 and 10 minutes.' });
  if (names.some(name => !name)) errors.push({ id: 'speakerList', field: els.speakerList, message: 'Both speakers need names.' });
  if (names[0]?.toLocaleLowerCase() === names[1]?.toLocaleLowerCase()) errors.push({ id: 'speakerList', field: els.speakerList, message: 'Speaker names must be different.' });
  if (appState.characters.some(character => !character.voice)) errors.push({ id: 'speakerList', field: els.speakerList, message: 'Select a voice for both speakers.' });
  return errors;
}
function showValidationErrors(errors) {
  clearValidation();
  els.createErrorList.innerHTML = errors.map(error => `<li><a href="#${escapeHtml(error.id)}">${escapeHtml(error.message)}</a></li>`).join('');
  els.createErrorSummary.classList.remove('hidden');
  for (const error of errors) {
    if (error.field?.setAttribute) error.field.setAttribute('aria-invalid', 'true');
    if (error.field?.parentElement && !error.field.parentElement.querySelector('.field-error')) {
      const message = document.createElement('p'); message.className = 'field-error'; message.textContent = error.message; error.field.parentElement.appendChild(message);
    }
  }
  els.createErrorSummary.focus();
}
