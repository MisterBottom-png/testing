import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startStandaloneServer } from './serve-dist.mjs';
import { STABLE_OUTPUT_FILENAME, verifySingleFile } from './verify-single-file.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(projectRoot, 'dist', STABLE_OUTPUT_FILENAME);
const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const smokeApiKey = 'runtime-smoke-key';
const storageKey = 'geminiPodcastStudio.preferences.v2';
const directFileExplanation = 'Chromium restricted this capability for the file:// origin. The generated HTML is still standalone; open it through npm run preview or any static HTTP server when this browser policy applies.';


export function classifyNavigationRestriction(errorText, mode) {
  if (!/ERR_BLOCKED_BY_ADMINISTRATOR/i.test(String(errorText || ''))) return null;
  const subject = mode === 'http' ? 'the local HTTP server' : 'the direct file:// document';
  return {
    name: 'Browser navigation',
    status: 'limited',
    details: `Chromium administrator policy blocked navigation to ${subject} before the application could load. This is a managed-browser environment limitation, not an application runtime failure.`
  };
}

export async function verifyHttpDelivery(url, expectedBytes) {
  const expected = expectedBytes ?? await readFile(outputPath);
  const response = await fetch(url);
  const receivedBytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) throw new Error(`Standalone HTTP server returned HTTP ${response.status}.`);
  if (!/^text\/html\b/i.test(contentType)) throw new Error(`Standalone HTTP server returned unexpected content type: ${contentType || '(missing)'}.`);
  if (!receivedBytes.equals(Buffer.from(expected))) throw new Error('Standalone HTTP server did not return the exact generated HTML bytes.');
  return {
    statusCode: response.status,
    contentType,
    sizeBytes: receivedBytes.length,
    exactBytes: true
  };
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function removeDirectoryWithRetries(directory, {
  remove = rm,
  attempts = 5,
  delayMs = 100
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      const retryable = ['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code);
      if (!retryable || attempt === attempts) throw error;
      await delay(delayMs);
    }
  }
  throw lastError;
}

export function classifyPreferencePersistence({ mode, persistedTopic, savedTopic, restoredTopic }) {
  const details = JSON.stringify({ savedTopic, restoredTopic });
  if (savedTopic !== persistedTopic) {
    return { name: 'Preference persistence', status: 'fail', details };
  }
  if (restoredTopic === persistedTopic) {
    return { name: 'Preference persistence', status: 'pass', details };
  }
  if (mode === 'file') {
    return {
      name: 'Preference persistence',
      status: 'limited',
      details: `The preference was written to localStorage, but this Chromium build did not retain the file:// origin across reload. Use the generated file through a local HTTP server when persistent preferences are required. ${details}`
    };
  }
  return { name: 'Preference persistence', status: 'fail', details };
}

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForChrome(port, child, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Chromium exited before remote debugging became available with code ${child.exitCode}.`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Timed out waiting for Chromium remote debugging.');
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket failed to open.')), { once: true });
    });
    this.socket.addEventListener('message', event => void this.#handleMessage(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools WebSocket closed.'));
      this.pending.clear();
    });
  }

  async #handleMessage(data) {
    const text = typeof data === 'string' ? data : Buffer.from(await data.arrayBuffer()).toString('utf8');
    const message = JSON.parse(text);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      try {
        await listener(message.params ?? {});
      } catch (error) {
        console.error(`CDP event handler failed for ${message.method}: ${error.message}`);
      }
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

function pcmFixtureBase64({ sampleRate = 24_000, seconds = 0.6, frequency = 440 } = {}) {
  const samples = Math.floor(sampleRate * seconds);
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(Math.sin(index / sampleRate * Math.PI * 2 * frequency) * 0.18 * 32767);
    pcm.writeInt16LE(sample, index * 2);
  }
  return pcm.toString('base64');
}

function responseBody(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function scriptGeminiResponse() {
  const script = {
    title: 'Runtime Smoke Episode',
    summary: 'A deterministic browser verification episode.',
    language: 'English',
    estimatedWords: 18,
    segments: [
      { speaker: 'Host 1', direction: '', text: 'This is the first runtime smoke segment.' },
      { speaker: 'Host 2', direction: '', text: 'This is the second runtime smoke segment.' }
    ]
  };
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(script) }] } }]
  };
}

function ttsGeminiResponse() {
  return {
    candidates: [{
      content: {
        parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000;channels=1', data: pcmFixtureBase64() } }]
      }
    }]
  };
}

async function launchChromium() {
  const port = await freePort();
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'gemini-chromium-profile-'));
  const stderr = [];
  const child = spawn(chromiumPath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files',
    '--remote-allow-origins=*', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDirectory}`, '--window-size=1280,1000', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => stderr.push(chunk));
  await waitForChrome(port, child);
  return {
    port,
    child,
    stderr,
    async close() {
      if (child.exitCode == null) child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        delay(2_000).then(() => child.exitCode == null && child.kill('SIGKILL'))
      ]);
      try {
        await removeDirectoryWithRetries(profileDirectory);
      } catch (error) {
        console.warn(`Unable to remove Chromium profile directory after retries: ${error.message}`);
      }
    }
  };
}

async function createPageClient(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to create Chromium page target: HTTP ${response.status}`);
  const target = await response.json();
  return new CdpClient(target.webSocketDebuggerUrl);
}

async function evaluate(client, expression, options = {}) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise ?? true,
    returnByValue: true,
    userGesture: options.userGesture ?? false
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Page evaluation failed.';
    throw new Error(description);
  }
  return response.result?.value;
}

async function waitForPageCondition(client, expression, timeoutMs = 12_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(client, `Boolean(${expression})`)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for page condition: ${expression}${lastError ? ` (${lastError.message})` : ''}`);
}

async function waitForNodeCondition(predicate, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Timed out waiting for runtime smoke condition.');
}

function check(results, name, passed, details = '') {
  results.push({ name, status: passed ? 'pass' : 'fail', details });
}

function limitation(results, name, error) {
  results.push({ name, status: 'limited', details: `${error?.message || error}. ${directFileExplanation}` });
}

function requestHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

async function configureGeminiInterception(client, capturedRequests) {
  await client.send('Fetch.enable', {
    patterns: [{ urlPattern: 'https://generativelanguage.googleapis.com/*', requestStage: 'Request' }]
  });
  client.on('Fetch.requestPaused', async event => {
    const request = event.request ?? {};
    if (!request.url?.startsWith('https://generativelanguage.googleapis.com/')) {
      await client.send('Fetch.continueRequest', { requestId: event.requestId });
      return;
    }
    const corsHeaders = [
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
      { name: 'Access-Control-Allow-Headers', value: 'content-type, x-goog-api-key' },
      { name: 'Cache-Control', value: 'no-store' }
    ];
    if (request.method === 'OPTIONS') {
      await client.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 204, responseHeaders: corsHeaders });
      return;
    }
    let parsedBody = {};
    try {
      parsedBody = JSON.parse(request.postData || '{}');
    } catch {}
    const isAudio = parsedBody?.generationConfig?.responseModalities?.includes('AUDIO');
    capturedRequests.push({
      kind: isAudio ? 'tts' : 'script',
      url: request.url,
      method: request.method,
      headers: requestHeaders(request.headers),
      body: parsedBody
    });
    await client.send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, ...corsHeaders],
      body: responseBody(isAudio ? ttsGeminiResponse() : scriptGeminiResponse())
    });
  });
}

async function indexedDbCheck(client, databaseName) {
  return evaluate(client, `(async () => {
    if (!('indexedDB' in globalThis)) throw new Error('IndexedDB is unavailable in this browser context.');
    const name = ${JSON.stringify(databaseName)};
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('values', 'readwrite');
        transaction.objectStore('values').put('available', 'status');
        transaction.oncomplete = () => {
          const readTransaction = database.transaction('values', 'readonly');
          const getRequest = readTransaction.objectStore('values').get('status');
          getRequest.onerror = () => reject(getRequest.error || new Error('IndexedDB read failed.'));
          getRequest.onsuccess = () => {
            const value = getRequest.result;
            database.close();
            const deletion = indexedDB.deleteDatabase(name);
            deletion.onsuccess = () => value === 'available' ? resolve(true) : reject(new Error('IndexedDB value mismatch.'));
            deletion.onerror = () => reject(deletion.error || new Error('IndexedDB cleanup failed.'));
          };
        };
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB write failed.'));
      };
    });
    return true;
  })()`);
}

async function configureEpisode(client, topic) {
  return evaluate(client, `(() => {
    const dispatch = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
    const setValue = (id, value, type = 'input') => {
      const node = document.getElementById(id);
      if (!node) throw new Error('Missing control ' + id);
      node.value = value;
      dispatch(node, type);
    };
    const choose = id => {
      const node = document.getElementById(id);
      if (!node) throw new Error('Missing choice ' + id);
      node.checked = true;
      dispatch(node, 'change');
    };
    setValue('setupApiKey', ${JSON.stringify(smokeApiKey)}, 'change');
    setValue('topic', ${JSON.stringify(topic)}, 'input');
    choose('speakerGenderFemale0');
    setValue('speakerVoiceType0', 'bright', 'change');
    setValue('speakerVoice0', 'Zephyr', 'change');
    choose('speakerGenderMale1');
    setValue('speakerVoiceType1', 'upbeat', 'change');
    setValue('speakerVoice1', 'Puck', 'change');
    return {
      connected: document.getElementById('connectionLabel')?.textContent,
      firstVoice: document.getElementById('speakerVoice0')?.value,
      secondVoice: document.getElementById('speakerVoice1')?.value
    };
  })()`, { userGesture: true });
}

async function downloadedWav(downloadDirectory) {
  const filename = await waitForNodeCondition(async () => {
    const names = await readdir(downloadDirectory).catch(() => []);
    return names.find(name => name.endsWith('.wav') && !name.endsWith('.crdownload')) || null;
  });
  const filePath = path.join(downloadDirectory, filename);
  const bytes = await readFile(filePath);
  return {
    filename,
    sizeBytes: bytes.length,
    riff: bytes.subarray(0, 4).toString('ascii'),
    wave: bytes.subarray(8, 12).toString('ascii')
  };
}

async function runMode({ mode, url }) {
  const results = [];
  const capturedRequests = [];
  const exceptions = [];
  const consoleErrors = [];
  const downloadDirectory = await mkdtemp(path.join(os.tmpdir(), `gemini-download-${mode}-`));
  const chrome = await launchChromium();
  const client = await createPageClient(chrome.port);
  try {
    client.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'Unknown page exception'));
    client.on('Runtime.consoleAPICalled', event => {
      if (event.type === 'error') consoleErrors.push((event.args || []).map(argument => argument.value ?? argument.description ?? '').join(' '));
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });
    await configureGeminiInterception(client, capturedRequests);
    const navigation = await client.send('Page.navigate', { url });
    const navigationRestriction = classifyNavigationRestriction(navigation.errorText, mode);
    if (navigationRestriction) {
      results.push(navigationRestriction);
      return { mode, url, results, capturedRequests: [], navigationError: navigation.errorText };
    }
    if (navigation.errorText) throw new Error(`Chromium navigation failed: ${navigation.errorText}`);
    try {
      await waitForPageCondition(client, `document.readyState === 'complete' && document.querySelectorAll('#speakerList article').length === 2`);
    } catch (error) {
      const snapshot = await evaluate(client, `({
        href: location.href,
        readyState: document.readyState,
        title: document.title,
        bodyLength: document.body?.innerHTML?.length || 0,
        root: Boolean(document.querySelector('main.app-shell')),
        speakerCards: document.querySelectorAll('#speakerList article').length,
        speakerListLength: document.getElementById('speakerList')?.innerHTML?.length || 0
      })`).catch(snapshotError => ({ snapshotError: snapshotError.message }));
      throw new Error(`${error.message}; navigation=${JSON.stringify(navigation)}; snapshot=${JSON.stringify(snapshot)}; exceptions=${JSON.stringify(exceptions)}; consoleErrors=${JSON.stringify(consoleErrors)}`);
    }

    const startup = await evaluate(client, `({
      title: document.title,
      root: Boolean(document.querySelector('main.app-shell')),
      stages: ['createStage','scriptStage','audioStage'].every(id => Boolean(document.getElementById(id))),
      speakerCards: document.querySelectorAll('#speakerList article').length,
      settingsIcon: Boolean(document.querySelector('#settingsButton svg.icon')),
      activeStage: document.querySelector('.stage.active')?.id || ''
    })`);
    check(results, 'Application startup', startup.root && startup.stages && startup.activeStage === 'createStage', JSON.stringify(startup));
    check(results, 'UI rendering', startup.title === 'Gemini Podcast Studio' && startup.speakerCards === 2 && startup.settingsIcon, JSON.stringify(startup));

    const persistedTopic = `Runtime persistence ${mode}`;
    try {
      const saved = await evaluate(client, `(async () => {
        const input = document.getElementById('topic');
        input.value = ${JSON.stringify(persistedTopic)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 420));
        const project = JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}) || '{}');
        return { storedTopic: project.topic, saveState: document.getElementById('saveState')?.textContent };
      })()`);
      await client.send('Page.reload', { ignoreCache: true });
      await waitForPageCondition(client, `document.readyState === 'complete' && document.querySelectorAll('#speakerList article').length === 2`);
      const restored = await evaluate(client, `document.getElementById('topic')?.value`);
      results.push(classifyPreferencePersistence({
        mode,
        persistedTopic,
        savedTopic: saved.storedTopic,
        restoredTopic: restored
      }));
    } catch (error) {
      if (mode === 'file') limitation(results, 'Preference persistence', error); else check(results, 'Preference persistence', false, error.message);
    }

    try {
      const available = await indexedDbCheck(client, `gemini-runtime-smoke-${mode}-${Date.now()}`);
      check(results, 'IndexedDB access', available === true);
    } catch (error) {
      if (mode === 'file') limitation(results, 'IndexedDB access', error); else check(results, 'IndexedDB access', false, error.message);
    }

    const topic = `Standalone request construction ${mode}`;
    const configured = await configureEpisode(client, topic);
    check(results, 'Speaker and connection setup', configured.connected === 'Gemini connected' && configured.firstVoice === 'Zephyr' && configured.secondVoice === 'Puck', JSON.stringify(configured));
    await evaluate(client, `document.getElementById('createForm').requestSubmit()`, { userGesture: true });
    const scriptRequest = await waitForNodeCondition(() => capturedRequests.find(request => request.kind === 'script'));
    await waitForPageCondition(client, `document.getElementById('scriptStage')?.classList.contains('active') && document.querySelectorAll('#scriptPanel textarea[data-segment-field="text"]').length >= 2`);
    const scriptBody = scriptRequest.body;
    const scriptPrompt = scriptBody?.contents?.[0]?.parts?.[0]?.text || '';
    const requestPass = scriptRequest.method === 'POST'
      && /gemini-3\.6-flash:generateContent/.test(scriptRequest.url)
      && scriptRequest.headers['x-goog-api-key'] === smokeApiKey
      && scriptBody?.generationConfig?.responseMimeType === 'application/json'
      && scriptPrompt.includes(topic)
      && scriptPrompt.includes('Host 1')
      && scriptPrompt.includes('Host 2');
    check(results, 'Existing Gemini request construction', requestPass, JSON.stringify({ url: scriptRequest.url, method: scriptRequest.method, headers: scriptRequest.headers, generationConfig: scriptBody?.generationConfig }));

    const editedText = `Edited through the ${mode} runtime smoke test.`;
    try {
      const edited = await evaluate(client, `(async () => {
        const textarea = document.querySelector('#scriptPanel textarea[data-segment-field="text"]');
        if (!textarea) throw new Error('Script editor textarea is unavailable.');
        textarea.value = ${JSON.stringify(editedText)};
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 420));
        const project = JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}) || '{}');
        return { domText: textarea.value, storedText: project.script?.segments?.[0]?.text || '' };
      })()`);
      check(results, 'Script editing', edited.domText === editedText && edited.storedText === editedText, JSON.stringify(edited));
    } catch (error) {
      if (mode === 'file') limitation(results, 'Script editing', error); else check(results, 'Script editing', false, error.message);
    }

    await evaluate(client, `document.getElementById('generateAudioButton').click()`, { userGesture: true });
    const ttsRequest = await waitForNodeCondition(() => capturedRequests.find(request => request.kind === 'tts'));
    await waitForPageCondition(client, `document.getElementById('audioStage')?.classList.contains('active') && Boolean(document.getElementById('audioPlayer'))`);
    const speakerConfigs = ttsRequest.body?.generationConfig?.speechConfig?.multiSpeakerVoiceConfig?.speakerVoiceConfigs || [];
    check(results, 'TTS request construction',
      ttsRequest.body?.generationConfig?.responseModalities?.includes('AUDIO')
        && speakerConfigs[0]?.speaker === 'Host 1'
        && speakerConfigs[0]?.voiceConfig?.prebuiltVoiceConfig?.voiceName === 'Zephyr'
        && speakerConfigs[1]?.speaker === 'Host 2'
        && speakerConfigs[1]?.voiceConfig?.prebuiltVoiceConfig?.voiceName === 'Puck',
      JSON.stringify(speakerConfigs));

    try {
      const playback = await evaluate(client, `(async () => {
        const audio = document.getElementById('audioPlayer');
        if (!audio) throw new Error('Generated audio player is unavailable.');
        if (audio.readyState < 1) await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Audio metadata timed out.')), 5000);
          audio.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
          audio.addEventListener('error', () => { clearTimeout(timer); reject(new Error(audio.error?.message || 'Audio loading failed.')); }, { once: true });
        });
        await audio.play();
        await new Promise(resolve => setTimeout(resolve, 180));
        return { readyState: audio.readyState, duration: audio.duration, currentTime: audio.currentTime, paused: audio.paused, source: audio.currentSrc };
      })()`, { userGesture: true });
      check(results, 'Audio playback', playback.readyState >= 1 && Number.isFinite(playback.duration) && playback.duration > 0 && (playback.currentTime > 0 || !playback.paused), JSON.stringify(playback));
    } catch (error) {
      if (mode === 'file') limitation(results, 'Audio playback', error); else check(results, 'Audio playback', false, error.message);
    }

    try {
      await evaluate(client, `document.querySelector('[data-audio-action="download"]').click()`, { userGesture: true });
      const wav = await downloadedWav(downloadDirectory);
      check(results, 'WAV download', wav.riff === 'RIFF' && wav.wave === 'WAVE' && wav.sizeBytes > 44, JSON.stringify(wav));
    } catch (error) {
      if (mode === 'file') limitation(results, 'WAV download', error); else check(results, 'WAV download', false, error.message);
    }

    await delay(250);
    check(results, 'Browser console and startup exceptions', exceptions.length === 0 && consoleErrors.length === 0, JSON.stringify({ exceptions, consoleErrors }));
    return { mode, url, results, capturedRequests: capturedRequests.map(request => ({ kind: request.kind, url: request.url, method: request.method })) };
  } finally {
    client.close();
    await chrome.close();
    await removeDirectoryWithRetries(downloadDirectory).catch(error => {
      console.warn(`Unable to remove runtime download directory after retries: ${error.message}`);
    });
  }
}

function printResults(report) {
  console.log(`\n${report.mode === 'http' ? 'Local HTTP server' : 'Direct file://'}: ${report.url}`);
  for (const result of report.results) {
    const label = result.status === 'pass' ? 'PASS' : result.status === 'limited' ? 'LIMITED' : 'FAIL';
    console.log(`  ${label.padEnd(7)} ${result.name}${result.details ? ` — ${result.details}` : ''}`);
  }
}

export async function runRuntimeSmoke() {
  await verifySingleFile();
  const expectedBytes = await readFile(outputPath);
  const server = await startStandaloneServer({ port: 0, host: '127.0.0.1' });
  try {
    const reports = [];
    const delivery = await verifyHttpDelivery(server.url, expectedBytes);
    const modes = [
      { mode: 'http', url: server.url },
      { mode: 'file', url: pathToFileURL(outputPath).href }
    ];

    for (const mode of modes) {
      try {
        const report = await runMode(mode);
        if (mode.mode === 'http') {
          report.results.unshift({
            name: 'HTTP delivery',
            status: 'pass',
            details: `HTTP ${delivery.statusCode}; ${delivery.contentType}; ${delivery.sizeBytes} exact bytes`
          });
        }
        reports.push(report);
      } catch (error) {
        reports.push({
          ...mode,
          results: [{ name: 'Runtime execution', status: 'fail', details: error.message }],
          capturedRequests: []
        });
      }
    }

    reports.forEach(printResults);
    const failures = reports.flatMap(report => report.results.filter(result => result.status === 'fail').map(result => `${report.mode}: ${result.name} (${result.details})`));
    if (failures.length) throw new Error(`Runtime smoke verification failed:\n- ${failures.join('\n- ')}`);
    console.log('\nRuntime smoke verification passed with any browser-policy limitations reported above.');
    return reports;
  } finally {
    await server.close();
  }
}

async function runCli() {
  try {
    await runRuntimeSmoke();
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await runCli();
