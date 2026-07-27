import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STABLE_OUTPUT_FILENAME = 'gemini-podcast-studio.html';
export const GENERATED_WARNING = `<!--\n  Generated file. Do not edit directly.\n  Edit files under /src and run npm run build.\n-->`;

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDirectory = path.join(projectRoot, 'dist');
const defaultOutputPath = path.join(defaultOutputDirectory, STABLE_OUTPUT_FILENAME);
const assetTags = new Set(['script', 'link', 'img', 'source', 'video', 'audio', 'object', 'embed', 'iframe', 'image', 'use']);

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lpar;/gi, '(')
    .replace(/&rpar;/gi, ')')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'is'));
  return match?.[2] ?? null;
}

function isRemoteReference(value) {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

function isEmbeddedReference(value) {
  return /^(?:data:|blob:|#|mailto:|tel:|javascript:)/i.test(value.trim());
}

function isLocalReference(value) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isRemoteReference(trimmed) && !isEmbeddedReference(trimmed);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function collectTags(markup) {
  return [...markup.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)].map(match => ({ name: match[1].toLowerCase(), text: match[0] }));
}

function collectBodies(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))].map(match => match[1]);
}

function formatFailure(failures) {
  return `Single-file verification failed:\n- ${failures.join('\n- ')}`;
}

export async function verifySingleFile(options = {}) {
  const outputDirectory = path.resolve(options.outputDirectory ?? defaultOutputDirectory);
  const outputPath = path.resolve(options.outputPath ?? path.join(outputDirectory, STABLE_OUTPUT_FILENAME));
  const failures = [];

  if (path.basename(outputPath) !== STABLE_OUTPUT_FILENAME) {
    failures.push(`Incorrect output filename: expected ${STABLE_OUTPUT_FILENAME}.`);
  }

  let files = [];
  try {
    files = await listFiles(outputDirectory);
  } catch (error) {
    failures.push(`Production output directory is unavailable: ${error.message}`);
  }
  if (files.length !== 1 || (files[0] && path.resolve(files[0]) !== outputPath)) {
    failures.push(`Expected exactly one production output file named ${STABLE_OUTPUT_FILENAME}; found ${files.length}.`);
  }

  let html = '';
  try {
    html = await readFile(outputPath, 'utf8');
  } catch (error) {
    failures.push(`Unable to read standalone output: ${error.message}`);
  }

  if (html) {
    const scriptBodies = collectBodies(html, 'script');
    const styleBodies = collectBodies(html, 'style');
    const markupOnly = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => match.replace(/>[\s\S]*<\/script>/i, '></script>'))
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, match => match.replace(/>[\s\S]*<\/style>/i, '></style>'));
    const tags = collectTags(markupOnly);
    const decodedScripts = decodeHtmlEntities(scriptBodies.join('\n'));

    if (!/^<!doctype html>/i.test(html.trimStart())) failures.push('Missing doctype.');
    if (!html.includes(GENERATED_WARNING)) failures.push('Missing generated-file warning.');
    if (!/<main\b[^>]*class=["'][^"']*\bapp-shell\b/i.test(markupOnly)) failures.push('Missing application root.');
    for (const id of ['createStage', 'scriptStage', 'audioStage']) {
      if (!new RegExp(`\\bid=["']${id}["']`, 'i').test(markupOnly)) failures.push(`Missing application root stage ${id}.`);
    }
    if (!styleBodies.some(body => body.trim().length > 0)) failures.push('Missing inline CSS.');
    if (!scriptBodies.some(body => body.trim().length > 0)) failures.push('Missing inline JavaScript.');
    const bodyIndex = html.search(/<body\b/i);
    const inlineScriptIndices = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].map(match => match.index);
    if (inlineScriptIndices.length && !inlineScriptIndices.some(index => index > bodyIndex)) {
      failures.push('Inline JavaScript must appear after the body opens so the application DOM exists before startup.');
    }
    if (!/<svg\b[^>]*class=["'][^"']*\bicon\b/i.test(markupOnly) || !/M4 12v3M8 8v11M12 5v14M16 8v11M20 12v3/.test(markupOnly)) {
      failures.push('Missing required embedded icon asset.');
    }

    for (const { name, text } of tags) {
      const src = attributeValue(text, 'src');
      const href = attributeValue(text, 'href');
      const poster = attributeValue(text, 'poster');
      const data = name === 'object' ? attributeValue(text, 'data') : null;
      const reference = src ?? href ?? poster ?? data;

      if (name === 'script' && src && isLocalReference(src)) failures.push(`Local script src dependency remains: ${src}`);
      if (name === 'link' && /\brel\s*=\s*(["'])[^"']*stylesheet[^"']*\1/i.test(text) && href && isLocalReference(href)) {
        failures.push(`Local stylesheet href dependency remains: ${href}`);
      }
      if (assetTags.has(name) && reference && isRemoteReference(reference)) failures.push(`Remote application asset remains: ${reference}`);
      if (reference && isLocalReference(reference)) failures.push(`Local runtime asset reference remains: ${reference}`);
      if (name === 'script' && /\btype\s*=\s*(["'])module\1/i.test(text)) failures.push('Module script remains in standalone output.');
    }

    if (/\bimport\s*\(/.test(decodedScripts)) failures.push('Runtime dynamic import() call remains.');
    if (/\bimport\.meta\b/.test(decodedScripts)) failures.push('ES-module import.meta remains.');
    if (/\bimport\s+(?:[\w*{]|["'])[^;\n]*?(?:\bfrom\s*)?["'][^"']+["']/m.test(decodedScripts)) failures.push('Escaped ES-module import remains.');
    if (/\bexport\s+(?:default|const|let|var|function|class|\{)/.test(decodedScripts)) failures.push('ES-module export remains.');
    if (/\b(?:fetch|Request)\s*\(\s*(["'`])(?!https?:\/\/|\/\/|data:|blob:)([^"'`]+)\1/i.test(decodedScripts)) {
      failures.push('Local runtime fetch for an application resource remains.');
    }
    for (const match of decodedScripts.matchAll(/\b(?:fetch|Request)\s*\(\s*(["'`])((?:https?:)?\/\/[^"'`]+)\1/gi)) {
      const reference = match[2];
      if (!/^https:\/\/generativelanguage\.googleapis\.com\//i.test(reference)) {
        failures.push(`Remote runtime request outside the Gemini API remains: ${reference}`);
      }
    }
    if (/(?:\/@vite\/client|\/@fs\/|\/@id\/|__vite__|localhost:5173|127\.0\.0\.1:5173|\.vite-build\/|\.single-file-build\/)/i.test(html)) {
      failures.push('Vite development path remains.');
    }
    if (styleBodies.some(body => /(?:@import\s+|url\(\s*)(["']?)(?:https?:)?\/\//i.test(body))) failures.push('Remote application asset remains in inline CSS.');
    if (styleBodies.some(body => /url\(\s*(["']?)(?!data:|blob:|#|https?:\/\/|\/\/)([^)"']+)\1\s*\)/i.test(body))) {
      failures.push('Local runtime asset reference remains in inline CSS.');
    }

    const ids = [...markupOnly.matchAll(/\sid=["']([^"']+)["']/gi)].map(match => match[1]);
    if (ids.length !== new Set(ids).size) failures.push('Duplicate HTML ids detected.');
  }

  if (failures.length) throw new Error(formatFailure([...new Set(failures)]));
  const fileStats = await stat(outputPath);
  return { outputPath, sizeBytes: fileStats.size };
}

async function runCli() {
  try {
    const result = await verifySingleFile();
    console.log(`Single-file verification passed: ${path.relative(projectRoot, result.outputPath)} (${result.sizeBytes} bytes).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await runCli();
