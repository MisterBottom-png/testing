const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve('gemini-podcast-studio');
const jsRoot = path.join(projectRoot, 'src', 'js');
const originalFiles = [
  'constants.js', 'state.js', 'text-utils.js', 'preferences.js', 'ui-create.js', 'ui-script.js',
  'gemini-api.js', 'audio.js', 'ui-status.js', 'ui-events.js', 'voice-preview.js', 'main.js', 'final-review.js'
];
const filePaths = originalFiles.map(file => path.join(jsRoot, file));

const compilerOptions = {
  allowJs: true,
  checkJs: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.None,
  noLib: false,
  skipLibCheck: true
};
const program = ts.createProgram(filePaths, compilerOptions);
const checker = program.getTypeChecker();

const defaultOutputBySource = {
  'constants.js': 'constants.js',
  'state.js': 'state.js',
  'text-utils.js': 'text-utils.js',
  'preferences.js': 'preferences.js',
  'ui-create.js': 'ui-create.js',
  'ui-script.js': 'ui-script.js',
  'gemini-api.js': 'script-generation.js',
  'audio.js': 'tts-generation.js',
  'ui-status.js': 'ui-status.js',
  'ui-events.js': 'ui-events.js',
  'voice-preview.js': 'voice-preview.js',
  'main.js': 'conversation-preview.js',
  'final-review.js': 'final-review.js'
};

const outputByName = new Map();
function assign(output, names) { for (const name of names) outputByName.set(name, output); }

assign('ui-connection.js', ['connectionFormMarkup', 'renderConnectionForms', 'renderConnectionStatus', 'syncConnectionForm']);
assign('script-validation.js', ['buildScriptCharacters', 'buildScriptSchema', 'validateScriptSpeakers', 'renameScriptSpeaker', 'validateScript']);
assign('gemini-api.js', ['stripJsonFence', 'extractTextResponse', 'callGeminiText', 'requestTtsChunk']);
assign('script-generation.js', ['buildScriptPrompt', 'generatePodcastScript', 'refineScript']);
assign('pcm-audio.js', ['base64ToBytes', 'sampleRateFromMimeType', 'concatPcmBytes']);
assign('wav-encoder.js', ['writeAscii', 'pcm16ToWavBlob']);
assign('tts-chunking.js', ['buildSpeakerVoiceConfigs', 'getSpeakerVoiceMappingSignature', 'hashTtsCacheValue', 'buildTtsChunkCacheKey', 'buildTtsRequestBody', 'createTtsChunks']);
assign('tts-generation.js', ['invalidatePodcastAudio', 'invalidateAudioForSpeakerMappingChange', 'getTtsSpeakerValidationIssue', 'generatePodcastAudio', 'generateVoiceTest']);
assign('ui-audio.js', ['renderAudioStage', 'drawWaveform']);
assign('diagnostics.js', ['DIAGNOSTIC_REDACTION', 'DIAGNOSTIC_SENSITIVE_FIELD_PATTERN', 'redactDiagnosticString', 'redactDiagnosticValue', 'diagnosticLog']);
assign('gemini-errors.js', ['createApiError', 'mapError']);
assign('indexeddb.js', ['VOICE_PREVIEW_DB_NAME', 'VOICE_PREVIEW_STORE_NAME', 'voicePreviewDatabasePromise', 'openVoicePreviewDatabase', 'runVoicePreviewStoreRequest', 'createIndexedDbVoicePreviewCacheBackend']);
assign('media-cache.js', ['voicePreviewMemoryCache', 'voicePreviewCacheBackend', 'setVoicePreviewCacheBackendForTests', 'readVoicePreviewCache', 'writeVoicePreviewCache', 'removeVoicePreviewCache', 'clearVoicePreviewCache']);

const dynamicNames = new Set([
  'saveTimer', 'typingHistoryTimer', 'progressStartedAt', 'progressTimer', 'progressMessageTimer',
  'duplicateVoiceWarningVisible', 'dragIndex', 'renderSpeakerCards', 'resetProject', 'generateVoiceTest',
  'clearValidation', 'validateSpeakerRecords', 'showValidationErrors', 'mapError',
  'getTtsSpeakerValidationIssue', 'invalidatePodcastAudio', 'renderScriptMetrics'
]);

function getBindingIdentifiers(nameNode, result = []) {
  if (!nameNode) return result;
  if (ts.isIdentifier(nameNode)) result.push(nameNode);
  else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    for (const element of nameNode.elements) if (ts.isBindingElement(element)) getBindingIdentifiers(element.name, result);
  }
  return result;
}

function topLevelDeclarations(statement) {
  const items = [];
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    if (statement.name) items.push({ name: statement.name.text, kind: 'const', node: statement.name });
  } else if (ts.isVariableStatement(statement)) {
    const kind = statement.declarationList.flags & ts.NodeFlags.Let ? 'let' : statement.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'var';
    for (const declaration of statement.declarationList.declarations) {
      for (const identifier of getBindingIdentifiers(declaration.name)) items.push({ name: identifier.text, kind, node: identifier });
    }
  }
  return items;
}

function outputForName(name, sourceFileName) {
  return outputByName.get(name) || defaultOutputBySource[sourceFileName];
}

const symbolInfo = new Map();
const statementGroups = new Map();
for (const filePath of filePaths) {
  const sourceFile = program.getSourceFile(filePath);
  const sourceName = path.basename(filePath);
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === 'use strict') continue;
    const declarations = topLevelDeclarations(statement);
    const outputs = new Set(declarations.map(item => outputForName(item.name, sourceName)));
    const output = outputs.size ? [...outputs][0] : defaultOutputBySource[sourceName];
    if (outputs.size > 1) throw new Error(`Statement in ${sourceName} spans outputs: ${[...outputs].join(', ')}`);
    if (!statementGroups.has(output)) statementGroups.set(output, []);
    statementGroups.get(output).push({ statement, sourceFile, declarations, sourceName });
    for (const item of declarations) {
      const symbol = checker.getSymbolAtLocation(item.node);
      if (symbol) symbolInfo.set(symbol, { name: item.name, output });
    }
  }
}

function isDeclarationName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) && parent.name === node) return true;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.name === node) return true;
  if ((ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isLabeledStatement(parent) && parent.label === node) return true;
  if ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) return true;
  return false;
}

function createCtxAccess(factory, name) {
  return factory.createPropertyAccessExpression(factory.createIdentifier('ctx'), factory.createIdentifier(name));
}

function shouldReplaceIdentifier(node, currentOutput) {
  if (node.text === 'ctx' || isDeclarationName(node)) return null;
  const symbol = checker.getSymbolAtLocation(node);
  const info = symbol && symbolInfo.get(symbol);
  if (!info) return null;
  if (info.output !== currentOutput || dynamicNames.has(info.name)) return info.name;
  return null;
}

function transformStatement(item, currentOutput) {
  const transformer = context => {
    const { factory } = context;
    const visit = node => {
      if (ts.isShorthandPropertyAssignment(node)) {
        const replacement = shouldReplaceIdentifier(node.name, currentOutput);
        if (replacement) return factory.createPropertyAssignment(factory.createIdentifier(node.name.text), createCtxAccess(factory, replacement));
      }
      if (ts.isIdentifier(node)) {
        const replacement = shouldReplaceIdentifier(node, currentOutput);
        if (replacement) return createCtxAccess(factory, replacement);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return root => ts.visitNode(root, visit);
  };
  const result = ts.transform(item.statement, [transformer]);
  const transformed = result.transformed[0];
  result.dispose();
  return transformed;
}

function exposeLines(declarations) {
  const lines = [];
  for (const declaration of declarations) {
    if (declaration.kind === 'let' || declaration.kind === 'var') {
      lines.push(`ctx.defineMutable(${JSON.stringify(declaration.name)}, () => ${declaration.name}, value => { ${declaration.name} = value; });`);
    } else {
      lines.push(`ctx.expose(${JSON.stringify(declaration.name)}, ${declaration.name});`);
    }
  }
  return lines;
}

function installerName(file) {
  return 'install' + file.replace(/\.js$/, '').split(/[-_]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function indent(text, spaces = 2) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(line => line ? `${prefix}${line}` : '').join('\n');
}

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
const generatedFiles = new Map();
for (const [output, items] of statementGroups) {
  const chunks = [];
  for (const item of items) {
    const transformed = transformStatement(item, output);
    chunks.push(printer.printNode(ts.EmitHint.Unspecified, transformed, item.sourceFile));
    chunks.push(...exposeLines(item.declarations));
  }
  const body = chunks.filter(Boolean).map(chunk => indent(chunk)).join('\n');
  generatedFiles.set(output, `export function ${installerName(output)}(ctx) {\n${body}\n}\n`);
}

const appContext = `export function createAppContext() {\n  const context = Object.create(null);\n\n  Object.defineProperties(context, {\n    expose: {\n      enumerable: false,\n      value(name, value) {\n        Object.defineProperty(context, name, { configurable: true, enumerable: true, writable: true, value });\n        return value;\n      }\n    },\n    defineMutable: {\n      enumerable: false,\n      value(name, getValue, setValue) {\n        Object.defineProperty(context, name, {\n          configurable: true,\n          enumerable: true,\n          get: getValue,\n          set: setValue\n        });\n      }\n    }\n  });\n\n  return context;\n}\n`;
generatedFiles.set('app-context.js', appContext);

const installOrder = [
  'constants.js', 'state.js', 'text-utils.js', 'preferences.js', 'pcm-audio.js', 'wav-encoder.js',
  'diagnostics.js', 'gemini-errors.js', 'ui-connection.js', 'ui-create.js', 'ui-script.js',
  'script-validation.js', 'gemini-api.js', 'tts-chunking.js', 'tts-generation.js', 'ui-audio.js',
  'ui-status.js', 'script-generation.js', 'ui-events.js', 'indexeddb.js', 'media-cache.js',
  'voice-preview.js', 'conversation-preview.js', 'final-review.js'
];
for (const file of installOrder) if (!generatedFiles.has(file)) throw new Error(`Missing generated module ${file}`);
let main = `import { createAppContext } from './app-context.js';\n`;
for (const file of installOrder) main += `import { ${installerName(file)} } from './${file}';\n`;
main += `\nexport const app = createAppContext();\n\n`;
for (const file of installOrder) main += `${installerName(file)}(app);\n`;
generatedFiles.set('main.js', main);

const oldFiles = new Set(originalFiles);
const newFiles = new Set(generatedFiles.keys());
for (const file of oldFiles) if (!newFiles.has(file)) fs.rmSync(path.join(jsRoot, file), { force: true });
for (const [file, content] of generatedFiles) fs.writeFileSync(path.join(jsRoot, file), content, 'utf8');

let html = fs.readFileSync(path.join(projectRoot, 'src', 'index.html'), 'utf8');
html = html.replace(/\n\s*<script\s+defer\s+src="\.\/js\/[^"]+"><\/script>/g, '');
html = html.replace(/\n<\/body>/, `\n  <script type="module" src="./js/main.js"></script>\n\n</body>`);
fs.writeFileSync(path.join(projectRoot, 'src', 'index.html'), html, 'utf8');

// Keep persistence DOM-independent: queueSave coordinates the save-state indicator in UI status.
{
  const preferencesPath = path.join(jsRoot, 'preferences.js');
  let preferences = fs.readFileSync(preferencesPath, 'utf8');
  const queueSaveBlock = `  function queueSave() {\n      ctx.els.saveState.textContent = 'Saving…';\n      clearTimeout(ctx.saveTimer);\n      ctx.saveTimer = setTimeout(() => { savePreferences(); ctx.els.saveState.textContent = 'Saved locally'; }, 260);\n  }\n  ctx.expose("queueSave", queueSave);\n`;
  if (!preferences.includes(queueSaveBlock)) throw new Error('Expected queueSave block was not generated.');
  preferences = preferences.replace(queueSaveBlock, '');
  fs.writeFileSync(preferencesPath, preferences, 'utf8');

  const uiStatusPath = path.join(jsRoot, 'ui-status.js');
  let uiStatus = fs.readFileSync(uiStatusPath, 'utf8');
  const installerStart = 'export function installUiStatus(ctx) {\n';
  const uiQueueSave = `  function queueSave() {\n      ctx.els.saveState.textContent = 'Saving…';\n      clearTimeout(ctx.saveTimer);\n      ctx.saveTimer = setTimeout(() => { ctx.savePreferences(); ctx.els.saveState.textContent = 'Saved locally'; }, 260);\n  }\n  ctx.expose("queueSave", queueSave);\n`;
  if (!uiStatus.startsWith(installerStart)) throw new Error('Unexpected UI status module shape.');
  uiStatus = installerStart + uiQueueSave + uiStatus.slice(installerStart.length);
  fs.writeFileSync(uiStatusPath, uiStatus, 'utf8');
}

console.log('Generated modules:', [...generatedFiles.keys()].sort().join(', '));
