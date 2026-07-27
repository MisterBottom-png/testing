export function installGeminiTransport(services) {
  function stripJsonFence(value) {
    return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  function extractTextResponse(data) {
    return (data?.candidates?.flatMap(candidate => candidate?.content?.parts || []) || []).map(part => part?.text || '').join('').trim();
  }
  async function callGeminiText({
    prompt,
    schema,
    actionLabel
  }) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(services.getTextModel())}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': services.appState.connection.apiKey
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      })
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw services.createApiError(response.status, `Gemini returned non-JSON data while ${actionLabel}.`, raw);
    }
    if (!response.ok) throw services.createApiError(response.status, data?.error?.message || `Gemini request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
    const text = extractTextResponse(data);
    if (!text) throw new Error('Gemini returned no script text.');
    try {
      return JSON.parse(stripJsonFence(text));
    } catch {
      throw new Error('Gemini returned script data that could not be parsed as JSON.');
    }
  }
  Object.assign(services, {
    stripJsonFence,
    extractTextResponse,
    callGeminiText
  });
  return services;
}
