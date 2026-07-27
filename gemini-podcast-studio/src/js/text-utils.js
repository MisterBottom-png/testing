export function installTextUtilities(services) {
  const LANGUAGE_LOCALES = Object.freeze({
    english: 'en',
    estonian: 'et',
    russian: 'ru',
    lithuanian: 'lt',
    german: 'de',
    french: 'fr',
    spanish: 'es'
  });
  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
  function normaliseWhitespace(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }
  function normalisePerformanceTag(value) {
    return normaliseWhitespace(value).replace(/^\[+|\]+$/g, '').slice(0, 80).trim();
  }
  function normaliseLanguageLocale(value = 'en') {
    const language = normaliseWhitespace(value).replaceAll('_', '-');
    if (!language) return 'en';
    const namedLocale = LANGUAGE_LOCALES[language.toLocaleLowerCase('en')];
    if (namedLocale) return namedLocale;
    if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) {
      try {
        return new Intl.Locale(language).baseName;
      } catch {
        return language.toLocaleLowerCase('en');
      }
    }
    return 'en';
  }
  function countWords(value, locale = 'en') {
    const text = normaliseWhitespace(value);
    if (!text) return 0;
    const resolvedLocale = normaliseLanguageLocale(locale);
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(resolvedLocale, { granularity: 'word' });
        return [...segmenter.segment(text)].filter(segment => segment.isWordLike).length;
      }
    } catch {
      // Fall through to the whitespace counter when a runtime rejects the locale.
    }
    return (text.match(/\S+/gu) || []).length;
  }
  function formatDuration(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  Object.assign(services, {
    LANGUAGE_LOCALES,
    deepClone,
    escapeHtml,
    normaliseWhitespace,
    normalisePerformanceTag,
    normaliseLanguageLocale,
    countWords,
    formatDuration,
    formatBytes
  });
  return services;
}
