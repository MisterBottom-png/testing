import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(projectRoot, 'src', 'index.html');
const outputDirectory = path.join(projectRoot, 'dist');
const outputPath = path.join(outputDirectory, 'gemini-podcast-studio.html');

let html = await readFile(sourcePath, 'utf8');
const stylesheetPattern = /\s*<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/>/g;
const scriptPattern = /\s*<script\s+defer\s+src="([^"]+)"><\/script>/g;

for (const match of [...html.matchAll(stylesheetPattern)]) {
  const css = await readFile(path.resolve(path.dirname(sourcePath), match[1]), 'utf8');
  html = html.replace(match[0], `\n  <style>\n${css.trim()}\n  </style>`);
}
for (const match of [...html.matchAll(scriptPattern)]) {
  const javascript = await readFile(path.resolve(path.dirname(sourcePath), match[1]), 'utf8');
  html = html.replace(match[0], `\n  <script>\n${javascript.trim()}\n  </script>`);
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, html, 'utf8');
console.log(`Built ${path.relative(projectRoot, outputPath)}`);
