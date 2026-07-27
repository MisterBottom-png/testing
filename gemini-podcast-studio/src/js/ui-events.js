export function installUiEvents(ctx) {
  function closeMenus(except) {
      for (const menu of document.querySelectorAll('details.menu[open]'))
          if (menu !== except)
              menu.removeAttribute('open');
  }
  ctx.expose("closeMenus", closeMenus);
  document.querySelector('.stepper').addEventListener('click', event => {
      const button = event.target.closest('[data-stage]');
      if (button && !button.disabled)
          ctx.setStage(button.dataset.stage);
  });
  ctx.els.createForm.addEventListener('submit', event => { event.preventDefault(); ctx.generatePodcastScript(); });
  ctx.els.createForm.addEventListener('input', event => {
      if (event.target.matches('input[name="duration"]')) {
          ctx.els.customDurationField.classList.toggle('hidden', event.target.value !== 'custom');
          if (event.target.value === 'custom')
              ctx.els.customDuration.focus();
      }
      if (event.target === ctx.els.language)
          ctx.els.customLanguage.classList.toggle('hidden', ctx.els.language.value !== 'custom');
      if (event.target === ctx.els.podcastFormat)
          ctx.els.customFormat.classList.toggle('hidden', ctx.els.podcastFormat.value !== 'custom');
      ctx.syncCreateInputs();
  });
  ctx.els.speakerList.addEventListener('input', event => {
      const card = event.target.closest('[data-speaker-index]');
      const field = event.target.dataset.speakerField;
      if (!card || !['speakerName', 'personality', 'deliveryInstructions'].includes(field))
          return;
      const index = Number(card.dataset.speakerIndex);
      const speaker = ctx.appState.speakers[index];
      const previousSpeakerName = speaker.speakerName;
      const previousVoiceName = speaker.geminiVoiceName;
      ctx.updateSpeakerField(speaker, field, event.target.value);
      if (field === 'speakerName' && previousSpeakerName !== speaker.speakerName) {
          ctx.renameScriptSpeaker(previousSpeakerName, speaker.speakerName);
          ctx.invalidateAudioForSpeakerMappingChange({
              speakerId: speaker.id,
              previousSpeakerName,
              nextSpeakerName: speaker.speakerName,
              previousVoiceName,
              nextVoiceName: speaker.geminiVoiceName
          });
          if (ctx.appState.currentStage === 'script')
              ctx.renderScriptStage();
      }
      if (field === 'personality' || field === 'deliveryInstructions')
          ctx.invalidatePodcastAudio(`speaker-${field}-changed`);
      ctx.queueSave();
  });
  ctx.els.speakerList.addEventListener('change', event => {
      const card = event.target.closest('[data-speaker-index]');
      const field = event.target.dataset.speakerField;
      if (!card || !['gender', 'voiceType', 'geminiVoiceName'].includes(field))
          return;
      const speaker = ctx.appState.speakers[Number(card.dataset.speakerIndex)];
      const previousSpeakerName = speaker.speakerName;
      const previousVoiceName = speaker.geminiVoiceName;
      ctx.resetDuplicateVoiceApproval();
      ctx.updateSpeakerField(speaker, field, event.target.value);
      ctx.invalidateAudioForSpeakerMappingChange({
          speakerId: speaker.id,
          previousSpeakerName,
          nextSpeakerName: speaker.speakerName,
          previousVoiceName,
          nextVoiceName: speaker.geminiVoiceName
      });
      ctx.renderSpeakerCards();
      ctx.queueSave();
  });
  ctx.els.speakerList.addEventListener('click', event => {
      const button = event.target.closest('[data-duplicate-voice-action]');
      if (!button)
          return;
      if (button.dataset.duplicateVoiceAction === 'use-anyway') {
          ctx.approveDuplicateVoice();
          ctx.renderSpeakerCards();
          ctx.generatePodcastScript();
      }
      if (button.dataset.duplicateVoiceAction === 'choose-another') {
          ctx.duplicateVoiceWarningVisible = false;
          ctx.renderSpeakerCards();
          requestAnimationFrame(() => document.getElementById('speakerVoice1')?.focus());
      }
  });
  ctx.els.swapCharacters.addEventListener('click', () => {
      ctx.resetDuplicateVoiceApproval();
      ctx.appState.speakers.reverse();
      ctx.appState.speakers[0].id = 'host-1';
      ctx.appState.speakers[1].id = 'host-2';
      ctx.invalidatePodcastAudio('speaker-order-changed');
      ctx.renderSpeakerCards();
      ctx.queueSave();
  });
  ctx.els.scriptTabs.addEventListener('click', event => { const tab = event.target.closest('[data-script-view]'); if (!tab)
      return; ctx.appState.scriptView = tab.dataset.scriptView; ctx.renderScriptTabs(); });
  ctx.els.scriptTabs.addEventListener('keydown', event => {
      const tabs = [...ctx.els.scriptTabs.querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(document.activeElement);
      if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowLeft')
          next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight')
          next = (current + 1) % tabs.length;
      if (event.key === 'Home')
          next = 0;
      if (event.key === 'End')
          next = tabs.length - 1;
      tabs[next].focus();
      tabs[next].click();
  });
  ctx.els.scriptPanel.addEventListener('input', event => { if (!event.target.dataset.segmentField)
      return; if (event.target.tagName === 'TEXTAREA')
      ctx.autoSize(event.target); ctx.updateSegmentFromControl(event.target); });
  ctx.els.scriptPanel.addEventListener('change', event => { if (event.target.dataset.segmentField)
      ctx.updateSegmentFromControl(event.target); });
  ctx.els.scriptPanel.addEventListener('click', event => { const button = event.target.closest('[data-segment-action]'); const card = event.target.closest('[data-segment-index]'); if (button && card)
      ctx.performSegmentAction(Number(card.dataset.segmentIndex), button.dataset.segmentAction); });
  ctx.els.scriptPanel.addEventListener('dragstart', event => { const card = event.target.closest('[data-segment-index]'); if (!card)
      return; ctx.dragIndex = Number(card.dataset.segmentIndex); card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
  ctx.els.scriptPanel.addEventListener('dragover', event => { const card = event.target.closest('[data-segment-index]'); if (!card)
      return; event.preventDefault(); for (const other of ctx.els.scriptPanel.querySelectorAll('.drag-over'))
      other.classList.remove('drag-over'); card.classList.add('drag-over'); });
  ctx.els.scriptPanel.addEventListener('drop', event => { const card = event.target.closest('[data-segment-index]'); if (!card)
      return; event.preventDefault(); ctx.reorderSegments(ctx.dragIndex, Number(card.dataset.segmentIndex)); });
  ctx.els.scriptPanel.addEventListener('dragend', () => { ctx.dragIndex = null; for (const card of ctx.els.scriptPanel.querySelectorAll('.dragging,.drag-over'))
      card.classList.remove('dragging', 'drag-over'); });
  for (const menu of [ctx.els.refineMenu, ctx.els.scriptMoreMenu])
      menu.addEventListener('click', event => {
          const button = event.target.closest('[data-script-action]');
          if (!button)
              return;
          const action = button.dataset.scriptAction;
          menu.removeAttribute('open');
          if (['regenerate', 'shorten', 'expand', 'conversational', 'serious', 'humour'].includes(action))
              ctx.refineScript(action);
          if (action === 'reset' && ctx.appState.originalScript) {
              ctx.snapshotScript();
              ctx.appState.script = ctx.deepClone(ctx.appState.originalScript);
              ctx.invalidatePodcastAudio('script-reset');
              ctx.snapshotScript({ force: true });
              ctx.queueSave();
              ctx.renderScriptStage();
          }
          if (action === 'copy')
              ctx.copyText(ctx.buildCleanTranscript(), 'Transcript copied.');
          if (action === 'download-json')
              ctx.downloadBlob(new Blob([JSON.stringify(ctx.appState.script, null, 2)], { type: 'application/json' }), ctx.buildEpisodeFilename('json'));
      });
  ctx.els.undoButton.addEventListener('click', ctx.undo);
  ctx.els.redoButton.addEventListener('click', ctx.redo);
  ctx.els.generateAudioButton.addEventListener('click', ctx.generatePodcastAudio);
  ctx.els.backToCreateButton.addEventListener('click', () => ctx.setStage('create'));
  ctx.els.audioContent.addEventListener('click', event => {
      const button = event.target.closest('[data-audio-action]');
      if (!button)
          return;
      const action = button.dataset.audioAction;
      if (action === 'download' && ctx.appState.audio.blob)
          ctx.downloadBlob(ctx.appState.audio.blob, ctx.buildEpisodeFilename('wav'));
      if (action === 'regenerate')
          ctx.generatePodcastAudio();
      if (action === 'script')
          ctx.setStage('script');
      if (action === 'copy')
          ctx.copyText(ctx.buildCleanTranscript(), 'Transcript copied.');
      if (action === 'new')
          ctx.resetProject({ preserveConnection: true, preservePreferences: true });
  });
  function openSettings() { ctx.renderConnectionForms(); ctx.els.settingsDialog.showModal(); }
  ctx.expose("openSettings", openSettings);
  ctx.els.settingsButton.addEventListener('click', openSettings);
  ctx.els.connectionChip.addEventListener('click', openSettings);
  ctx.els.closeSettingsButton.addEventListener('click', () => { ctx.appState.settings.maxTtsCharacters = Math.max(2000, Number(ctx.els.maxTtsCharacters.value) || ctx.DEFAULT_MAX_TTS_CHARACTERS); ctx.appState.settings.speakingRate = Math.min(200, Math.max(100, Number(ctx.els.speakingRate.value) || 140)); ctx.queueSave(); ctx.els.settingsDialog.close(); if (ctx.appState.currentStage === 'script')
      ctx.renderScriptMetrics(); ctx.updateTargetSummary(); });
  ctx.els.closeSettingsIcon.addEventListener('click', () => ctx.els.settingsDialog.close());
  ctx.els.clearStoredDataButton.addEventListener('click', ctx.clearStoredData);
  for (const formHost of [ctx.els.connectionSetupForm, ctx.els.connectionSettingsForm]) {
      formHost.addEventListener('change', event => { const form = event.target.closest('[data-connection-form]'); if (form)
          ctx.syncConnectionForm(form); });
      formHost.addEventListener('click', event => { const button = event.target.closest('[data-toggle-key]'); if (!button)
          return; const input = button.parentElement.querySelector('input'); const showing = input.type === 'text'; input.type = showing ? 'password' : 'text'; button.textContent = showing ? 'Show' : 'Hide'; button.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key'); });
  }
  ctx.els.themeButton.addEventListener('click', () => { ctx.appState.settings.theme = ctx.appState.settings.theme === 'dark' ? 'light' : 'dark'; ctx.applyTheme(); ctx.queueSave(); if (ctx.appState.currentStage === 'audio')
      ctx.drawWaveform(ctx.appState.audio.blob); });
  ctx.els.dismissErrorButton.addEventListener('click', ctx.hideServiceError);
  document.addEventListener('click', event => { const menu = event.target.closest('details.menu'); closeMenus(menu); });
  document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          ctx.appState.currentStage === 'create' ? ctx.generatePodcastScript() : ctx.appState.currentStage === 'script' ? ctx.generatePodcastAudio() : null;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && ctx.appState.currentStage === 'script') {
          event.preventDefault();
          ctx.undo();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) && ctx.appState.currentStage === 'script') {
          event.preventDefault();
          ctx.redo();
      }
  });
  window.addEventListener('beforeunload', ctx.revokeAudioUrl);
}
