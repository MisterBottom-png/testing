function deepClone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function normaliseWhitespace(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function normalisePerformanceTag(value) { return normaliseWhitespace(value).replace(/^\[+|\]+$/g, '').slice(0, 80).trim(); }
function formatDuration(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function getTextModel() { return appState.connection.textModel === 'custom' ? appState.connection.customTextModel.trim() : appState.connection.textModel; }
function getTtsModel() { return appState.connection.ttsModel === 'custom' ? appState.connection.customTtsModel.trim() : appState.connection.ttsModel; }
function getLanguage() { return appState.podcast.language === 'custom' ? appState.podcast.customLanguage.trim() : appState.podcast.language; }
function getPodcastFormat() { return appState.podcast.format === 'custom' ? appState.podcast.customFormat.trim() : appState.podcast.format; }
function getWordCount(script = appState.script) {
  return script?.segments?.reduce((total, segment) => total + (normaliseWhitespace(segment.text).match(/\S+/g) || []).length, 0) || 0;
}
function getEstimatedSeconds(words = getWordCount()) { return (words / Math.max(1, appState.settings.speakingRate)) * 60; }
function getTargetWords() { return Math.round(appState.podcast.durationMinutes * appState.settings.speakingRate); }
function voiceDescription(name) { return getGeminiTtsVoice(name)?.description || ''; }
function buildEpisodeFilename(extension) {
  const base = normaliseWhitespace(appState.script?.title || 'gemini-podcast').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'gemini-podcast';
  return `${base}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyText(value, message = 'Copied to clipboard.') {
  await navigator.clipboard.writeText(value);
  announce(message);
}
function announce(message) { els.liveStatus.textContent = ''; requestAnimationFrame(() => { els.liveStatus.textContent = message; }); }
function autoSize(textarea) { textarea.style.height = 'auto'; textarea.style.height = `${Math.max(92, textarea.scrollHeight)}px`; }
function revokeAudioUrl() {
  if (appState.audio.url) URL.revokeObjectURL(appState.audio.url);
  appState.audio = { blob: null, url: '', sampleRate: 24000, generationSeconds: 0, durationSeconds: 0, createdAt: null };
}
