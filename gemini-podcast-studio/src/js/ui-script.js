export function installScriptUi(services) {
  function snapshotScript({
    force = false
  } = {}) {
    if (!services.appState.script) return;
    const serialised = JSON.stringify(services.appState.script);
    const current = services.appState.history[services.appState.historyIndex];
    if (!force && current && JSON.stringify(current) === serialised) return;
    services.appState.history = services.appState.history.slice(0, services.appState.historyIndex + 1);
    services.appState.history.push(services.deepClone(services.appState.script));
    if (services.appState.history.length > services.MAX_HISTORY) services.appState.history.shift();
    services.appState.historyIndex = services.appState.history.length - 1;
    updateUndoRedo();
  }
  function resetHistory() {
    services.appState.history = [];
    services.appState.historyIndex = -1;
    snapshotScript({
      force: true
    });
  }
  function undo() {
    if (services.appState.historyIndex <= 0) return;
    services.appState.historyIndex -= 1;
    services.appState.script = services.deepClone(services.appState.history[services.appState.historyIndex]);
    services.invalidatePodcastAudio('script-undo');
    renderScriptStage();
    services.queueSave();
    services.announce('Undid the last script change.');
  }
  function redo() {
    if (services.appState.historyIndex >= services.appState.history.length - 1) return;
    services.appState.historyIndex += 1;
    services.appState.script = services.deepClone(services.appState.history[services.appState.historyIndex]);
    services.invalidatePodcastAudio('script-redo');
    renderScriptStage();
    services.queueSave();
    services.announce('Redid the script change.');
  }
  function updateUndoRedo() {
    services.els.undoButton.disabled = services.appState.historyIndex <= 0 || services.appState.busy;
    services.els.redoButton.disabled = services.appState.historyIndex >= services.appState.history.length - 1 || services.appState.busy;
  }
  function renderCurrentStage({
    focus = true
  } = {}) {
    const stageMap = {
      create: services.els.createStage,
      script: services.els.scriptStage,
      audio: services.els.audioStage
    };
    for (const [stage, node] of Object.entries(stageMap)) node.classList.toggle('active', stage === services.appState.currentStage);
    const order = ['create', 'script', 'audio'];
    const currentIndex = order.indexOf(services.appState.currentStage);
    for (const button of document.querySelectorAll('.step-button')) {
      const stage = button.dataset.stage;
      const available = stage === 'create' || stage === 'script' && services.appState.script || stage === 'audio' && services.appState.audio.url;
      button.disabled = !available || services.appState.busy;
      button.classList.toggle('completed', order.indexOf(stage) < currentIndex || stage === 'script' && services.appState.audio.url);
      if (stage === services.appState.currentStage) button.setAttribute('aria-current', 'step');else button.removeAttribute('aria-current');
      button.querySelector('.step-number').textContent = button.classList.contains('completed') ? '✓' : String(order.indexOf(stage) + 1);
    }
    if (services.appState.currentStage === 'script') renderScriptStage();
    if (services.appState.currentStage === 'audio') services.renderAudioStage();
    if (focus) {
      const heading = stageMap[services.appState.currentStage].querySelector('h2[tabindex="-1"]');
      requestAnimationFrame(() => heading?.focus({
        preventScroll: true
      }));
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }
  function setStage(stage) {
    if (stage === 'script' && !services.appState.script) return;
    if (stage === 'audio' && !services.appState.audio.url) return;
    services.appState.currentStage = stage;
    renderCurrentStage();
  }
  function renderScriptStage() {
    if (!services.appState.script) return;
    services.els.scriptStageTitle.textContent = services.appState.script.title || 'Untitled podcast';
    services.els.scriptSummaryText.textContent = services.appState.script.summary || 'Edit the conversation before generating audio.';
    renderScriptTabs();
    services.renderScriptMetrics();
    updateUndoRedo();
  }
  function renderScriptTabs() {
    for (const tab of services.els.scriptTabs.querySelectorAll('[role="tab"]')) {
      const active = tab.dataset.scriptView === services.appState.scriptView;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    const activeTab = services.els.scriptTabs.querySelector(`[data-script-view="${services.appState.scriptView}"]`);
    services.els.scriptPanel.setAttribute('aria-labelledby', activeTab.id);
    if (services.appState.scriptView === 'transcript') {
      services.els.scriptPanel.innerHTML = `<div class="preview-block">${services.escapeHtml(buildCleanTranscript())}</div>`;
    } else if (services.appState.scriptView === 'tts') {
      services.els.scriptPanel.innerHTML = `<div class="preview-block">${services.escapeHtml(buildTtsTranscript())}</div>`;
    } else {
      renderSegmentList();
    }
  }
  function renderScriptMetrics() {
    if (!services.appState.script) return;
    const words = services.getWordCount();
    const seconds = services.getEstimatedSeconds(words);
    const ttsChars = buildTtsTranscript().length;
    services.els.scriptMetrics.innerHTML = `
    <div class="metric"><strong>${words.toLocaleString('en-GB')}</strong><span>spoken words</span></div>
    <div class="metric"><strong>${services.formatDuration(seconds)}</strong><span>estimated</span></div>
    <div class="metric"><strong>${services.appState.script.segments.length.toLocaleString('en-GB')}</strong><span>segments</span></div>
    <div class="metric"><strong>${ttsChars.toLocaleString('en-GB')}</strong><span>TTS characters</span></div>`;
    let chunkCount = 1;
    let chunkError = null;
    try {
      chunkCount = Math.max(1, services.createTtsChunks().length);
    } catch (error) {
      chunkError = error;
    }
    services.els.scriptValidation.className = `validation-status${chunkError || chunkCount > 1 ? ' warning' : ''}`;
    services.els.scriptValidation.textContent = chunkError ? chunkError.message : chunkCount > 1 ? `Script is ready and will be generated in ${chunkCount} TTS chunks.` : 'Script is ready for audio generation.';
    services.els.generateAudioButton.disabled = Boolean(chunkError) || services.appState.busy;
  }
  function segmentMenu(index) {
    return `<details class="menu icon-menu"><summary class="menu-summary" aria-label="Segment ${index + 1} actions">${services.ICONS.more}</summary><div class="menu-popover">
    <button class="menu-item" type="button" data-segment-action="up">Move up</button>
    <button class="menu-item" type="button" data-segment-action="down">Move down</button>
    <button class="menu-item" type="button" data-segment-action="insert">Insert below</button>
    <button class="menu-item" type="button" data-segment-action="duplicate">Duplicate</button>
    <button class="menu-item danger" type="button" data-segment-action="delete">Delete</button>
  </div></details>`;
  }
  function renderSegmentList() {
    services.els.scriptPanel.innerHTML = `<div class="segment-list">${services.appState.script.segments.map((segment, index) => {
      const speakerIndex = Math.max(0, services.appState.speakers.findIndex(speaker => speaker.speakerName === segment.speaker));
      const speakerOptions = services.appState.speakers.map(speaker => `<option value="${services.escapeHtml(speaker.speakerName)}"${speaker.speakerName === segment.speaker ? ' selected' : ''}>${services.escapeHtml(speaker.speakerName)}</option>`).join('');
      return `<article class="segment-card" draggable="true" data-segment-index="${index}" data-speaker-index="${speakerIndex}">
      <div class="segment-header">
        <button class="drag-handle" type="button" aria-label="Drag segment ${index + 1} to reorder" title="Drag to reorder">${services.ICONS.grip}</button>
        <div class="segment-identity">
          <select class="segment-speaker" data-segment-field="speaker" aria-label="Speaker for segment ${index + 1}">${speakerOptions}</select>
          <input class="performance-input" data-segment-field="direction" value="${services.escapeHtml(segment.direction || '')}" placeholder="Optional performance cue" aria-label="Performance cue for segment ${index + 1}" />
        </div>
        ${segmentMenu(index)}
      </div>
      <div class="segment-body"><textarea data-segment-field="text" aria-label="Spoken text for segment ${index + 1}">${services.escapeHtml(segment.text)}</textarea></div>
    </article>`;
    }).join('')}</div>`;
    for (const textarea of services.els.scriptPanel.querySelectorAll('textarea')) services.autoSize(textarea);
  }
  function updateSegmentFromControl(control) {
    const card = control.closest('[data-segment-index]');
    const segment = services.appState.script?.segments?.[Number(card?.dataset.segmentIndex)];
    if (!segment) return;
    segment[control.dataset.segmentField] = control.dataset.segmentField === 'direction' ? services.normalisePerformanceTag(control.value) : control.value;
    if (control.dataset.segmentField === 'speaker') {
      card.dataset.speakerIndex = String(Math.max(0, services.appState.speakers.findIndex(speaker => speaker.speakerName === control.value)));
    }
    services.appState.script.estimatedWords = services.getWordCount();
    services.invalidatePodcastAudio('script-edited');
    services.renderScriptMetrics();
    services.queueSave();
    clearTimeout(services.typingHistoryTimer);
    services.typingHistoryTimer = setTimeout(() => snapshotScript(), 650);
  }
  function performSegmentAction(index, action) {
    const segments = services.appState.script?.segments;
    if (!segments) return;
    snapshotScript();
    if (action === 'up' && index > 0) [segments[index - 1], segments[index]] = [segments[index], segments[index - 1]];
    if (action === 'down' && index < segments.length - 1) [segments[index + 1], segments[index]] = [segments[index], segments[index + 1]];
    if (action === 'duplicate') segments.splice(index + 1, 0, services.deepClone(segments[index]));
    if (action === 'delete' && segments.length > 2) segments.splice(index, 1);
    if (action === 'insert') {
      const nextSpeaker = services.appState.speakers.find(speaker => speaker.speakerName !== segments[index].speaker)?.speakerName || services.appState.speakers[0].speakerName;
      segments.splice(index + 1, 0, {
        speaker: nextSpeaker,
        direction: '',
        text: ''
      });
    }
    services.appState.script.estimatedWords = services.getWordCount();
    services.invalidatePodcastAudio('script-structure-changed');
    snapshotScript({
      force: true
    });
    services.queueSave();
    renderScriptStage();
    const focusIndex = action === 'delete' ? Math.min(index, segments.length - 1) : action === 'up' ? Math.max(0, index - 1) : action === 'down' ? Math.min(segments.length - 1, index + 1) : index + 1;
    requestAnimationFrame(() => services.els.scriptPanel.querySelector(`[data-segment-index="${focusIndex}"] textarea`)?.focus());
    services.announce(`Segment ${index + 1} ${action === 'delete' ? 'deleted' : action === 'duplicate' ? 'duplicated' : action === 'insert' ? 'inserted' : `moved ${action}`}.`);
  }
  function reorderSegments(from, to) {
    if (from === to || from == null || to == null) return;
    const [segment] = services.appState.script.segments.splice(from, 1);
    services.appState.script.segments.splice(to, 0, segment);
    services.invalidatePodcastAudio('script-reordered');
    snapshotScript({
      force: true
    });
    services.queueSave();
    renderScriptStage();
    services.els.reorderStatus.textContent = `Segment moved to position ${to + 1} of ${services.appState.script.segments.length}.`;
  }
  function buildCleanTranscript() {
    return services.appState.script?.segments?.map(segment => `${segment.speaker}: ${segment.text}`).join('\n\n') || '';
  }
  function buildTtsTranscript(script = services.appState.script) {
    if (!script) return '';
    const [a, b] = services.appState.speakers;
    const speakerInstructions = services.appState.speakers.map(speaker => {
      const details = [speaker.personality, speaker.deliveryInstructions, speaker.accent ? `Accent or language note: ${speaker.accent}` : ''].filter(Boolean).join('. ');
      return `${speaker.speakerName} should sound ${details || 'natural and conversational'}.`;
    }).join('\n');
    let previousTag = '';
    const dialogue = script.segments.map(segment => {
      const tag = services.normalisePerformanceTag(segment.direction);
      const cue = tag && tag.toLocaleLowerCase() !== previousTag.toLocaleLowerCase() ? ` [${tag}]` : '';
      previousTag = tag || '';
      return `${segment.speaker}:${cue} ${segment.text}`;
    }).join('\n\n');
    return `Create a natural podcast conversation between ${a.speakerName} and ${b.speakerName}.\n\n${speakerInstructions}\n\nSpeak only the dialogue. Do not read speaker names, brackets, or instructions aloud. Bracketed cues are silent, subtle performance directions that apply only to the line immediately following them. Do not exaggerate them. Keep the delivery conversational and preserve every spoken word exactly.\n\n${dialogue}`;
  }
  Object.assign(services, {
    snapshotScript,
    resetHistory,
    undo,
    redo,
    updateUndoRedo,
    renderCurrentStage,
    setStage,
    renderScriptStage,
    renderScriptTabs,
    renderScriptMetrics,
    segmentMenu,
    renderSegmentList,
    updateSegmentFromControl,
    performSegmentAction,
    reorderSegments,
    buildCleanTranscript,
    buildTtsTranscript
  });
  return services;
}
