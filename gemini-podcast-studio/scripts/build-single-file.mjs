import { build as viteBuild } from 'vite';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_WARNING, STABLE_OUTPUT_FILENAME, verifySingleFile } from './verify-single-file.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const temporaryDirectory = path.join(projectRoot, '.single-file-build');
const temporaryIndexPath = path.join(temporaryDirectory, 'index.html');
const candidateDirectory = path.join(temporaryDirectory, 'standalone-output');
const candidatePath = path.join(candidateDirectory, STABLE_OUTPUT_FILENAME);
const outputDirectory = path.join(projectRoot, 'dist');
const outputPath = path.join(outputDirectory, STABLE_OUTPUT_FILENAME);

const mimeTypes = new Map([
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
  ['.json', 'application/json'], ['.txt', 'text/plain'], ['.html', 'text/html'], ['.css', 'text/css'],
  ['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.wav', 'audio/wav'], ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm']
]);

function isExternalReference(value) {
  return /^(?:https?:)?\/\//i.test(value) || /^(?:data:|blob:|#|mailto:|tel:|javascript:)/i.test(value);
}

function splitReference(value) {
  const match = value.match(/^([^?#]*)([?#].*)?$/);
  return { pathname: match?.[1] ?? value, suffix: match?.[2] ?? '' };
}

function resolveTemporaryAsset(reference, baseDirectory = temporaryDirectory) {
  const { pathname } = splitReference(reference);
  const decoded = decodeURIComponent(pathname);
  const absolute = decoded.startsWith('/')
    ? path.join(temporaryDirectory, decoded.replace(/^\/+/, ''))
    : path.resolve(baseDirectory, decoded);
  const relative = path.relative(temporaryDirectory, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing to inline asset outside temporary build: ${reference}`);
  return absolute;
}

function mimeTypeFor(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

async function fileToDataUrl(filePath) {
  const bytes = await readFile(filePath);
  const mimeType = mimeTypeFor(filePath);
  if (mimeType === 'image/svg+xml') {
    const svg = bytes.toString('utf8').replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return `data:${mimeType},${encodeURIComponent(svg)}`;
  }
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function replaceAsync(input, pattern, replacer) {
  const matches = [...input.matchAll(pattern)];
  if (!matches.length) return input;
  let output = '';
  let cursor = 0;
  for (const match of matches) {
    output += input.slice(cursor, match.index);
    output += await replacer(match);
    cursor = match.index + match[0].length;
  }
  return output + input.slice(cursor);
}

async function inlineCssAssets(css, cssFilePath) {
  return replaceAsync(css, /url\(\s*(["']?)([^)"']+)\1\s*\)/gi, async match => {
    const reference = match[2].trim();
    if (!reference || isExternalReference(reference)) return match[0];
    const filePath = resolveTemporaryAsset(reference, path.dirname(cssFilePath));
    return `url("${await fileToDataUrl(filePath)}")`;
  });
}

function escapeInlineScript(javascript) {
  return javascript.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

async function inlineStylesheets(html) {
  return replaceAsync(html, /<link\b[^>]*\brel=(["'])[^"']*stylesheet[^"']*\1[^>]*>/gi, async match => {
    const href = match[0].match(/\bhref=(["'])(.*?)\1/i)?.[2];
    if (!href) throw new Error(`Generated stylesheet tag has no href: ${match[0]}`);
    if (isExternalReference(href)) throw new Error(`Remote stylesheet cannot be part of the standalone application: ${href}`);
    const cssPath = resolveTemporaryAsset(href);
    const css = await inlineCssAssets(await readFile(cssPath, 'utf8'), cssPath);
    return `<style data-inline-source="${path.relative(temporaryDirectory, cssPath).replaceAll(path.sep, '/')}">\n${css.trim()}\n</style>`;
  });
}

async function inlineScripts(html) {
  const scriptPattern = /^[\t ]*<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>\s*<\/script>[\t ]*(?:\r?\n)?/gim;
  const matches = [...html.matchAll(scriptPattern)];
  if (!matches.length) return html;

  const inlineScripts = [];
  for (const match of matches) {
    const source = match[2];
    if (isExternalReference(source)) throw new Error(`Remote script cannot be part of the standalone application: ${source}`);
    const scriptPath = resolveTemporaryAsset(source);
    const javascript = await readFile(scriptPath, 'utf8');
    inlineScripts.push(`<script data-inline-source="${path.relative(temporaryDirectory, scriptPath).replaceAll(path.sep, '/')}">\n${escapeInlineScript(javascript.trim())}\n</script>`);
  }

  const withoutExternalScripts = html.replace(scriptPattern, '');
  return insertBeforeClosingBody(withoutExternalScripts, inlineScripts.join('\n'));
}

async function inlineRemainingHtmlAssets(html) {
  return replaceAsync(html, /<([a-z][\w:-]*)\b[^>]*>/gi, async match => {
    const tagName = match[1].toLowerCase();
    if (tagName === 'script' || tagName === 'style') return match[0];
    let tag = match[0];
    for (const attribute of ['src', 'href', 'poster', 'data']) {
      const attributePattern = new RegExp(`\\b${attribute}=(["'])(.*?)\\1`, 'i');
      const attributeMatch = tag.match(attributePattern);
      if (!attributeMatch) continue;
      const reference = attributeMatch[2].trim();
      if (!reference || isExternalReference(reference)) continue;
      const assetPath = resolveTemporaryAsset(reference);
      const dataUrl = await fileToDataUrl(assetPath);
      tag = tag.replace(attributePattern, `${attribute}=${attributeMatch[1]}${dataUrl}${attributeMatch[1]}`);
    }
    return tag;
  });
}

export function insertBeforeClosingBody(html, content) {
  if (!/<\/body>/i.test(html)) throw new Error('Generated HTML has no closing body tag for inline JavaScript.');
  return html.replace(/<\/body>/i, () => `${content}\n</body>`);
}

function addGeneratedWarning(html) {
  if (html.includes(GENERATED_WARNING)) return html;
  return html.replace(/^(\s*<!doctype html>)/i, `$1\n${GENERATED_WARNING}`);
}

async function createStandaloneHtml() {
  let html = await readFile(temporaryIndexPath, 'utf8');
  html = await inlineStylesheets(html);
  html = await inlineRemainingHtmlAssets(html);
  html = await inlineScripts(html);
  html = addGeneratedWarning(html);
  return html.endsWith('\n') ? html : `${html}\n`;
}

export async function buildSingleFile(options = {}) {
  const silent = options.silent === true;
  await rm(temporaryDirectory, { recursive: true, force: true });

  let completed = false;
  try {
    await viteBuild({
      configFile: path.join(projectRoot, 'vite.config.js'),
      logLevel: silent ? 'silent' : 'info'
    });

    const standaloneHtml = await createStandaloneHtml();
    await mkdir(candidateDirectory, { recursive: true });
    await writeFile(candidatePath, standaloneHtml, 'utf8');
    await verifySingleFile({ outputPath: candidatePath, outputDirectory: candidateDirectory });

    await rm(outputDirectory, { recursive: true, force: true });
    await mkdir(outputDirectory, { recursive: true });
    await rename(candidatePath, outputPath);
    const verified = await verifySingleFile({ outputPath, outputDirectory });
    completed = true;

    if (!silent) console.log(`Built ${path.relative(projectRoot, outputPath)} (${verified.sizeBytes} bytes).`);
    return verified;
  } finally {
    if (completed) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function runCli() {
  try {
    await buildSingleFile();
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await runCli();
