export function installTtsTransport(services) {
  function buildSpeakerVoiceConfigs(speakers = services.appState.speakers) {
    return (Array.isArray(speakers) ? speakers : []).map(speaker => ({
      speaker: services.normaliseWhitespace(speaker.speakerName),
      voiceConfig: { prebuiltVoiceConfig: { voiceName: services.normaliseWhitespace(speaker.geminiVoiceName) } }
    }));
  }
  function getSpeakerVoiceMappingSignature(speakers = services.appState.speakers) {
    return JSON.stringify((Array.isArray(speakers) ? speakers : []).map(speaker => ({
      id: speaker.id,
      speakerName: services.normaliseWhitespace(speaker.speakerName),
      geminiVoiceName: services.normaliseWhitespace(speaker.geminiVoiceName)
    })));
  }
  function buildTtsRequestBody(transcript, speakerVoiceConfigs) {
    return {
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: services.deepClone(speakerVoiceConfigs) } }
      }
    };
  }
  async function requestTtsChunk(endpoint, transcript, speakerVoiceConfigs) {
    const requestBody = buildTtsRequestBody(transcript, speakerVoiceConfigs);
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
      throw services.createApiError(response.status, 'Gemini returned non-JSON audio response data.', raw);
    }
    if (!response.ok) throw services.createApiError(response.status, data?.error?.message || `Audio request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
    return services.parseGeminiAudioResponse(data);
  }
  async function generateTtsPcm({ transcript, speakerVoiceConfigs = buildSpeakerVoiceConfigs() } = {}) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(services.getTtsModel())}:generateContent`;
    return requestTtsChunk(endpoint, transcript, speakerVoiceConfigs);
  }
  Object.assign(services, {
    buildSpeakerVoiceConfigs,
    getSpeakerVoiceMappingSignature,
    buildTtsRequestBody,
    requestTtsChunk,
    generateTtsPcm
  });
  return services;
}
