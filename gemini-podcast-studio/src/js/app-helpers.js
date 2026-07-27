export function installAppHelpers(services) {
  function getTextModel() {
    return services.appState.connection.textModel === 'custom' ? services.appState.connection.customTextModel.trim() : services.appState.connection.textModel;
  }
  function getTtsModel() {
    return services.appState.connection.ttsModel === 'custom' ? services.appState.connection.customTtsModel.trim() : services.appState.connection.ttsModel;
  }
  function getLanguage() {
    return services.appState.podcast.language === 'custom' ? services.appState.podcast.customLanguage.trim() : services.appState.podcast.language;
  }
  function getPodcastFormat() {
    return services.appState.podcast.format === 'custom' ? services.appState.podcast.customFormat.trim() : services.appState.podcast.format;
  }
  function getWordCount(script = services.appState.script) {
    return script?.segments?.reduce((total, segment) => total + (services.normaliseWhitespace(segment.text).match(/\S+/g) || []).length, 0) || 0;
  }
  function getEstimatedSeconds(words = getWordCount()) {
    return words / Math.max(1, services.appState.settings.speakingRate) * 60;
  }
  function getTargetWords() {
    return Math.round(services.appState.podcast.durationMinutes * services.appState.settings.speakingRate);
  }
  function voiceDescription(name) {
    return services.getGeminiTtsVoice(name)?.description || '';
  }
  function buildEpisodeFilename(extension) {
    const base = services.normaliseWhitespace(services.appState.script?.title || 'gemini-podcast').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'gemini-podcast';
    return `${base}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: filename
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyText(value, message = 'Copied to clipboard.') {
    await navigator.clipboard.writeText(value);
    announce(message);
  }
  function announce(message) {
    services.els.liveStatus.textContent = '';
    requestAnimationFrame(() => {
      services.els.liveStatus.textContent = message;
    });
  }
  function autoSize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(92, textarea.scrollHeight)}px`;
  }
  function revokeAudioUrl() {
    if (services.appState.audio.url) URL.revokeObjectURL(services.appState.audio.url);
    services.appState.audio = {
      blob: null,
      url: '',
      sampleRate: 24000,
      generationSeconds: 0,
      durationSeconds: 0,
      createdAt: null
    };
  }
  Object.assign(services, {
    getTextModel,
    getTtsModel,
    getLanguage,
    getPodcastFormat,
    getWordCount,
    getEstimatedSeconds,
    getTargetWords,
    voiceDescription,
    buildEpisodeFilename,
    downloadBlob,
    copyText,
    announce,
    autoSize,
    revokeAudioUrl
  });
  return services;
}
