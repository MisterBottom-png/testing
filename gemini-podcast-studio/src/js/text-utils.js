export function installTextUtils(ctx) {
  function deepClone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  ctx.expose("deepClone", deepClone);
  function escapeHtml(value) {
      return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
  ctx.expose("escapeHtml", escapeHtml);
  function normaliseWhitespace(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
  ctx.expose("normaliseWhitespace", normaliseWhitespace);
  function normalisePerformanceTag(value) { return normaliseWhitespace(value).replace(/^\[+|\]+$/g, '').slice(0, 80).trim(); }
  ctx.expose("normalisePerformanceTag", normalisePerformanceTag);
  function formatDuration(seconds) {
      const safe = Math.max(0, Math.round(Number(seconds) || 0));
      return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }
  ctx.expose("formatDuration", formatDuration);
  function formatBytes(bytes) {
      if (bytes < 1024)
          return `${bytes} B`;
      if (bytes < 1024 * 1024)
          return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  ctx.expose("formatBytes", formatBytes);
  function getTextModel() { return ctx.appState.connection.textModel === 'custom' ? ctx.appState.connection.customTextModel.trim() : ctx.appState.connection.textModel; }
  ctx.expose("getTextModel", getTextModel);
  function getTtsModel() { return ctx.appState.connection.ttsModel === 'custom' ? ctx.appState.connection.customTtsModel.trim() : ctx.appState.connection.ttsModel; }
  ctx.expose("getTtsModel", getTtsModel);
  function getLanguage() { return ctx.appState.podcast.language === 'custom' ? ctx.appState.podcast.customLanguage.trim() : ctx.appState.podcast.language; }
  ctx.expose("getLanguage", getLanguage);
  function getPodcastFormat() { return ctx.appState.podcast.format === 'custom' ? ctx.appState.podcast.customFormat.trim() : ctx.appState.podcast.format; }
  ctx.expose("getPodcastFormat", getPodcastFormat);
  function getWordCount(script = ctx.appState.script) {
      return script?.segments?.reduce((total, segment) => total + (normaliseWhitespace(segment.text).match(/\S+/g) || []).length, 0) || 0;
  }
  ctx.expose("getWordCount", getWordCount);
  function getEstimatedSeconds(words = getWordCount()) { return (words / Math.max(1, ctx.appState.settings.speakingRate)) * 60; }
  ctx.expose("getEstimatedSeconds", getEstimatedSeconds);
  function getTargetWords() { return Math.round(ctx.appState.podcast.durationMinutes * ctx.appState.settings.speakingRate); }
  ctx.expose("getTargetWords", getTargetWords);
  function voiceDescription(name) { return ctx.getGeminiTtsVoice(name)?.description || ''; }
  ctx.expose("voiceDescription", voiceDescription);
  function buildEpisodeFilename(extension) {
      const base = normaliseWhitespace(ctx.appState.script?.title || 'gemini-podcast').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'gemini-podcast';
      return `${base}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  }
  ctx.expose("buildEpisodeFilename", buildEpisodeFilename);
  function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  ctx.expose("downloadBlob", downloadBlob);
  async function copyText(value, message = 'Copied to clipboard.') {
      await navigator.clipboard.writeText(value);
      announce(message);
  }
  ctx.expose("copyText", copyText);
  function announce(message) { ctx.els.liveStatus.textContent = ''; requestAnimationFrame(() => { ctx.els.liveStatus.textContent = message; }); }
  ctx.expose("announce", announce);
  function autoSize(textarea) { textarea.style.height = 'auto'; textarea.style.height = `${Math.max(92, textarea.scrollHeight)}px`; }
  ctx.expose("autoSize", autoSize);
  function revokeAudioUrl() {
      if (ctx.appState.audio.url)
          URL.revokeObjectURL(ctx.appState.audio.url);
      ctx.appState.audio = { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null };
  }
  ctx.expose("revokeAudioUrl", revokeAudioUrl);
}
