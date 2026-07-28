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
  function getLanguageLocale(language = getLanguage()) {
    return services.normaliseLanguageLocale(language);
  }
  function getPodcastFormat() {
    return services.appState.podcast.format === 'custom' ? services.appState.podcast.customFormat.trim() : services.appState.podcast.format;
  }
  function getWordCount(script = services.appState.script, locale = getLanguageLocale()) {
    return script?.segments?.reduce((total, segment) => total + services.countWords(segment?.text, locale), 0) || 0;
  }
  function getEstimatedSeconds(words = getWordCount()) {
    return words / Math.max(1, services.appState.settings.speakingRate) * 60;
  }
  function calculateTargetWords(durationMinutes = services.DEFAULT_DURATION_MINUTES, speakingRate = services.DEFAULT_SPEAKING_RATE) {
    const duration = Math.max(0, Number(durationMinutes) || 0);
    const rate = Math.max(1, Number(speakingRate) || services.DEFAULT_SPEAKING_RATE);
    return Math.round(duration * rate);
  }
  function getTargetWords() {
    return calculateTargetWords(services.appState.podcast.durationMinutes, services.appState.settings.speakingRate);
  }
  function calculateScriptOutputTokenLimit(targetWords = getTargetWords()) {
    const dynamicLimit = Math.ceil(Math.max(0, Number(targetWords) || 0) * services.SCRIPT_TOKENS_PER_TARGET_WORD);
    return Math.min(services.MAX_SCRIPT_OUTPUT_TOKENS, Math.max(services.MIN_SCRIPT_OUTPUT_TOKENS, dynamicLimit));
  }
  function getScriptOutputTokenLimit() {
    return calculateScriptOutputTokenLimit(getTargetWords());
  }
  function calculateMaxScriptSegments(durationMinutes = services.appState.podcast.durationMinutes) {
    const estimated = Math.ceil(Math.max(0, Number(durationMinutes) || 0) * services.SCRIPT_SEGMENTS_PER_MINUTE);
    return Math.min(services.MAX_SCRIPT_SEGMENTS, Math.max(services.MIN_SCRIPT_SEGMENTS, estimated));
  }
  function getMaxScriptSegments() {
    return calculateMaxScriptSegments(services.appState.podcast.durationMinutes);
  }
  function getScriptThinkingLevel(model = getTextModel()) {
    return model === services.DEFAULT_TEXT_MODEL ? 'minimal' : 'low';
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
    getLanguageLocale,
    getPodcastFormat,
    getWordCount,
    getEstimatedSeconds,
    calculateTargetWords,
    getTargetWords,
    calculateScriptOutputTokenLimit,
    getScriptOutputTokenLimit,
    calculateMaxScriptSegments,
    getMaxScriptSegments,
    getScriptThinkingLevel,
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
