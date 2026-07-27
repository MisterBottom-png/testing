export function installWavEncoder(ctx) {
  function writeAscii(view, offset, text) { [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0))); }
  ctx.expose("writeAscii", writeAscii);
  function pcm16ToWavBlob(pcmBytes, sampleRate = 24000, channels = 1) {
      const buffer = new ArrayBuffer(44 + pcmBytes.byteLength);
      const view = new DataView(buffer);
      const blockAlign = channels * 2;
      const byteRate = sampleRate * blockAlign;
      writeAscii(view, 0, 'RIFF');
      view.setUint32(4, 36 + pcmBytes.byteLength, true);
      writeAscii(view, 8, 'WAVE');
      writeAscii(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);
      writeAscii(view, 36, 'data');
      view.setUint32(40, pcmBytes.byteLength, true);
      new Uint8Array(buffer, 44).set(pcmBytes);
      return new Blob([buffer], { type: 'audio/wav' });
  }
  ctx.expose("pcm16ToWavBlob", pcm16ToWavBlob);
}
