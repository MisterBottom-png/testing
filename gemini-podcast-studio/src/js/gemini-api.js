export function installGeminiApi(ctx) {
  function stripJsonFence(value) { return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(); }
  ctx.expose("stripJsonFence", stripJsonFence);
  function extractTextResponse(data) { return (data?.candidates?.flatMap(candidate => candidate?.content?.parts || []) || []).map(part => part?.text || '').join('').trim(); }
  ctx.expose("extractTextResponse", extractTextResponse);
  async function callGeminiText({ prompt, schema, actionLabel }) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ctx.getTextModel())}:generateContent`;
      const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.appState.connection.apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } })
      });
      const raw = await response.text();
      let data;
      try {
          data = JSON.parse(raw);
      }
      catch {
          throw ctx.createApiError(response.status, `Gemini returned non-JSON data while ${actionLabel}.`, raw);
      }
      if (!response.ok)
          throw ctx.createApiError(response.status, data?.error?.message || `Gemini request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
      const text = extractTextResponse(data);
      if (!text)
          throw new Error('Gemini returned no script text.');
      try {
          return JSON.parse(stripJsonFence(text));
      }
      catch {
          throw new Error('Gemini returned script data that could not be parsed as JSON.');
      }
  }
  ctx.expose("callGeminiText", callGeminiText);
  async function requestTtsChunk(endpoint, transcript, speakerVoiceConfigs) {
      const requestBody = ctx.buildTtsRequestBody(transcript, speakerVoiceConfigs);
      const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ctx.appState.connection.apiKey },
          body: JSON.stringify(requestBody)
      });
      const raw = await response.text();
      let data;
      try {
          data = JSON.parse(raw);
      }
      catch {
          throw ctx.createApiError(response.status, 'Gemini returned non-JSON audio response data.', raw);
      }
      if (!response.ok)
          throw ctx.createApiError(response.status, data?.error?.message || `Audio request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
      const audioPart = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []).find(part => part?.inlineData?.data);
      if (!audioPart)
          throw ctx.createApiError(response.status, 'Gemini returned no audio.', JSON.stringify(data, null, 2));
      return {
          pcmBytes: ctx.base64ToBytes(audioPart.inlineData.data),
          sampleRate: ctx.sampleRateFromMimeType(audioPart.inlineData.mimeType)
      };
  }
  ctx.expose("requestTtsChunk", requestTtsChunk);
}
