import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const verifierPath = path.join(root, 'scripts', 'verify-single-file.mjs');
const stableFilename = 'gemini-podcast-studio.html';

function validHtml(overrides = {}) {
  const warning = overrides.warning ?? `<!--\n  Generated file. Do not edit directly.\n  Edit files under /src and run npm run build.\n-->`;
  const style = overrides.style ?? '<style>body{font-family:sans-serif}</style>';
  const script = overrides.script ?? '<script>(()=>{window.__GEMINI_PODCAST_STUDIO_STARTED__=true})();</script>';
  const rootMarkup = overrides.rootMarkup ?? '<main class="app-shell"><section id="createStage"></section><section id="scriptStage"></section><section id="audioStage"></section><svg class="icon" viewBox="0 0 24 24"><path d="M4 12v3M8 8v11M12 5v14M16 8v11M20 12v3"/></svg></main>';
  const headExtra = overrides.headExtra ?? '';
  const bodyExtra = overrides.bodyExtra ?? '';
  return `<!doctype html>\n${warning}\n<html><head>${headExtra}${style}</head><body>${rootMarkup}${bodyExtra}${script}</body></html>`;
}

async function withFixture(html, callback, { filename = stableFilename, extraFiles = [] } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gemini-single-file-'));
  try {
    const outputPath = path.join(directory, filename);
    await writeFile(outputPath, html, 'utf8');
    for (const extraFile of extraFiles) await writeFile(path.join(directory, extraFile), 'extra', 'utf8');
    return await callback({ directory, outputPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}


async function startFixtureServer(html) {
  const body = Buffer.from(html, 'utf8');
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length });
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

async function loadVerifier() {
  const source = await readFile(verifierPath, 'utf8');
  assert.match(source, /export\s+async\s+function\s+verifySingleFile\b/, 'verifier must expose a reusable verification function');
  return import(`${pathToFileURL(verifierPath).href}?test=${Date.now()}-${Math.random()}`);
}

test('standalone verifier accepts one valid self-contained application', async () => {
  const { verifySingleFile } = await loadVerifier();
  await withFixture(validHtml(), async ({ directory, outputPath }) => {
    const result = await verifySingleFile({ outputPath, outputDirectory: directory });
    assert.equal(result.outputPath, outputPath);
    assert.ok(result.sizeBytes > 0);
  });
});

test('standalone verifier rejects escaped runtime dependencies and missing embedded requirements', async t => {
  const { verifySingleFile } = await loadVerifier();
  const cases = [
    ['local script src', validHtml({ bodyExtra: '<script src="./assets/app.js"></script>' }), /local script src/i],
    ['local stylesheet href', validHtml({ headExtra: '<link rel="stylesheet" href="./assets/app.css">' }), /local stylesheet/i],
    ['runtime dynamic import', validHtml({ script: '<script>import("./chunk.js")</script>' }), /dynamic import/i],
    ['entity-escaped dynamic import', validHtml({ script: '<script>import&#40;"./chunk.js"&#41;</script>' }), /dynamic import/i],
    ['module script', validHtml({ script: '<script type="module">console.log("x")</script>' }), /module script/i],
    ['static module import', validHtml({ script: '<script>import value from "./module.js";</script>' }), /es-module import/i],
    ['local runtime fetch', validHtml({ script: '<script>fetch("./icons.svg")</script>' }), /local runtime fetch/i],
    ['remote runtime application request', validHtml({ script: '<script>fetch("https://example.com/app.js")</script>' }), /remote runtime request/i],
    ['remote application asset', validHtml({ headExtra: '<link rel="stylesheet" href="https://example.com/app.css">' }), /remote application asset/i],
    ['vite development path', validHtml({ script: '<script>window.path="/@vite/client"</script>' }), /vite development path/i],
    ['missing application root', validHtml({ rootMarkup: '<div></div>' }), /application root/i],
    ['missing inline css', validHtml({ style: '' }), /inline css/i],
    ['missing inline javascript', validHtml({ script: '' }), /inline javascript/i],
    ['inline javascript before body', validHtml({ script: '', headExtra: '<script>window.started=true</script>' }), /after the body/i],
    ['missing generated warning', validHtml({ warning: '' }), /generated-file warning/i],
    ['missing embedded icon', validHtml({ rootMarkup: '<main class="app-shell"><section id="createStage"></section><section id="scriptStage"></section><section id="audioStage"></section></main>' }), /embedded icon/i]
  ];

  for (const [name, html, pattern] of cases) {
    await t.test(name, async () => {
      await withFixture(html, async ({ directory, outputPath }) => {
        await assert.rejects(() => verifySingleFile({ outputPath, outputDirectory: directory }), pattern);
      });
    });
  }
});

test('standalone verifier enforces the stable filename and exactly one production file', async () => {
  const { verifySingleFile } = await loadVerifier();
  await withFixture(validHtml(), async ({ directory, outputPath }) => {
    await assert.rejects(() => verifySingleFile({ outputPath, outputDirectory: directory }), /incorrect output filename/i);
  }, { filename: 'wrong.html' });

  await withFixture(validHtml(), async ({ directory, outputPath }) => {
    await assert.rejects(() => verifySingleFile({ outputPath, outputDirectory: directory }), /exactly one production output file/i);
  }, { extraFiles: ['unexpected.js'] });
});

test('Vite production configuration emits one deterministic temporary bundle', async () => {
  const source = await readFile(path.join(root, 'vite.config.js'), 'utf8');
  assert.match(source, /root:\s*['"]src['"]/);
  assert.match(source, /outDir:\s*['"]\.\.\/\.single-file-build['"]/);
  assert.match(source, /cssCodeSplit:\s*false/);
  assert.match(source, /sourcemap:\s*false/);
  assert.match(source, /assetsInlineLimit:\s*\d+/);
  assert.match(source, /inlineDynamicImports:\s*true/);
  assert.match(source, /format:\s*['"]iife['"]/);
  assert.match(source, /entryFileNames:\s*['"]assets\/app\.js['"]/);
  assert.match(source, /assetFileNames:\s*['"]assets\/\[name\]\[extname\]['"]/);
});

test('single-file script insertion preserves JavaScript replacement tokens', async () => {
  const builderPath = path.join(root, 'scripts', 'build-single-file.mjs');
  const { insertBeforeClosingBody } = await import(`${pathToFileURL(builderPath).href}?test=${Date.now()}-${Math.random()}`);
  assert.equal(typeof insertBeforeClosingBody, 'function');
  const script = '<script>function compare(left, right) { return $&&right; }</script>';
  assert.equal(
    insertBeforeClosingBody('<html><body><main></main></body></html>', script),
    `<html><body><main></main>${script}\n</body></html>`
  );
});

test('single-file builder bundles, inlines, verifies and cleans temporary output', async () => {
  const builderPath = path.join(root, 'scripts', 'build-single-file.mjs');
  const source = await readFile(builderPath, 'utf8');
  assert.match(source, /export\s+async\s+function\s+buildSingleFile\b/, 'builder must expose a reusable build function');
  const { buildSingleFile } = await import(`${pathToFileURL(builderPath).href}?test=${Date.now()}-${Math.random()}`);
  const result = await buildSingleFile({ silent: true });
  assert.equal(result.outputPath, path.join(root, 'dist', stableFilename));
  assert.ok(result.sizeBytes > 100_000, 'standalone output is unexpectedly small');

  const html = await readFile(result.outputPath, 'utf8');
  assert.match(html, /Generated file\. Do not edit directly\./);
  assert.match(html, /<style\b[^>]*>[\s\S]+<\/style>/);
  assert.match(html, /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]+<\/script>/);
  const bodyIndex = html.search(/<body\b/i);
  const inlineScriptIndex = html.search(/<script\b(?![^>]*\bsrc=)/i);
  assert.ok(bodyIndex >= 0, 'standalone output must contain a body element');
  assert.ok(inlineScriptIndex > bodyIndex, 'inline JavaScript must execute after the body has been parsed');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["'][^"']*stylesheet/i);
  assert.doesNotMatch(html, /<script\b[^>]*\btype=["']module["']/i);
  await assert.rejects(() => stat(path.join(root, '.single-file-build')), /ENOENT/);
});

test('generated output policy and package scripts describe source-owned standalone builds', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.build, 'node scripts/build-single-file.mjs');
  assert.equal(packageJson.scripts['verify:single'], 'node scripts/verify-single-file.mjs');
  assert.equal(packageJson.scripts.preview, 'node scripts/serve-dist.mjs');
  assert.equal(packageJson.scripts.check, 'npm test && npm run build');

  const policy = await readFile(path.join(root, 'BUILD_OUTPUT_POLICY.md'), 'utf8');
  assert.match(policy, /src\/.*editable/i);
  assert.match(policy, /dist\/.*generated/i);
  assert.match(policy, /must not be edited/i);
  assert.match(policy, /rebuilt after source changes/i);
  assert.match(policy, /build results, not hand-authored/i);
});

test('runtime smoke harness covers HTTP and direct-file standalone capabilities', async () => {
  const runtimePath = path.join(root, 'scripts', 'runtime-smoke.mjs');
  const source = await readFile(runtimePath, 'utf8');
  for (const marker of [
    'startStandaloneServer', 'file://', 'Fetch.enable', 'generativelanguage.googleapis.com',
    'indexedDB.open', 'scriptPanel', 'audioPlayer', 'Page.setDownloadBehavior', 'RIFF', 'WAVE'
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('runtime smoke treats administrator browser blocks as limitations and verifies HTTP delivery independently', async () => {
  const runtimePath = path.join(root, 'scripts', 'runtime-smoke.mjs');
  const runtimeModule = await import(`${pathToFileURL(runtimePath).href}?test=${Date.now()}-${Math.random()}`);
  assert.equal(typeof runtimeModule.classifyNavigationRestriction, 'function');
  assert.equal(typeof runtimeModule.verifyHttpDelivery, 'function');

  const restricted = runtimeModule.classifyNavigationRestriction('net::ERR_BLOCKED_BY_ADMINISTRATOR', 'http');
  assert.equal(restricted.status, 'limited');
  assert.match(restricted.details, /administrator policy/i);
  assert.match(restricted.details, /local HTTP server/i);

  assert.equal(runtimeModule.classifyNavigationRestriction('net::ERR_CONNECTION_REFUSED', 'http'), null);

  const server = await startFixtureServer(validHtml());
  try {
    const delivered = await runtimeModule.verifyHttpDelivery(server.url, Buffer.from(validHtml(), 'utf8'));
    assert.equal(delivered.statusCode, 200);
    assert.match(delivered.contentType, /^text\/html\b/i);
    assert.equal(delivered.sizeBytes, Buffer.byteLength(validHtml()));
    assert.equal(delivered.exactBytes, true);
  } finally {
    await server.close();
  }
});


test('standalone verifier allows only static Gemini API remote requests', async () => {
  const { verifySingleFile } = await loadVerifier();
  const html = validHtml({ script: '<script>fetch("https://generativelanguage.googleapis.com/v1beta/models/example:generateContent")</script>' });
  await withFixture(html, async ({ directory, outputPath }) => {
    await verifySingleFile({ outputPath, outputDirectory: directory });
  });
});

test('runtime smoke retries transient Chromium profile cleanup failures', async () => {
  const runtimePath = path.join(root, 'scripts', 'runtime-smoke.mjs');
  const runtimeModule = await import(`${pathToFileURL(runtimePath).href}?test=${Date.now()}-${Math.random()}`);
  assert.equal(typeof runtimeModule.removeDirectoryWithRetries, 'function');

  let calls = 0;
  const remove = async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error('directory not empty');
      error.code = 'ENOTEMPTY';
      throw error;
    }
  };

  await runtimeModule.removeDirectoryWithRetries('/tmp/fake-profile', {
    remove,
    attempts: 4,
    delayMs: 0
  });
  assert.equal(calls, 3);
});

test('runtime smoke reports direct-file reload storage loss as a limitation while keeping HTTP strict', async () => {
  const runtimePath = path.join(root, 'scripts', 'runtime-smoke.mjs');
  const runtimeModule = await import(`${pathToFileURL(runtimePath).href}?test=${Date.now()}-${Math.random()}`);
  assert.equal(typeof runtimeModule.classifyPreferencePersistence, 'function');

  const fileResult = runtimeModule.classifyPreferencePersistence({
    mode: 'file',
    persistedTopic: 'Runtime persistence file',
    savedTopic: 'Runtime persistence file',
    restoredTopic: undefined
  });
  assert.equal(fileResult.status, 'limited');
  assert.match(fileResult.details, /file:\/\//i);
  assert.match(fileResult.details, /localStorage/i);
  assert.match(fileResult.details, /local HTTP server/i);

  const httpResult = runtimeModule.classifyPreferencePersistence({
    mode: 'http',
    persistedTopic: 'Runtime persistence http',
    savedTopic: 'Runtime persistence http',
    restoredTopic: undefined
  });
  assert.equal(httpResult.status, 'fail');

  const passResult = runtimeModule.classifyPreferencePersistence({
    mode: 'file',
    persistedTopic: 'Runtime persistence file',
    savedTopic: 'Runtime persistence file',
    restoredTopic: 'Runtime persistence file'
  });
  assert.equal(passResult.status, 'pass');
});
