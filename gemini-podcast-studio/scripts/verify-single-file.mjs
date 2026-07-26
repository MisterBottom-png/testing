import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = await readFile(path.join(root, 'dist', 'gemini-podcast-studio.html'), 'utf8');
const failures = [];

if (!html.includes('<!doctype html>')) failures.push('Missing doctype.');
if (!html.includes('<style>')) failures.push('No inline CSS found.');
if (!html.includes('<script>')) failures.push('No inline JavaScript found.');
if (/\b(?:src|href)="\.\//.test(html)) failures.push('Local runtime dependency remains.');
if (/type="module"/.test(html)) failures.push('Unexpected module runtime dependency remains.');

const markupOnly = html
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '');
const ids = [...markupOnly.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
if (ids.length !== new Set(ids).size) failures.push('Duplicate HTML ids detected.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Single-file build verification passed.');
