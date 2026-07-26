from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "podcast-studio.html"
OUTPUT = ROOT / "gemini-podcast-studio"

if not SOURCE.exists():
    raise SystemExit("podcast-studio.html was not found at the repository root")

if OUTPUT.exists():
    shutil.rmtree(OUTPUT)

(OUTPUT / "src" / "styles").mkdir(parents=True)
(OUTPUT / "src" / "js").mkdir(parents=True)
(OUTPUT / "scripts").mkdir(parents=True)
(OUTPUT / "tests").mkdir(parents=True)
(OUTPUT / "dist").mkdir(parents=True)

text = SOURCE.read_text(encoding="utf-8")
pre, rest = text.split("<style>", 1)
css, rest = rest.split("</style>", 1)
mid, rest = rest.split("<script>", 1)
javascript, post = rest.split("</script>", 1)


def extract_layer(css_text: str, name: str) -> str:
    marker = f"@layer {name} {{"
    start = css_text.index(marker)
    brace = css_text.index("{", start)
    depth = 0
    for index in range(brace, len(css_text)):
        if css_text[index] == "{":
            depth += 1
        elif css_text[index] == "}":
            depth -= 1
            if depth == 0:
                return css_text[start:index + 1].strip() + "\n"
    raise RuntimeError(f"Could not extract CSS layer: {name}")


layers = {
    name: extract_layer(css, name)
    for name in [
        "reset",
        "tokens",
        "base",
        "layout",
        "components",
        "utilities",
        "responsive",
    ]
}

(OUTPUT / "src" / "styles" / "tokens.css").write_text(
    "@layer reset, tokens, base, layout, components, utilities, responsive;\n\n"
    + layers["reset"]
    + "\n"
    + layers["tokens"],
    encoding="utf-8",
)
(OUTPUT / "src" / "styles" / "base.css").write_text(layers["base"], encoding="utf-8")
(OUTPUT / "src" / "styles" / "layout.css").write_text(layers["layout"], encoding="utf-8")
(OUTPUT / "src" / "styles" / "components.css").write_text(layers["components"], encoding="utf-8")
(OUTPUT / "src" / "styles" / "responsive.css").write_text(
    layers["utilities"] + "\n" + layers["responsive"],
    encoding="utf-8",
)

js_lines = javascript.splitlines()
parts = [
    ("constants.js", 1, 54),
    ("state.js", 55, 101),
    ("text-utils.js", 102, 147),
    ("preferences.js", 148, 259),
    ("ui-create.js", 260, 387),
    ("ui-script.js", 388, 562),
    ("gemini-api.js", 563, 643),
    ("audio.js", 644, 743),
    ("ui-status.js", 744, 801),
    ("ui-events.js", 802, 886),
    ("main.js", 887, len(js_lines)),
]

for name, start, end in parts:
    content = "\n".join(js_lines[start - 1:end]).strip("\n") + "\n"
    (OUTPUT / "src" / "js" / name).write_text(content, encoding="utf-8")

stylesheets = """  <link rel=\"stylesheet\" href=\"./styles/tokens.css\" />
  <link rel=\"stylesheet\" href=\"./styles/base.css\" />
  <link rel=\"stylesheet\" href=\"./styles/layout.css\" />
  <link rel=\"stylesheet\" href=\"./styles/components.css\" />
  <link rel=\"stylesheet\" href=\"./styles/responsive.css\" />
"""
script_tags = "".join(
    f'  <script defer src="./js/{name}"></script>\n'
    for name, _, _ in parts
)
(OUTPUT / "src" / "index.html").write_text(
    pre + stylesheets + mid + script_tags + post,
    encoding="utf-8",
)

package = {
    "name": "gemini-podcast-studio",
    "private": True,
    "version": "0.1.0",
    "type": "module",
    "scripts": {
        "dev": "vite src --host 0.0.0.0",
        "build": "node scripts/build-single-file.mjs",
        "verify": "node scripts/verify-single-file.mjs",
        "test": "node --test tests/*.test.mjs",
        "check": "npm run build && npm run verify && npm test",
    },
    "devDependencies": {"vite": "^7.0.0"},
}
(OUTPUT / "package.json").write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

(OUTPUT / "vite.config.js").write_text(
    """import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../.vite-build',
    emptyOutDir: true
  }
});
""",
    encoding="utf-8",
)

(OUTPUT / "scripts" / "build-single-file.mjs").write_text(
    r"""import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
""",
    encoding="utf-8",
)

(OUTPUT / "scripts" / "verify-single-file.mjs").write_text(
    r"""import { readFile } from 'node:fs/promises';
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
""",
    encoding="utf-8",
)

(OUTPUT / "tests" / "source-parity.test.mjs").write_text(
    r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('modular source preserves the three workflow stages', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  for (const id of ['createStage', 'scriptStage', 'audioStage']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('javascript is loaded in dependency order', async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  const expected = [
    'constants.js', 'state.js', 'text-utils.js', 'preferences.js',
    'ui-create.js', 'ui-script.js', 'gemini-api.js', 'audio.js',
    'ui-status.js', 'ui-events.js', 'main.js'
  ];
  let previous = -1;
  for (const file of expected) {
    const current = html.indexOf(`./js/${file}`);
    assert.ok(current > previous, `${file} is missing or out of order`);
    previous = current;
  }
});
""",
    encoding="utf-8",
)

(OUTPUT / "README.md").write_text(
    """# Gemini Podcast Studio

Maintainable development source extracted from the working single-file application.

- `src/index.html` contains markup.
- `src/styles/` contains the original CSS layers.
- `src/js/` contains JavaScript split by responsibility in preserved execution order.
- `dist/gemini-podcast-studio.html` is generated and must not be edited manually.

The extraction deliberately uses ordered deferred scripts to preserve baseline behaviour. Converting the shared scope to explicit ES-module imports is a separate refactor after parity is confirmed, rather than mixing architecture and functional changes in one hazardous blob.

```bash
npm install
npm run dev
npm run check
```
""",
    encoding="utf-8",
)

print(f"Generated modular project at {OUTPUT.relative_to(ROOT)}")
