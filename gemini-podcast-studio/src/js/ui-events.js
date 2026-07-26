function closeMenus(except) {
  for (const menu of document.querySelectorAll('details.menu[open]')) if (menu !== except) menu.removeAttribute('open');
}

document.querySelector('.stepper').addEventListener('click', event => {
  const button = event.target.closest('[data-stage]'); if (button && !button.disabled) setStage(button.dataset.stage);
});
els.createForm.addEventListener('submit', event => { event.preventDefault(); generatePodcastScript(); });
els.createForm.addEventListener('input', event => {
  if (event.target.matches('input[name="duration"]')) {
    els.customDurationField.classList.toggle('hidden', event.target.value !== 'custom'); if (event.target.value === 'custom') els.customDuration.focus();
  }
  if (event.target === els.language) els.customLanguage.classList.toggle('hidden', els.language.value !== 'custom');
  if (event.target === els.podcastFormat) els.customFormat.classList.toggle('hidden', els.podcastFormat.value !== 'custom');
  syncCreateInputs();
});
els.speakerList.addEventListener('input', event => {
  const card = event.target.closest('[data-speaker-index]');
  const field = event.target.dataset.speakerField;
  if (!card || !['speakerName', 'personality', 'deliveryInstructions'].includes(field)) return;
  const speaker = appState.speakers[Number(card.dataset.speakerIndex)];
  updateSpeakerField(speaker, field, event.target.value);
  queueSave();
});
els.speakerList.addEventListener('change', event => {
  const card = event.target.closest('[data-speaker-index]');
  const field = event.target.dataset.speakerField;
  if (!card || !['gender', 'voiceType', 'geminiVoiceName'].includes(field)) return;
  const speaker = appState.speakers[Number(card.dataset.speakerIndex)];
  resetDuplicateVoiceApproval();
  updateSpeakerField(speaker, field, event.target.value);
  renderSpeakerCards();
  queueSave();
});
els.speakerList.addEventListener('click', event => {
  const button = event.target.closest('[data-duplicate-voice-action]');
  if (!button) return;
  if (button.dataset.duplicateVoiceAction === 'use-anyway') {
    approveDuplicateVoice();
    renderSpeakerCards();
    generatePodcastScript();
  }
  if (button.dataset.duplicateVoiceAction === 'choose-another') {
    duplicateVoiceWarningVisible = false;
    renderSpeakerCards();
    requestAnimationFrame(() => document.getElementById('speakerVoice1')?.focus());
  }
});
els.swapCharacters.addEventListener('click', () => {
  resetDuplicateVoiceApproval();
  appState.speakers.reverse();
  appState.speakers[0].id = 'host-1';
  appState.speakers[1].id = 'host-2';
  renderSpeakerCards(); queueSave();
});

els.scriptTabs.addEventListener('click', event => { const tab = event.target.closest('[data-script-view]'); if (!tab) return; appState.scriptView = tab.dataset.scriptView; renderScriptTabs(); });
els.scriptTabs.addEventListener('keydown', event => {
  const tabs = [...els.scriptTabs.querySelectorAll('[role="tab"]')]; const current = tabs.indexOf(document.activeElement); if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
  if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1;
  tabs[next].focus(); tabs[next].click();
});
els.scriptPanel.addEventListener('input', event => { if (!event.target.dataset.segmentField) return; if (event.target.tagName === 'TEXTAREA') autoSize(event.target); updateSegmentFromControl(event.target); });
els.scriptPanel.addEventListener('change', event => { if (event.target.dataset.segmentField) updateSegmentFromControl(event.target); });
els.scriptPanel.addEventListener('click', event => { const button = event.target.closest('[data-segment-action]'); const card = event.target.closest('[data-segment-index]'); if (button && card) performSegmentAction(Number(card.dataset.segmentIndex), button.dataset.segmentAction); });
els.scriptPanel.addEventListener('dragstart', event => { const card = event.target.closest('[data-segment-index]'); if (!card) return; dragIndex = Number(card.dataset.segmentIndex); card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
els.scriptPanel.addEventListener('dragover', event => { const card = event.target.closest('[data-segment-index]'); if (!card) return; event.preventDefault(); for (const other of els.scriptPanel.querySelectorAll('.drag-over')) other.classList.remove('drag-over'); card.classList.add('drag-over'); });
els.scriptPanel.addEventListener('drop', event => { const card = event.target.closest('[data-segment-index]'); if (!card) return; event.preventDefault(); reorderSegments(dragIndex, Number(card.dataset.segmentIndex)); });
els.scriptPanel.addEventListener('dragend', () => { dragIndex = null; for (const card of els.scriptPanel.querySelectorAll('.dragging,.drag-over')) card.classList.remove('dragging', 'drag-over'); });

for (const menu of [els.refineMenu, els.scriptMoreMenu]) menu.addEventListener('click', event => {
  const button = event.target.closest('[data-script-action]'); if (!button) return; const action = button.dataset.scriptAction; menu.removeAttribute('open');
  if (['regenerate','shorten','expand','conversational','serious','humour'].includes(action)) refineScript(action);
  if (action === 'reset' && appState.originalScript) { snapshotScript(); appState.script = deepClone(appState.originalScript); snapshotScript({ force: true }); queueSave(); renderScriptStage(); }
  if (action === 'copy') copyText(buildCleanTranscript(), 'Transcript copied.');
  if (action === 'download-json') downloadBlob(new Blob([JSON.stringify(appState.script, null, 2)], { type: 'application/json' }), buildEpisodeFilename('json'));
});
els.undoButton.addEventListener('click', undo); els.redoButton.addEventListener('click', redo);
els.generateAudioButton.addEventListener('click', generatePodcastAudio); els.backToCreateButton.addEventListener('click', () => setStage('create'));
els.audioContent.addEventListener('click', event => {
  const button = event.target.closest('[data-audio-action]'); if (!button) return; const action = button.dataset.audioAction;
  if (action === 'download' && appState.audio.blob) downloadBlob(appState.audio.blob, buildEpisodeFilename('wav'));
  if (action === 'regenerate') generatePodcastAudio(); if (action === 'script') setStage('script');
  if (action === 'copy') copyText(buildCleanTranscript(), 'Transcript copied.'); if (action === 'new') resetProject({ preserveConnection: true, preservePreferences: true });
});

function openSettings() { renderConnectionForms(); els.settingsDialog.showModal(); }
els.settingsButton.addEventListener('click', openSettings); els.connectionChip.addEventListener('click', openSettings);
els.closeSettingsButton.addEventListener('click', () => { appState.settings.maxTtsCharacters = Math.max(2000, Number(els.maxTtsCharacters.value) || DEFAULT_MAX_TTS_CHARACTERS); appState.settings.speakingRate = Math.min(200, Math.max(100, Number(els.speakingRate.value) || 140)); queueSave(); els.settingsDialog.close(); if (appState.currentStage === 'script') renderScriptMetrics(); updateTargetSummary(); });
els.closeSettingsIcon.addEventListener('click', () => els.settingsDialog.close());
els.clearStoredDataButton.addEventListener('click', clearStoredData);
for (const formHost of [els.connectionSetupForm, els.connectionSettingsForm]) {
  formHost.addEventListener('change', event => { const form = event.target.closest('[data-connection-form]'); if (form) syncConnectionForm(form); });
  formHost.addEventListener('click', event => { const button = event.target.closest('[data-toggle-key]'); if (!button) return; const input = button.parentElement.querySelector('input'); const showing = input.type === 'text'; input.type = showing ? 'password' : 'text'; button.textContent = showing ? 'Show' : 'Hide'; button.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key'); });
}
els.themeButton.addEventListener('click', () => { appState.settings.theme = appState.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); queueSave(); if (appState.currentStage === 'audio') drawWaveform(appState.audio.blob); });
els.dismissErrorButton.addEventListener('click', hideServiceError);
document.addEventListener('click', event => { const menu = event.target.closest('details.menu'); closeMenus(menu); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); appState.currentStage === 'create' ? generatePodcastScript() : appState.currentStage === 'script' ? generatePodcastAudio() : null; }
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && appState.currentStage === 'script') { event.preventDefault(); undo(); }
  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) && appState.currentStage === 'script') { event.preventDefault(); redo(); }
});
window.addEventListener('beforeunload', revokeAudioUrl);
