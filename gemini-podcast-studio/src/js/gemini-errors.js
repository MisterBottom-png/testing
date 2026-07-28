export function installGeminiErrors(ctx) {
  function createApiError(status, message, details = '') { const error = new Error(message); error.status = status; error.details = details; return error; }
  ctx.expose("createApiError", createApiError);
  function mapError(error) {
      const status = Number(error?.status || 0);
      const message = String(error?.message || 'Unknown error.');
      if (status === 400)
          return { message, suggestion: 'Check the model IDs and generation settings.' };
      if (status === 401 || status === 403)
          return { message, suggestion: 'Verify the API key and confirm that Gemini API access is enabled.' };
      if (status === 429)
          return { message, suggestion: 'The key may have reached a quota or rate limit. Retry later.' };
      if (status >= 500)
          return { message, suggestion: 'The Gemini service may be temporarily unavailable.' };
      if (error instanceof TypeError && /fetch/i.test(message))
          return { message: 'The browser could not reach the Gemini API.', suggestion: 'Check the network or serve this file from localhost.' };
      return { message, suggestion: 'Review the technical details, adjust the request, and retry.' };
  }
  ctx.expose("mapError", mapError);
}
