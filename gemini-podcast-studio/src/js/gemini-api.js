export function installGeminiTransport(services) {
  const SAFETY_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE', 'IMAGE_SAFETY']);
  function stripJsonFence(value) {
    return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  function extractTextResponse(data, candidate = data?.candidates?.[0]) {
    return (candidate?.content?.parts || []).map(part => part?.text || '').join('').trim();
  }
  function createGeminiResponseError(code, message, details = '') {
    const error = new Error(message);
    error.code = code;
    error.details = details || message;
    return error;
  }
  function getFinishReason(candidate) {
    return String(candidate?.finishReason || '').trim().toUpperCase();
  }
  function getFirstCandidate(data) {
    const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
    if (candidate) return candidate;
    const blockReason = String(data?.promptFeedback?.blockReason || '').trim().toUpperCase();
    if (blockReason) throw createGeminiResponseError('GEMINI_SAFETY_REJECTION', `Gemini rejected the prompt before producing a candidate (${blockReason}).`, JSON.stringify(data, null, 2));
    throw createGeminiResponseError('GEMINI_MISSING_CANDIDATE', 'Gemini returned no response candidate.', JSON.stringify(data, null, 2));
  }
  function assertUsableFinishReason(candidate, data) {
    const finishReason = getFinishReason(candidate);
    if (finishReason === 'MAX_TOKENS') throw createGeminiResponseError('GEMINI_TOKEN_TRUNCATION', 'Gemini stopped because the script reached the output-token limit.', JSON.stringify(data, null, 2));
    if (SAFETY_FINISH_REASONS.has(finishReason)) throw createGeminiResponseError('GEMINI_SAFETY_REJECTION', `Gemini rejected the generated candidate (${finishReason}).`, JSON.stringify(data, null, 2));
    if (finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(finishReason)) throw createGeminiResponseError('GEMINI_FINISH_REASON', `Gemini stopped with finish reason ${finishReason}.`, JSON.stringify(data, null, 2));
    return finishReason;
  }
  function buildScriptGenerationConfig({
    schema,
    maxOutputTokens = services.getScriptOutputTokenLimit(),
    thinkingLevel = services.getScriptThinkingLevel()
  } = {}) {
    return {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      maxOutputTokens: Math.min(services.MAX_SCRIPT_OUTPUT_TOKENS, Math.max(services.MIN_SCRIPT_OUTPUT_TOKENS, Math.round(Number(maxOutputTokens) || services.getScriptOutputTokenLimit()))),
      thinkingConfig: { thinkingLevel }
    };
  }
  async function callGeminiText({ prompt, schema, actionLabel, maxOutputTokens, thinkingLevel }) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(services.getTextModel())}:generateContent`;
    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: buildScriptGenerationConfig({ schema, maxOutputTokens, thinkingLevel })
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': services.appState.connection.apiKey
      },
      body: JSON.stringify(requestBody)
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw services.createApiError(response.status, `Gemini returned non-JSON data while ${actionLabel}.`, raw);
    }
    if (!response.ok) throw services.createApiError(response.status, data?.error?.message || `Gemini request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
    const candidate = getFirstCandidate(data);
    assertUsableFinishReason(candidate, data);
    const text = extractTextResponse(data, candidate);
    if (!text) throw createGeminiResponseError('GEMINI_EMPTY_CANDIDATE', 'Gemini returned an empty response candidate.', JSON.stringify(data, null, 2));
    try {
      return JSON.parse(stripJsonFence(text));
    } catch {
      throw createGeminiResponseError('GEMINI_MALFORMED_JSON', 'Gemini returned malformed script JSON.', text);
    }
  }
  async function generateStructuredScript({ validate = null, ...options } = {}) {
    const parsed = await callGeminiText(options);
    return typeof validate === 'function' ? validate(parsed) : parsed;
  }
  async function testGeminiConnection() {
    return generateStructuredScript({
      prompt: 'Return a JSON object with exactly one field named status whose value is ok.',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { status: { type: 'string' } },
        required: ['status']
      },
      actionLabel: 'testing the Gemini connection'
    });
  }
  Object.assign(services, {
    SAFETY_FINISH_REASONS,
    stripJsonFence,
    extractTextResponse,
    createGeminiResponseError,
    getFinishReason,
    getFirstCandidate,
    assertUsableFinishReason,
    buildScriptGenerationConfig,
    callGeminiText,
    generateStructuredScript,
    testGeminiConnection
  });
  return services;
}
