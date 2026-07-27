export function installUiScript(ctx) {
  function snapshotScript({ force = false } = {}) {
      if (!ctx.appState.script)
          return;
      const serialised = JSON.stringify(ctx.appState.script);
      const current = ctx.appState.history[ctx.appState.historyIndex];
      if (!force && current && JSON.stringify(current) === serialised)
          return;
      ctx.appState.history = ctx.appState.history.slice(0, ctx.appState.historyIndex + 1);
      ctx.appState.history.push(ctx.deepClone(ctx.appState.script));
      if (ctx.appState.history.length > ctx.MAX_HISTORY)
          ctx.appState.history.shift();
      ctx.appState.historyIndex = ctx.appState.history.length - 1;
      updateUndoRedo();
  }
  ctx.expose("snapshotScript", snapshotScript);
  function resetHistory() { ctx.appState.history = []; ctx.appState.historyIndex = -1; snapshotScript({ force: true }); }
  ctx.expose("resetHistory", resetHistory);
  function undo() {
      if (ctx.appState.historyIndex <= 0)
          return;
      ctx.appState.historyIndex -= 1;
      ctx.appState.script = ctx.deepClone(ctx.appState.history[ctx.appState.historyIndex]);
      ctx.invalidatePodcastAudio('script-undo');
      renderScriptStage();
      ctx.queueSave();
      ctx.announce('Undid the last script change.');
  }
  ctx.expose("undo", undo);
  function redo() {
      if (ctx.appState.historyIndex >= ctx.appState.history.length - 1)
          return;
      ctx.appState.historyIndex += 1;
      ctx.appState.script = ctx.deepClone(ctx.appState.history[ctx.appState.historyIndex]);
      ctx.invalidatePodcastAudio('script-redo');
      renderScriptStage();
      ctx.queueSave();
      ctx.announce('Redid the script change.');
  }
  ctx.expose("redo", redo);
  function updateUndoRedo() {
      ctx.els.undoButton.disabled = ctx.appState.historyIndex <= 0 || ctx.appState.busy;
      ctx.els.redoButton.disabled = ctx.appState.historyIndex >= ctx.appState.history.length - 1 || ctx.appState.busy;
  }
  ctx.expose("updateUndoRedo", updateUndoRedo);
  function renderCurrentStage({ focus = true } = {}) {
      const stageMap = { create: ctx.els.createStage, script: ctx.els.scriptStage, audio: ctx.els.audioStage };
      for (const [stage, node] of Object.entries(stageMap))
          node.classList.toggle('active', stage === ctx.appState.currentStage);
      const order = ['create', 'script', 'audio'];
      const currentIndex = order.indexOf(ctx.appState.currentStage);
      for (const button of document.querySelectorAll('.step-button')) {
          const stage = button.dataset.stage;
          const available = stage === 'create' || (stage === 'script' && ctx.appState.script) || (stage === 'audio' && ctx.appState.audio.url);
          button.disabled = !available || ctx.appState.busy;
          button.classList.toggle('completed', order.indexOf(stage) < currentIndex || (stage === 'script' && ctx.appState.audio.url));
          if (stage === ctx.appState.currentStage)
              button.setAttribute('aria-current', 'step');
          else
              button.removeAttribute('aria-current');
          button.querySelector('.step-number').textContent = button.classList.contains('completed') ? '✓' : String(order.indexOf(stage) + 1);
      }
      if (ctx.appState.currentStage === 'script')
          renderScriptStage();
      if (ctx.appState.currentStage === 'audio')
          ctx.renderAudioStage();
      if (focus) {
          const heading = stageMap[ctx.appState.currentStage].querySelector('h2[tabindex="-1"]');
          requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
          window.scrollTo({ top: 0, behavior: 'smooth' });
      }
  }
  ctx.expose("renderCurrentStage", renderCurrentStage);
  function setStage(stage) {
      if (stage === 'script' && !ctx.appState.script)
          return;
      if (stage === 'audio' && !ctx.appState.audio.url)
          return;
      ctx.appState.currentStage = stage;
      renderCurrentStage();
  }
  ctx.expose("setStage", setStage);
  function renderScriptStage() {
      if (!ctx.appState.script)
          return;
      ctx.els.scriptStageTitle.textContent = ctx.appState.script.title || 'Untitled podcast';
      ctx.els.scriptSummaryText.textContent = ctx.appState.script.summary || 'Edit the conversation before generating audio.';
      renderScriptTabs();
      ctx.renderScriptMetrics();
      updateUndoRedo();
  }
  ctx.expose("renderScriptStage", renderScriptStage);
  function renderScriptTabs() {
      for (const tab of ctx.els.scriptTabs.querySelectorAll('[role="tab"]')) {
          const active = tab.dataset.scriptView === ctx.appState.scriptView;
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
      }
      const activeTab = ctx.els.scriptTabs.querySelector(`[data-script-view="${ctx.appState.scriptView}"]`);
      ctx.els.scriptPanel.setAttribute('aria-labelledby', activeTab.id);
      if (ctx.appState.scriptView === 'transcript') {
          ctx.els.scriptPanel.innerHTML = `<div class="preview-block">${ctx.escapeHtml(buildCleanTranscript())}</div>`;
      }
      else if (ctx.appState.scriptView === 'tts') {
          ctx.els.scriptPanel.innerHTML = `<div class="preview-block">${ctx.escapeHtml(buildTtsTranscript())}</div>`;
      }
      else {
          renderSegmentList();
      }
  }
  ctx.expose("renderScriptTabs", renderScriptTabs);
  function renderScriptMetrics() {
      if (!ctx.appState.script)
          return;
      const words = ctx.getWordCount();
      const seconds = ctx.getEstimatedSeconds(words);
      const ttsChars = buildTtsTranscript().length;
      ctx.els.scriptMetrics.innerHTML = `
      <div class="metric"><strong>${words.toLocaleString('en-GB')}</strong><span>spoken words</span></div>
      <div class="metric"><strong>${ctx.formatDuration(seconds)}</strong><span>estimated</span></div>
      <div class="metric"><strong>${ctx.appState.script.segments.length.toLocaleString('en-GB')}</strong><span>segments</span></div>
      <div class="metric"><strong>${ttsChars.toLocaleString('en-GB')}</strong><span>TTS characters</span></div>`;
      let chunkCount = 1;
      let chunkError = null;
      try {
          chunkCount = Math.max(1, ctx.createTtsChunks().length);
      }
      catch (error) {
          chunkError = error;
      }
      ctx.els.scriptValidation.className = `validation-status${chunkError || chunkCount > 1 ? ' warning' : ''}`;
      ctx.els.scriptValidation.textContent = chunkError
          ? chunkError.message
          : chunkCount > 1
              ? `Script is ready and will be generated in ${chunkCount} TTS chunks.`
              : 'Script is ready for audio generation.';
      ctx.els.generateAudioButton.disabled = Boolean(chunkError) || ctx.appState.busy;
  }
  ctx.expose("renderScriptMetrics", renderScriptMetrics);
  function segmentMenu(index) {
      return `<details class="menu icon-menu"><summary class="menu-summary" aria-label="Segment ${index + 1} actions">${ctx.ICONS.more}</summary><div class="menu-popover">
      <button class="menu-item" type="button" data-segment-action="up">Move up</button>
      <button class="menu-item" type="button" data-segment-action="down">Move down</button>
      <button class="menu-item" type="button" data-segment-action="insert">Insert below</button>
      <button class="menu-item" type="button" data-segment-action="duplicate">Duplicate</button>
      <button class="menu-item danger" type="button" data-segment-action="delete">Delete</button>
    </div></details>`;
  }
  ctx.expose("segmentMenu", segmentMenu);
  function renderSegmentList() {
      ctx.els.scriptPanel.innerHTML = `<div class="segment-list">${ctx.appState.script.segments.map((segment, index) => {
          const speakerIndex = Math.max(0, ctx.appState.speakers.findIndex(speaker => speaker.speakerName === segment.speaker));
          const speakerOptions = ctx.appState.speakers.map(speaker => `<option value="${ctx.escapeHtml(speaker.speakerName)}"${speaker.speakerName === segment.speaker ? ' selected' : ''}>${ctx.escapeHtml(speaker.speakerName)}</option>`).join('');
          return `<article class="segment-card" draggable="true" data-segment-index="${index}" data-speaker-index="${speakerIndex}">
        <div class="segment-header">
          <button class="drag-handle" type="button" aria-label="Drag segment ${index + 1} to reorder" title="Drag to reorder">${ctx.ICONS.grip}</button>
          <div class="segment-identity">
            <select class="segment-speaker" data-segment-field="speaker" aria-label="Speaker for segment ${index + 1}">${speakerOptions}</select>
            <input class="performance-input" data-segment-field="direction" value="${ctx.escapeHtml(segment.direction || '')}" placeholder="Optional performance cue" aria-label="Performance cue for segment ${index + 1}" />
          </div>
          ${segmentMenu(index)}
        </div>
        <div class="segment-body"><textarea data-segment-field="text" aria-label="Spoken text for segment ${index + 1}">${ctx.escapeHtml(segment.text)}</textarea></div>
      </article>`;
      }).join('')}</div>`;
      for (const textarea of ctx.els.scriptPanel.querySelectorAll('textarea'))
          ctx.autoSize(textarea);
  }
  ctx.expose("renderSegmentList", renderSegmentList);
  function updateSegmentFromControl(control) {
      const card = control.closest('[data-segment-index]');
      const segment = ctx.appState.script?.segments?.[Number(card?.dataset.segmentIndex)];
      if (!segment)
          return;
      segment[control.dataset.segmentField] = control.dataset.segmentField === 'direction' ? ctx.normalisePerformanceTag(control.value) : control.value;
      if (control.dataset.segmentField === 'speaker') {
          card.dataset.speakerIndex = String(Math.max(0, ctx.appState.speakers.findIndex(speaker => speaker.speakerName === control.value)));
      }
      ctx.appState.script.estimatedWords = ctx.getWordCount();
      ctx.invalidatePodcastAudio('script-edited');
      ctx.renderScriptMetrics();
      ctx.queueSave();
      clearTimeout(ctx.typingHistoryTimer);
      ctx.typingHistoryTimer = setTimeout(() => snapshotScript(), 650);
  }
  ctx.expose("updateSegmentFromControl", updateSegmentFromControl);
  function performSegmentAction(index, action) {
      const segments = ctx.appState.script?.segments;
      if (!segments)
          return;
      snapshotScript();
      if (action === 'up' && index > 0)
          [segments[index - 1], segments[index]] = [segments[index], segments[index - 1]];
      if (action === 'down' && index < segments.length - 1)
          [segments[index + 1], segments[index]] = [segments[index], segments[index + 1]];
      if (action === 'duplicate')
          segments.splice(index + 1, 0, ctx.deepClone(segments[index]));
      if (action === 'delete' && segments.length > 2)
          segments.splice(index, 1);
      if (action === 'insert') {
          const nextSpeaker = ctx.appState.speakers.find(speaker => speaker.speakerName !== segments[index].speaker)?.speakerName || ctx.appState.speakers[0].speakerName;
          segments.splice(index + 1, 0, { speaker: nextSpeaker, direction: '', text: '' });
      }
      ctx.appState.script.estimatedWords = ctx.getWordCount();
      ctx.invalidatePodcastAudio('script-structure-changed');
      snapshotScript({ force: true });
      ctx.queueSave();
      renderScriptStage();
      const focusIndex = action === 'delete' ? Math.min(index, segments.length - 1) : action === 'up' ? Math.max(0, index - 1) : action === 'down' ? Math.min(segments.length - 1, index + 1) : index + 1;
      requestAnimationFrame(() => ctx.els.scriptPanel.querySelector(`[data-segment-index="${focusIndex}"] textarea`)?.focus());
      ctx.announce(`Segment ${index + 1} ${action === 'delete' ? 'deleted' : action === 'duplicate' ? 'duplicated' : action === 'insert' ? 'inserted' : `moved ${action}`}.`);
  }
  ctx.expose("performSegmentAction", performSegmentAction);
  function reorderSegments(from, to) {
      if (from === to || from == null || to == null)
          return;
      const [segment] = ctx.appState.script.segments.splice(from, 1);
      ctx.appState.script.segments.splice(to, 0, segment);
      ctx.invalidatePodcastAudio('script-reordered');
      snapshotScript({ force: true });
      ctx.queueSave();
      renderScriptStage();
      ctx.els.reorderStatus.textContent = `Segment moved to position ${to + 1} of ${ctx.appState.script.segments.length}.`;
  }
  ctx.expose("reorderSegments", reorderSegments);
  function buildCleanTranscript() { return ctx.appState.script?.segments?.map(segment => `${segment.speaker}: ${segment.text}`).join('\n\n') || ''; }
  ctx.expose("buildCleanTranscript", buildCleanTranscript);
  function buildTtsTranscript(script = ctx.appState.script) {
      if (!script)
          return '';
      const [a, b] = ctx.appState.speakers;
      const speakerInstructions = ctx.appState.speakers.map(speaker => {
          const details = [speaker.personality, speaker.deliveryInstructions, speaker.accent ? `Accent or language note: ${speaker.accent}` : ''].filter(Boolean).join('. ');
          return `${speaker.speakerName} should sound ${details || 'natural and conversational'}.`;
      }).join('\n');
      let previousTag = '';
      const dialogue = script.segments.map(segment => {
          const tag = ctx.normalisePerformanceTag(segment.direction);
          const cue = tag && tag.toLocaleLowerCase() !== previousTag.toLocaleLowerCase() ? ` [${tag}]` : '';
          previousTag = tag || '';
          return `${segment.speaker}:${cue} ${segment.text}`;
      }).join('\n\n');
      return `Create a natural podcast conversation between ${a.speakerName} and ${b.speakerName}.\n\n${speakerInstructions}\n\nSpeak only the dialogue. Do not read speaker names, brackets, or instructions aloud. Bracketed cues are silent, subtle performance directions that apply only to the line immediately following them. Do not exaggerate them. Keep the delivery conversational and preserve every spoken word exactly.\n\n${dialogue}`;
  }
  ctx.expose("buildTtsTranscript", buildTtsTranscript);
}
