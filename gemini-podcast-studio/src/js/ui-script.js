function snapshotScript({ force = false } = {}) {
  if (!appState.script) return;
  const serialised = JSON.stringify(appState.script);
  const current = appState.history[appState.historyIndex];
  if (!force && current && JSON.stringify(current) === serialised) return;
  appState.history = appState.history.slice(0, appState.historyIndex + 1);
  appState.history.push(deepClone(appState.script));
  if (appState.history.length > MAX_HISTORY) appState.history.shift();
  appState.historyIndex = appState.history.length - 1;
  updateUndoRedo();
}
function resetHistory() { appState.history = []; appState.historyIndex = -1; snapshotScript({ force: true }); }
function undo() {
  if (appState.historyIndex <= 0) return;
  appState.historyIndex -= 1; appState.script = deepClone(appState.history[appState.historyIndex]);
  renderScriptStage(); queueSave(); announce('Undid the last script change.');
}
function redo() {
  if (appState.historyIndex >= appState.history.length - 1) return;
  appState.historyIndex += 1; appState.script = deepClone(appState.history[appState.historyIndex]);
  renderScriptStage(); queueSave(); announce('Redid the script change.');
}
function updateUndoRedo() {
  els.undoButton.disabled = appState.historyIndex <= 0 || appState.busy;
  els.redoButton.disabled = appState.historyIndex >= appState.history.length - 1 || appState.busy;
}

function renderCurrentStage({ focus = true } = {}) {
  const stageMap = { create: els.createStage, script: els.scriptStage, audio: els.audioStage };
  for (const [stage, node] of Object.entries(stageMap)) node.classList.toggle('active', stage === appState.currentStage);
  const order = ['create', 'script', 'audio'];
  const currentIndex = order.indexOf(appState.currentStage);
  for (const button of document.querySelectorAll('.step-button')) {
    const stage = button.dataset.stage;
    const available = stage === 'create' || (stage === 'script' && appState.script) || (stage === 'audio' && appState.audio.url);
    button.disabled = !available || appState.busy;
    button.classList.toggle('completed', order.indexOf(stage) < currentIndex || (stage === 'script' && appState.audio.url));
    if (stage === appState.currentStage) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    button.querySelector('.step-number').textContent = button.classList.contains('completed') ? '✓' : String(order.indexOf(stage) + 1);
  }
  if (appState.currentStage === 'script') renderScriptStage();
  if (appState.currentStage === 'audio') renderAudioStage();
  if (focus) {
    const heading = stageMap[appState.currentStage].querySelector('h2[tabindex="-1"]');
    requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
function setStage(stage) {
  if (stage === 'script' && !appState.script) return;
  if (stage === 'audio' && !appState.audio.url) return;
  appState.currentStage = stage; renderCurrentStage();
}

function renderScriptStage() {
  if (!appState.script) return;
  els.scriptStageTitle.textContent = appState.script.title || 'Untitled podcast';
  els.scriptSummaryText.textContent = appState.script.summary || 'Edit the conversation before generating audio.';
  renderScriptTabs();
  renderScriptMetrics();
  updateUndoRedo();
}
function renderScriptTabs() {
  for (const tab of els.scriptTabs.querySelectorAll('[role="tab"]')) {
    const active = tab.dataset.scriptView === appState.scriptView;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  const activeTab = els.scriptTabs.querySelector(`[data-script-view="${appState.scriptView}"]`);
  els.scriptPanel.setAttribute('aria-labelledby', activeTab.id);
  if (appState.scriptView === 'transcript') {
    els.scriptPanel.innerHTML = `<div class="preview-block">${escapeHtml(buildCleanTranscript())}</div>`;
  } else if (appState.scriptView === 'tts') {
    els.scriptPanel.innerHTML = `<div class="preview-block">${escapeHtml(buildTtsTranscript())}</div>`;
  } else {
    renderSegmentList();
  }
}
function renderScriptMetrics() {
  if (!appState.script) return;
  const words = getWordCount();
  const seconds = getEstimatedSeconds(words);
  const ttsChars = buildTtsTranscript().length;
  els.scriptMetrics.innerHTML = `
    <div class="metric"><strong>${words.toLocaleString('en-GB')}</strong><span>spoken words</span></div>
    <div class="metric"><strong>${formatDuration(seconds)}</strong><span>estimated</span></div>
    <div class="metric"><strong>${appState.script.segments.length.toLocaleString('en-GB')}</strong><span>segments</span></div>
    <div class="metric"><strong>${ttsChars.toLocaleString('en-GB')}</strong><span>TTS characters</span></div>`;
  const tooLong = ttsChars > appState.settings.maxTtsCharacters;
  els.scriptValidation.className = `validation-status${tooLong ? ' warning' : ''}`;
  els.scriptValidation.textContent = tooLong ? `Transcript exceeds the ${appState.settings.maxTtsCharacters.toLocaleString('en-GB')} character threshold.` : 'Script is ready for audio generation.';
  els.generateAudioButton.disabled = tooLong || appState.busy;
}
function segmentMenu(index) {
  return `<details class="menu icon-menu"><summary class="menu-summary" aria-label="Segment ${index + 1} actions">${ICONS.more}</summary><div class="menu-popover">
    <button class="menu-item" type="button" data-segment-action="up">Move up</button>
    <button class="menu-item" type="button" data-segment-action="down">Move down</button>
    <button class="menu-item" type="button" data-segment-action="insert">Insert below</button>
    <button class="menu-item" type="button" data-segment-action="duplicate">Duplicate</button>
    <button class="menu-item danger" type="button" data-segment-action="delete">Delete</button>
  </div></details>`;
}
function renderSegmentList() {
  els.scriptPanel.innerHTML = `<div class="segment-list">${appState.script.segments.map((segment, index) => {
    const speakerIndex = Math.max(0, appState.characters.findIndex(character => character.name === segment.speaker));
    const speakerOptions = appState.characters.map(character => `<option value="${escapeHtml(character.name)}"${character.name === segment.speaker ? ' selected' : ''}>${escapeHtml(character.name)}</option>`).join('');
    return `<article class="segment-card" draggable="true" data-segment-index="${index}" data-speaker-index="${speakerIndex}">
      <div class="segment-header">
        <button class="drag-handle" type="button" aria-label="Drag segment ${index + 1} to reorder" title="Drag to reorder">${ICONS.grip}</button>
        <div class="segment-identity">
          <select class="segment-speaker" data-segment-field="speaker" aria-label="Speaker for segment ${index + 1}">${speakerOptions}</select>
          <input class="performance-input" data-segment-field="direction" value="${escapeHtml(segment.direction || '')}" placeholder="Optional performance cue" aria-label="Performance cue for segment ${index + 1}" />
        </div>
        ${segmentMenu(index)}
      </div>
      <div class="segment-body"><textarea data-segment-field="text" aria-label="Spoken text for segment ${index + 1}">${escapeHtml(segment.text)}</textarea></div>
    </article>`;
  }).join('')}</div>`;
  for (const textarea of els.scriptPanel.querySelectorAll('textarea')) autoSize(textarea);
}
function updateSegmentFromControl(control) {
  const card = control.closest('[data-segment-index]');
  const segment = appState.script?.segments?.[Number(card?.dataset.segmentIndex)];
  if (!segment) return;
  segment[control.dataset.segmentField] = control.dataset.segmentField === 'direction' ? normalisePerformanceTag(control.value) : control.value;
  if (control.dataset.segmentField === 'speaker') {
    card.dataset.speakerIndex = String(Math.max(0, appState.characters.findIndex(character => character.name === control.value)));
  }
  appState.script.estimatedWords = getWordCount();
  renderScriptMetrics(); queueSave();
  clearTimeout(typingHistoryTimer);
  typingHistoryTimer = setTimeout(() => snapshotScript(), 650);
}
function performSegmentAction(index, action) {
  const segments = appState.script?.segments;
  if (!segments) return;
  snapshotScript();
  if (action === 'up' && index > 0) [segments[index - 1], segments[index]] = [segments[index], segments[index - 1]];
  if (action === 'down' && index < segments.length - 1) [segments[index + 1], segments[index]] = [segments[index], segments[index + 1]];
  if (action === 'duplicate') segments.splice(index + 1, 0, deepClone(segments[index]));
  if (action === 'delete' && segments.length > 2) segments.splice(index, 1);
  if (action === 'insert') {
    const nextSpeaker = appState.characters.find(character => character.name !== segments[index].speaker)?.name || appState.characters[0].name;
    segments.splice(index + 1, 0, { speaker: nextSpeaker, direction: '', text: '' });
  }
  appState.script.estimatedWords = getWordCount(); snapshotScript({ force: true }); queueSave(); renderScriptStage();
  const focusIndex = action === 'delete' ? Math.min(index, segments.length - 1) : action === 'up' ? Math.max(0, index - 1) : action === 'down' ? Math.min(segments.length - 1, index + 1) : index + 1;
  requestAnimationFrame(() => els.scriptPanel.querySelector(`[data-segment-index="${focusIndex}"] textarea`)?.focus());
  announce(`Segment ${index + 1} ${action === 'delete' ? 'deleted' : action === 'duplicate' ? 'duplicated' : action === 'insert' ? 'inserted' : `moved ${action}`}.`);
}
function reorderSegments(from, to) {
  if (from === to || from == null || to == null) return;
  const [segment] = appState.script.segments.splice(from, 1);
  appState.script.segments.splice(to, 0, segment);
  snapshotScript({ force: true }); queueSave(); renderScriptStage();
  els.reorderStatus.textContent = `Segment moved to position ${to + 1} of ${appState.script.segments.length}.`;
}
function buildCleanTranscript() { return appState.script?.segments?.map(segment => `${segment.speaker}: ${segment.text}`).join('\n\n') || ''; }
function buildTtsTranscript(script = appState.script) {
  if (!script) return '';
  const [a, b] = appState.characters;
  const speakerInstructions = appState.characters.map(character => {
    const details = [character.personality, character.direction, character.accent ? `Accent or language note: ${character.accent}` : ''].filter(Boolean).join('. ');
    return `${character.name} should sound ${details || 'natural and conversational'}.`;
  }).join('\n');
  let previousTag = '';
  const dialogue = script.segments.map(segment => {
    const tag = normalisePerformanceTag(segment.direction);
    const cue = tag && tag.toLocaleLowerCase() !== previousTag.toLocaleLowerCase() ? ` [${tag}]` : '';
    previousTag = tag || '';
    return `${segment.speaker}:${cue} ${segment.text}`;
  }).join('\n\n');
  return `Create a natural podcast conversation between ${a.name} and ${b.name}.\n\n${speakerInstructions}\n\nSpeak only the dialogue. Do not read speaker names, brackets, or instructions aloud. Bracketed cues are silent, subtle performance directions that apply only to the line immediately following them. Do not exaggerate them. Keep the delivery conversational and preserve every spoken word exactly.\n\n${dialogue}`;
}
