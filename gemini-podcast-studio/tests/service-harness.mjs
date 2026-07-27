import { createRuntimeServices } from '../src/js/runtime.js';
import { installConstants } from '../src/js/constants.js';
import { installTextUtilities } from '../src/js/text-utils.js';
import { installAppHelpers } from '../src/js/app-helpers.js';
import { installPreferences } from '../src/js/preferences.js';
import { installConnectionUi } from '../src/js/ui-connection.js';
import { installCreateUi } from '../src/js/ui-create.js';
import { installScriptUi } from '../src/js/ui-script.js';
import { installScriptValidation } from '../src/js/script-validation.js';
import { installGeminiTransport } from '../src/js/gemini-api.js';
import { installScriptGeneration } from '../src/js/script-generation.js';
import { installPcmAudio } from '../src/js/pcm-audio.js';
import { installWavEncoder } from '../src/js/wav-encoder.js';
import { installTtsChunking } from '../src/js/tts-chunking.js';
import { installTtsTransport } from '../src/js/tts-generation.js';
import { installGenerationJobs } from '../src/js/generation-jobs.js';
import { installAudioUi } from '../src/js/ui-audio.js';
import { installStatusUi } from '../src/js/ui-status.js';
import { installIndexedDb } from '../src/js/indexeddb.js';
import { installMediaCache } from '../src/js/media-cache.js';
import { installVoicePreview } from '../src/js/voice-preview.js';
import { installConversationPreview } from '../src/js/conversation-preview.js';

export const installers = {
  constants: installConstants,
  textUtilities: installTextUtilities,
  appHelpers: installAppHelpers,
  preferences: installPreferences,
  connectionUi: installConnectionUi,
  createUi: installCreateUi,
  scriptUi: installScriptUi,
  scriptValidation: installScriptValidation,
  geminiTransport: installGeminiTransport,
  scriptGeneration: installScriptGeneration,
  pcmAudio: installPcmAudio,
  wavEncoder: installWavEncoder,
  ttsChunking: installTtsChunking,
  ttsTransport: installTtsTransport,
  generationJobs: installGenerationJobs,
  audioUi: installAudioUi,
  statusUi: installStatusUi,
  indexedDb: installIndexedDb,
  mediaCache: installMediaCache,
  voicePreview: installVoicePreview,
  conversationPreview: installConversationPreview
};

export function createServices(initial = {}) {
  return createRuntimeServices(initial);
}

export function installServices(services, names) {
  for (const name of names) installers[name](services);
  return services;
}

export async function withGlobals(overrides, callback) {
  const previous = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  try {
    return await callback();
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

export function createElementStub(overrides = {}) {
  return {
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    style: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return ''; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    scrollIntoView() {},
    appendChild() {},
    insertAdjacentHTML() {},
    showModal() {},
    close() {},
    load() {},
    pause() {},
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    parentElement: null,
    ...overrides
  };
}
