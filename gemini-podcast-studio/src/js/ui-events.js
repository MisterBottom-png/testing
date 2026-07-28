export function installUiEvents(services) {
  function closeMenus(except) {
    for (const menu of document.querySelectorAll('details.menu[open]')) if (menu !== except) menu.removeAttribute('open');
  }
  document.querySelector('.stepper').addEventListener('click', event => {
    const button = event.target.closest('[data-stage]');
    if (button && !button.disabled) services.setStage(button.dataset.stage);
  });
  services.els.createForm.addEventListener('submit', event => {
    event.preventDefault();
    services.generatePodcastScript();
  });
  services.els.createForm.addEventListener('input', event => {
    if (event.target.matches('input[name="duration"]')) {
      services.els.customDurationField.classList.toggle('hidden', event.target.value !== 'custom');
      if (event.target.value === 'custom') services.els.customDuration.focus();
    }
    if (event.target === services.els.language) services.els.customLanguage.classList.toggle('hidden', services.els.language.value !== 'custom');
    if (event.target === services.els.podcastFormat) services.els.customFormat.classList.toggle('hidden', services.els.podcastFormat.value !== 'custom');
    services.syncCreateInputs();
  });
  services.els.speakerList.addEventListener('input', event => {
    const card = event.target.closest('[data-speaker-index]');
    const field = event.target.dataset.speakerField;
    if (!card || !['speakerName', 'personality', 'deliveryInstructions'].includes(field)) return;
    const index = Number(card.dataset.speakerIndex);
    const speaker = services.appState.speakers[index];
    const previousSpeakerName = speaker.speakerName;
    const previousVoiceName = speaker.geminiVoiceName;
    services.updateSpeakerField(speaker, field, event.target.value);
    if (field === 'speakerName' && previousSpeakerName !== speaker.speakerName) {
      services.renameScriptSpeaker(previousSpeakerName, speaker.speakerName);
      services.invalidateAudioForSpeakerMappingChange({
        speakerId: speaker.id,
        previousSpeakerName,
        nextSpeakerName: speaker.speakerName,
        previousVoiceName,
        nextVoiceName: speaker.geminiVoiceName
      });
      if (services.appState.currentStage === 'script') services.renderScriptStage();
    }
    if (field === 'personality' || field === 'deliveryInstructions') services.invalidatePodcastAudio(`speaker-${field}-changed`);
    services.queueSave();
  });
  services.els.speakerList.addEventListener('change', event => {
    const card = event.target.closest('[data-speaker-index]');
    const field = event.target.dataset.speakerField;
    if (!card || !['gender', 'voiceType', 'geminiVoiceName'].includes(field)) return;
    const speaker = services.appState.speakers[Number(card.dataset.speakerIndex)];
    const previousSpeakerName = speaker.speakerName;
    const previousVoiceName = speaker.geminiVoiceName;
    services.resetDuplicateVoiceApproval();
    services.updateSpeakerField(speaker, field, event.target.value);
    services.invalidateAudioForSpeakerMappingChange({
      speakerId: speaker.id,
      previousSpeakerName,
      nextSpeakerName: speaker.speakerName,
      previousVoiceName,
      nextVoiceName: speaker.geminiVoiceName
    });
    services.renderSpeakerCards();
    services.queueSave();
  });
  services.els.speakerList.addEventListener('click', event => {
    const button = event.target.closest('[data-duplicate-voice-action]');
    if (!button) return;
    if (button.dataset.duplicateVoiceAction === 'use-anyway') {
      services.approveDuplicateVoice();
      services.renderSpeakerCards();
      services.generatePodcastScript();
    }
    if (button.dataset.duplicateVoiceAction === 'choose-another') {
      services.duplicateVoiceWarningVisible = false;
      services.renderSpeakerCards();
      requestAnimationFrame(() => document.getElementById('speakerVoice1')?.focus());
    }
  });
  services.els.swapCharacters.addEventListener('click', () => {
    services.resetDuplicateVoiceApproval();
    services.appState.speakers.reverse();
    services.appState.speakers[0].id = 'host-1';
    services.appState.speakers[1].id = 'host-2';
    services.invalidatePodcastAudio('speaker-order-changed');
    services.renderSpeakerCards();
    services.queueSave();
  });
  services.els.scriptTabs.addEventListener('click', event => {
    const tab = event.target.closest('[data-script-view]');
    if (!tab) return;
    services.appState.scriptView = tab.dataset.scriptView;
    services.renderScriptTabs();
  });
  services.els.scriptTabs.addEventListener('keydown', event => {
    const tabs = [...services.els.scriptTabs.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(document.activeElement);
    if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = current;
    if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    tabs[next].focus();
    tabs[next].click();
  });
  services.els.scriptPanel.addEventListener('input', event => {
    if (!event.target.dataset.segmentField) return;
    if (event.target.tagName === 'TEXTAREA') services.autoSize(event.target);
    services.updateSegmentFromControl(event.target);
  });
  services.els.scriptPanel.addEventListener('change', event => {
    if (event.target.dataset.segmentField) services.updateSegmentFromControl(event.target);
  });
  services.els.scriptPanel.addEventListener('click', event => {
    const button = event.target.closest('[data-segment-action]');
    const card = event.target.closest('[data-segment-index]');
    if (button && card) services.performSegmentAction(Number(card.dataset.segmentIndex), button.dataset.segmentAction);
  });
  services.els.scriptPanel.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-segment-index]');
    if (!card) return;
    services.dragIndex = Number(card.dataset.segmentIndex);
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
  });
  services.els.scriptPanel.addEventListener('dragover', event => {
    const card = event.target.closest('[data-segment-index]');
    if (!card) return;
    event.preventDefault();
    for (const other of services.els.scriptPanel.querySelectorAll('.drag-over')) other.classList.remove('drag-over');
    card.classList.add('drag-over');
  });
  services.els.scriptPanel.addEventListener('drop', event => {
    const card = event.target.closest('[data-segment-index]');
    if (!card) return;
    event.preventDefault();
    services.reorderSegments(services.dragIndex, Number(card.dataset.segmentIndex));
  });
  services.els.scriptPanel.addEventListener('dragend', () => {
    services.dragIndex = null;
    for (const card of services.els.scriptPanel.querySelectorAll('.dragging,.drag-over')) card.classList.remove('dragging', 'drag-over');
  });
  for (const menu of [services.els.refineMenu, services.els.scriptMoreMenu]) menu.addEventListener('click', event => {
    const button = event.target.closest('[data-script-action]');
    if (!button) return;
    const action = button.dataset.scriptAction;
    menu.removeAttribute('open');
    if (['regenerate', 'shorten', 'expand', 'conversational', 'serious', 'humour'].includes(action)) services.refineScript(action);
    if (action === 'reset' && services.appState.originalScript) {
      services.snapshotScript();
      services.appState.script = services.deepClone(services.appState.originalScript);
      services.invalidatePodcastAudio('script-reset');
      services.snapshotScript({
        force: true
      });
      services.queueSave();
      services.renderScriptStage();
    }
    if (action === 'copy') services.copyText(services.buildCleanTranscript(), 'Transcript copied.');
    if (action === 'download-json') services.downloadBlob(new Blob([JSON.stringify(services.appState.script, null, 2)], {
      type: 'application/json'
    }), services.buildEpisodeFilename('json'));
  });
  services.els.undoButton.addEventListener('click', services.undo);
  services.els.redoButton.addEventListener('click', services.redo);
  services.els.generateAudioButton.addEventListener('click', services.generatePodcastAudio);
  services.els.backToCreateButton.addEventListener('click', () => services.setStage('create'));
  services.els.audioContent.addEventListener('click', event => {
    const button = event.target.closest('[data-audio-action]');
    if (!button) return;
    const action = button.dataset.audioAction;
    if (action === 'download' && services.appState.audio.blob) services.downloadBlob(services.appState.audio.blob, services.buildEpisodeFilename('wav'));
    if (action === 'regenerate') services.generatePodcastAudio();
    if (action === 'script') services.setStage('script');
    if (action === 'copy') services.copyText(services.buildCleanTranscript(), 'Transcript copied.');
    if (action === 'new') services.resetProject({
      preserveConnection: true,
      preservePreferences: true
    });
  });
  function openSettings() {
    services.renderConnectionForms();
    services.els.settingsDialog.showModal();
  }
  services.els.settingsButton.addEventListener('click', openSettings);
  services.els.connectionChip.addEventListener('click', openSettings);
  function commitSettings() {
    services.appState.settings.maxTtsCharacters = Math.min(services.MAX_TTS_CHUNK_CHARACTERS, Math.max(services.MIN_TTS_CHUNK_CHARACTERS, Number(services.els.maxTtsCharacters.value) || services.DEFAULT_MAX_TTS_CHARACTERS));
    services.appState.settings.speakingRate = Math.min(200, Math.max(100, Number(services.els.speakingRate.value) || services.DEFAULT_SPEAKING_RATE));
    services.queueSave();
    if (services.appState.currentStage === 'script') services.renderScriptMetrics();
    services.updateTargetSummary();
  }
  // The dialog's close event covers the Done button, X, Escape and programmatic close.
  services.els.settingsDialog.addEventListener('close', commitSettings);
  services.els.closeSettingsButton.addEventListener('click', () => services.els.settingsDialog.close());
  services.els.closeSettingsIcon.addEventListener('click', () => services.els.settingsDialog.close());
  services.els.clearStoredDataButton.addEventListener('click', services.clearStoredData);
  for (const formHost of [services.els.connectionSetupForm, services.els.connectionSettingsForm]) {
    formHost.addEventListener('change', event => {
      const form = event.target.closest('[data-connection-form]');
      if (form) services.syncConnectionForm(form);
    });
    formHost.addEventListener('click', event => {
      const button = event.target.closest('[data-toggle-key]');
      if (!button) return;
      const input = button.parentElement.querySelector('input');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
      button.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
    });
  }
  services.els.themeButton.addEventListener('click', () => {
    services.appState.settings.theme = services.appState.settings.theme === 'dark' ? 'light' : 'dark';
    services.applyTheme();
    services.queueSave();
    if (services.appState.currentStage === 'audio') services.drawWaveform(services.appState.audio.blob);
  });
  services.els.dismissErrorButton.addEventListener('click', services.hideServiceError);
  document.addEventListener('click', event => {
    const menu = event.target.closest('details.menu');
    closeMenus(menu);
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      services.appState.currentStage === 'create' ? services.generatePodcastScript() : services.appState.currentStage === 'script' ? services.generatePodcastAudio() : null;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && services.appState.currentStage === 'script') {
      event.preventDefault();
      services.undo();
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || event.shiftKey && event.key.toLowerCase() === 'z') && services.appState.currentStage === 'script') {
      event.preventDefault();
      services.redo();
    }
  });
  window.addEventListener('beforeunload', services.revokeAudioUrl);
  Object.assign(services, {
    closeMenus,
    openSettings
  });
  return services;
}
