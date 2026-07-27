export function installTextUtilities(services) {
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
    deepClone,
    escapeHtml,
    normaliseWhitespace,
    normalisePerformanceTag,
    formatDuration,
    formatBytes
  });
  return services;
}
