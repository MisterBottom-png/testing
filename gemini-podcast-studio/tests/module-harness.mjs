import { createAppContext } from '../src/js/app-context.js';
import { installConstants } from '../src/js/constants.js';
import { installState } from '../src/js/state.js';
import { installTextUtils } from '../src/js/text-utils.js';
import { installPreferences } from '../src/js/preferences.js';
import { installPcmAudio } from '../src/js/pcm-audio.js';
import { installWavEncoder } from '../src/js/wav-encoder.js';
import { installDiagnostics } from '../src/js/diagnostics.js';
import { installGeminiErrors } from '../src/js/gemini-errors.js';
import { installUiConnection } from '../src/js/ui-connection.js';
import { installUiCreate } from '../src/js/ui-create.js';
import { installUiScript } from '../src/js/ui-script.js';
import { installScriptValidation } from '../src/js/script-validation.js';
import { installGeminiApi } from '../src/js/gemini-api.js';
import { installTtsChunking } from '../src/js/tts-chunking.js';
import { installTtsGeneration } from '../src/js/tts-generation.js';
import { installUiAudio } from '../src/js/ui-audio.js';
import { installUiStatus } from '../src/js/ui-status.js';
import { installScriptGeneration } from '../src/js/script-generation.js';
import { installUiEvents } from '../src/js/ui-events.js';
import { installIndexeddb } from '../src/js/indexeddb.js';
import { installMediaCache } from '../src/js/media-cache.js';
import { installVoicePreview } from '../src/js/voice-preview.js';
import { installConversationPreview } from '../src/js/conversation-preview.js';
import { installFinalReview } from '../src/js/final-review.js';

const installers = {
  constants: installConstants,
  state: installState,
  'text-utils': installTextUtils,
  preferences: installPreferences,
  'pcm-audio': installPcmAudio,
  'wav-encoder': installWavEncoder,
  diagnostics: installDiagnostics,
  'gemini-errors': installGeminiErrors,
  'ui-connection': installUiConnection,
  'ui-create': installUiCreate,
  'ui-script': installUiScript,
  'script-validation': installScriptValidation,
  'gemini-api': installGeminiApi,
  'tts-chunking': installTtsChunking,
  'tts-generation': installTtsGeneration,
  'ui-audio': installUiAudio,
  'ui-status': installUiStatus,
  'script-generation': installScriptGeneration,
  'ui-events': installUiEvents,
  indexeddb: installIndexeddb,
  'media-cache': installMediaCache,
  'voice-preview': installVoicePreview,
  'conversation-preview': installConversationPreview,
  'final-review': installFinalReview
};

export function createModuleContext(moduleNames, seed = {}) {
  const context = createAppContext();
  for (const [name, value] of Object.entries(seed)) context.expose(name, value);
  for (const moduleName of moduleNames) {
    const installer = installers[moduleName];
    if (!installer) throw new Error(`Unknown test module: ${moduleName}`);
    installer(context);
  }
  return context;
}
