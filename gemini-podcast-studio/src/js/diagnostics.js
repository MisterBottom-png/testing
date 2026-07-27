export function installDiagnostics(ctx) {
  const DIAGNOSTIC_REDACTION = '[REDACTED]';
  ctx.expose("DIAGNOSTIC_REDACTION", DIAGNOSTIC_REDACTION);
  const DIAGNOSTIC_SENSITIVE_FIELD_PATTERN = /(?:api[-_ ]?key|x-goog-api-key|authorization|headers?|query|prompt|contents?|body|request(?:data)?|response(?:data)?|raw|inlineData|audioData)/i;
  ctx.expose("DIAGNOSTIC_SENSITIVE_FIELD_PATTERN", DIAGNOSTIC_SENSITIVE_FIELD_PATTERN);
  function redactDiagnosticString(value) {
      let result = String(value ?? '');
      const configuredKey = String(ctx.appState?.connection?.apiKey || '');
      if (configuredKey)
          result = result.split(configuredKey).join(DIAGNOSTIC_REDACTION);
      return result
          .replace(/([?&](?:key|api[_-]?key|x-goog-api-key)=)[^&#\s]+/gi, `$1${DIAGNOSTIC_REDACTION}`)
          .replace(/((?:x-goog-api-key|authorization|api[-_ ]?key)\s*[:=]\s*)[^\s,;}\]]+/gi, `$1${DIAGNOSTIC_REDACTION}`);
  }
  ctx.expose("redactDiagnosticString", redactDiagnosticString);
  function redactDiagnosticValue(value, seen = new WeakSet()) {
      if (typeof value === 'string')
          return redactDiagnosticString(value);
      if (value == null || typeof value !== 'object')
          return value;
      if (seen.has(value))
          return '[Circular]';
      seen.add(value);
      if (value instanceof Error) {
          return {
              name: redactDiagnosticString(value.name),
              message: redactDiagnosticString(value.message),
              status: Number(value.status || 0) || undefined,
              stack: redactDiagnosticString(value.stack || '')
          };
      }
      if (Array.isArray(value))
          return value.map(item => redactDiagnosticValue(item, seen));
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [
          key,
          DIAGNOSTIC_SENSITIVE_FIELD_PATTERN.test(key) ? DIAGNOSTIC_REDACTION : redactDiagnosticValue(item, seen)
      ]));
  }
  ctx.expose("redactDiagnosticValue", redactDiagnosticValue);
  function diagnosticLog(level, event, details = null) {
      const method = ['error', 'warn', 'info'].includes(level) ? level : 'log';
      const payload = { event: redactDiagnosticString(event), details: redactDiagnosticValue(details) };
      console[method]('[Gemini Podcast Studio]', payload);
      return payload;
  }
  ctx.expose("diagnosticLog", diagnosticLog);
}
