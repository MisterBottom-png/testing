export function installUiAudio(ctx) {
  function renderAudioStage() {
      if (!ctx.appState.audio.url || !ctx.appState.audio.blob)
          return;
      ctx.els.audioContent.innerHTML = `<article class="audio-card">
      <div class="audio-header"><div><p class="eyebrow">Generated episode</p><h2 id="audioStageTitle" tabindex="-1">${ctx.escapeHtml(ctx.appState.script?.title || 'Podcast')}</h2><p>${ctx.escapeHtml(ctx.appState.script?.summary || '')}</p></div></div>
      <div class="waveform-wrap"><canvas id="waveformCanvas" aria-label="Waveform for generated episode"></canvas><audio id="audioPlayer" controls preload="metadata" src="${ctx.escapeHtml(ctx.appState.audio.url)}"></audio></div>
      <div class="voice-chips">${ctx.appState.speakers.map((speaker, index) => `<span class="voice-chip"><b>${index ? 'B' : 'A'}</b>${ctx.escapeHtml(speaker.speakerName)} · ${ctx.escapeHtml(speaker.geminiVoiceName)}</span>`).join('')}</div>
      <div class="audio-meta">
        <div class="metric"><strong>${ctx.formatDuration(ctx.appState.audio.durationSeconds)}</strong><span>duration</span></div>
        <div class="metric"><strong>${ctx.formatBytes(ctx.appState.audio.blob.size)}</strong><span>file size</span></div>
        <div class="metric"><strong>${ctx.appState.audio.sampleRate.toLocaleString('en-GB')} Hz</strong><span>sample rate</span></div>
        <div class="metric"><strong>${ctx.appState.audio.generationSeconds.toFixed(1)} s</strong><span>generated in</span></div>
      </div>
      <div class="audio-actions">
        <button class="primary-button" type="button" data-audio-action="download">Download WAV</button>
        <button class="secondary-button" type="button" data-audio-action="regenerate">Regenerate</button>
        <button class="ghost-button" type="button" data-audio-action="script">Return to script</button>
        <button class="ghost-button" type="button" data-audio-action="copy">Copy transcript</button>
        <button class="ghost-button" type="button" data-audio-action="new">Start new podcast</button>
      </div>
    </article>`;
      requestAnimationFrame(() => drawWaveform(ctx.appState.audio.blob));
  }
  ctx.expose("renderAudioStage", renderAudioStage);
  async function drawWaveform(blob) {
      const canvas = document.getElementById('waveformCanvas');
      if (!canvas || !blob)
          return;
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const context = canvas.getContext('2d');
      context.scale(ratio, ratio);
      try {
          const audioContext = new AudioContext();
          const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
          const data = audioBuffer.getChannelData(0);
          const bars = Math.max(60, Math.floor(rect.width / 5));
          const step = Math.max(1, Math.floor(data.length / bars));
          context.clearRect(0, 0, rect.width, rect.height);
          context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
          context.lineWidth = 2;
          context.lineCap = 'round';
          for (let index = 0; index < bars; index += 1) {
              let peak = 0;
              for (let sample = 0; sample < step; sample += 1)
                  peak = Math.max(peak, Math.abs(data[index * step + sample] || 0));
              const x = (index / Math.max(1, bars - 1)) * rect.width;
              const height = Math.max(3, peak * (rect.height - 16));
              context.beginPath();
              context.moveTo(x, (rect.height - height) / 2);
              context.lineTo(x, (rect.height + height) / 2);
              context.stroke();
          }
          await audioContext.close();
      }
      catch {
          context.clearRect(0, 0, rect.width, rect.height);
          context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
          context.font = '14px system-ui';
          context.fillText('Waveform unavailable. Native playback remains available.', 12, rect.height / 2);
      }
  }
  ctx.expose("drawWaveform", drawWaveform);
}
