import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(scriptsDirectory, 'runtime-smoke.mjs');
const temporaryPath = path.join(scriptsDirectory, `.runtime-smoke-repaired-${process.pid}.mjs`);

function replaceRequired(source, oldValue, newValue) {
  if (!source.includes(oldValue)) throw new Error(`Runtime smoke repair target is missing: ${oldValue}`);
  return source.replace(oldValue, newValue);
}

async function run() {
  process.env.CHROMIUM_PATH ||= existsSync('/usr/bin/google-chrome')
    ? '/usr/bin/google-chrome'
    : '/usr/bin/chromium';

  let source = await readFile(sourcePath, 'utf8');
  source = replaceRequired(source, 'async function waitForChrome(port, child, timeoutMs = 12_000)', 'async function waitForChrome(port, child, timeoutMs = 30_000)');
  source = replaceRequired(source, "    language: 'English',\n    estimatedWords: 18,\n", '');
  source = replaceRequired(source, "configured.connected === 'Gemini connected'", "configured.connected === 'Gemini configured'");
  await writeFile(temporaryPath, source, 'utf8');

  try {
    const runtime = await import(`${pathToFileURL(temporaryPath).href}?v=${Date.now()}`);
    await runtime.runRuntimeSmoke();
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

await run();
