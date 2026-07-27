export function installPcmAudio(ctx) {
  function base64ToBytes(base64) {
      const clean = String(base64 || '').replace(/\s/g, '');
      if (!clean)
          throw new Error('Gemini returned empty base64 audio.');
      let binary;
      try {
          binary = atob(clean);
      }
      catch {
          throw new Error('Gemini returned invalid base64 audio.');
      }
      return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  ctx.expose("base64ToBytes", base64ToBytes);
  function sampleRateFromMimeType(mimeType) { return Number(String(mimeType || '').match(/rate=(\d+)/i)?.[1]) || 24000; }
  ctx.expose("sampleRateFromMimeType", sampleRateFromMimeType);
  function concatPcmBytes(parts) {
      const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      parts.forEach(part => { combined.set(part, offset); offset += part.byteLength; });
      return combined;
  }
  ctx.expose("concatPcmBytes", concatPcmBytes);
}
