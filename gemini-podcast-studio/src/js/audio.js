function base64ToBytes(base64) {
  const clean = String(base64 || '').replace(/\s/g, '');
  if (!clean) throw new Error('Gemini returned empty base64 audio.');
  let binary;
  try { binary = atob(clean); } catch { throw new Error('Gemini returned invalid base64 audio.'); }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
function writeAscii(view, offset, text) { [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0))); }
function pcm16ToWavBlob(pcmBytes, sampleRate = 24000, channels = 1) {
  const buffer = new ArrayBuffer(44 + pcmBytes.byteLength); const view = new DataView(buffer);
  const blockAlign = channels * 2; const byteRate = sampleRate * blockAlign;
  writeAscii(view, 0, 'RIFF'); view.setUint32(4, 36 + pcmBytes.byteLength, true); writeAscii(view, 8, 'WAVE'); writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true); writeAscii(view, 36, 'data'); view.setUint32(40, pcmBytes.byteLength, true);
  new Uint8Array(buffer, 44).set(pcmBytes); return new Blob([buffer], { type: 'audio/wav' });
}
function sampleRateFromMimeType(mimeType) { return Number(String(mimeType || '').match(/rate=(\d+)/i)?.[1]) || 24000; }
async function generatePodcastAudio() {
  if (!appState.script?.segments?.length) return;
  const transcript = buildTtsTranscript();
  if (transcript.length > appState.settings.maxTtsCharacters) return showServiceError({ title: 'Script is too long', message: `The TTS transcript contains ${transcript.length.toLocaleString('en-GB')} characters.`, suggestion: 'Shorten the script or increase the threshold in settings.', details: '', retry: null });
  if (appState.speakers.some(speaker => !getGeminiTtsVoice(speaker.geminiVoiceName))) return showServiceError({ title: 'Voice selection required', message: 'One or more saved Gemini voices are unavailable.', suggestion: 'Select an available Gemini voice for both speakers.', details: '', retry: null });
  hideServiceError(); revokeAudioUrl(); appState.lastAction = 'generate-audio'; setBusy(true, 'audio', AUDIO_PROGRESS_MESSAGES);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(getTtsModel())}:generateContent`;
  const startedAt = performance.now();
  const requestBody = { contents: [{ role: 'user', parts: [{ text: transcript }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: appState.speakers.map(speaker => ({ speaker: speaker.speakerName, voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.geminiVoiceName } } })) } } } };
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': appState.connection.apiKey }, body: JSON.stringify(requestBody) });
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw); } catch { throw createApiError(response.status, 'Gemini returned non-JSON audio response data.', raw); }
    if (!response.ok) throw createApiError(response.status, data?.error?.message || `Audio request failed with HTTP ${response.status}.`, JSON.stringify(data, null, 2));
    const audioPart = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []).find(part => part?.inlineData?.data);
    if (!audioPart) throw createApiError(response.status, 'Gemini returned no audio.', JSON.stringify(data, null, 2));
    const pcmBytes = base64ToBytes(audioPart.inlineData.data); const sampleRate = sampleRateFromMimeType(audioPart.inlineData.mimeType); const wavBlob = pcm16ToWavBlob(pcmBytes, sampleRate, 1);
    appState.audio = { blob: wavBlob, url: URL.createObjectURL(wavBlob), sampleRate, generationSeconds: (performance.now() - startedAt) / 1000, durationSeconds: pcmBytes.byteLength / (sampleRate * 2), createdAt: new Date().toISOString() };
    setStage('audio');
  } catch (error) {
    handleGenerationError(error, 'Audio generation failed', 'Try a shorter script or select a different TTS model.', generatePodcastAudio);
  } finally { setBusy(false); }
}
async function generateVoiceTest(index) {
  const speaker = appState.speakers[index];
  if (!appState.connection.apiKey.trim()) return showServiceError({ title: 'API key required', message: 'Add a Gemini API key before generating a voice test.', suggestion: 'Open connection settings.', details: '', retry: null });
  if (!getGeminiTtsVoice(speaker.geminiVoiceName)) return showServiceError({ title: 'Voice selection required', message: 'This saved Gemini voice is unavailable.', suggestion: 'Select an available Gemini voice.', details: '', retry: null });
  hideServiceError(); setBusy(true, 'voice', AUDIO_PROGRESS_MESSAGES);
  const prompt = `${speaker.deliveryInstructions || 'Speak naturally and clearly.'}\n${speaker.accent || ''}\nRead exactly: Hello, I am ${speaker.speakerName}. This is a short voice preview for the podcast.`;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(getTtsModel())}:generateContent`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': appState.connection.apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.geminiVoiceName } } } } }) });
    const data = await response.json();
    if (!response.ok) throw createApiError(response.status, data?.error?.message || 'Voice test failed.', JSON.stringify(data, null, 2));
    const part = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []).find(item => item?.inlineData?.data);
    if (!part) throw new Error('Gemini returned no voice-test audio.');
    const url = URL.createObjectURL(pcm16ToWavBlob(base64ToBytes(part.inlineData.data), sampleRateFromMimeType(part.inlineData.mimeType), 1));
    const audio = new Audio(url); audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true }); await audio.play();
  } catch (error) { handleGenerationError(error, 'Voice test failed', 'Try another voice or TTS model.', () => generateVoiceTest(index)); }
  finally { setBusy(false); }
}

function renderAudioStage() {
  if (!appState.audio.url || !appState.audio.blob) return;
  els.audioContent.innerHTML = `<article class="audio-card">
    <div class="audio-header"><div><p class="eyebrow">Generated episode</p><h2 id="audioStageTitle" tabindex="-1">${escapeHtml(appState.script?.title || 'Podcast')}</h2><p>${escapeHtml(appState.script?.summary || '')}</p></div></div>
    <div class="waveform-wrap"><canvas id="waveformCanvas" aria-label="Waveform for generated episode"></canvas><audio id="audioPlayer" controls preload="metadata" src="${escapeHtml(appState.audio.url)}"></audio></div>
    <div class="voice-chips">${appState.speakers.map((speaker, index) => `<span class="voice-chip"><b>${index ? 'B' : 'A'}</b>${escapeHtml(speaker.speakerName)} · ${escapeHtml(speaker.geminiVoiceName)}</span>`).join('')}</div>
    <div class="audio-meta">
      <div class="metric"><strong>${formatDuration(appState.audio.durationSeconds)}</strong><span>duration</span></div>
      <div class="metric"><strong>${formatBytes(appState.audio.blob.size)}</strong><span>file size</span></div>
      <div class="metric"><strong>${appState.audio.sampleRate.toLocaleString('en-GB')} Hz</strong><span>sample rate</span></div>
      <div class="metric"><strong>${appState.audio.generationSeconds.toFixed(1)} s</strong><span>generated in</span></div>
    </div>
    <div class="audio-actions">
      <button class="primary-button" type="button" data-audio-action="download">Download WAV</button>
      <button class="secondary-button" type="button" data-audio-action="regenerate">Regenerate</button>
      <button class="ghost-button" type="button" data-audio-action="script">Return to script</button>
      <button class="ghost-button" type="button" data-audio-action="copy">Copy transcript</button>
      <button class="ghost-button" type="button" data-audio-action="new">Start new podcast</button>
    </div>
  </article>`;
  requestAnimationFrame(() => drawWaveform(appState.audio.blob));
}
async function drawWaveform(blob) {
  const canvas = document.getElementById('waveformCanvas');
  if (!canvas || !blob) return;
  const ratio = Math.max(1, window.devicePixelRatio || 1); const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext('2d'); context.scale(ratio, ratio);
  try {
    const audioContext = new AudioContext(); const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer()); const data = audioBuffer.getChannelData(0);
    const bars = Math.max(60, Math.floor(rect.width / 5)); const step = Math.max(1, Math.floor(data.length / bars));
    context.clearRect(0, 0, rect.width, rect.height); context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(); context.lineWidth = 2; context.lineCap = 'round';
    for (let index = 0; index < bars; index += 1) {
      let peak = 0; for (let sample = 0; sample < step; sample += 1) peak = Math.max(peak, Math.abs(data[index * step + sample] || 0));
      const x = (index / Math.max(1, bars - 1)) * rect.width; const height = Math.max(3, peak * (rect.height - 16));
      context.beginPath(); context.moveTo(x, (rect.height - height) / 2); context.lineTo(x, (rect.height + height) / 2); context.stroke();
    }
    await audioContext.close();
  } catch {
    context.clearRect(0, 0, rect.width, rect.height); context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(); context.font = '14px system-ui'; context.fillText('Waveform unavailable. Native playback remains available.', 12, rect.height / 2);
  }
}
