import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;
const projectRoot = path.resolve('gemini-podcast-studio');
const jsRoot = path.join(projectRoot, 'src', 'js');
const indexHtml = await readFile(path.join(projectRoot, 'src', 'index.html'), 'utf8');
const orderedFiles = [...indexHtml.matchAll(/<script\s+defer\s+src="\.\/js\/([^"]+)"/g)].map(match => match[1]);
const allFiles = orderedFiles.length ? orderedFiles : (await readdir(jsRoot)).filter(file => file.endsWith('.js')).sort();
const parsed = new Map();
const declarationOwner = new Map();

function bindingNames(node, names = []) {
  if (!node) return names;
  if (node.type === 'Identifier') names.push(node.name);
  else if (node.type === 'ObjectPattern') node.properties.forEach(property => bindingNames(property.value || property.argument, names));
  else if (node.type === 'ArrayPattern') node.elements.forEach(element => bindingNames(element, names));
  else if (node.type === 'RestElement') bindingNames(node.argument, names);
  else if (node.type === 'AssignmentPattern') bindingNames(node.left, names);
  return names;
}

for (const file of allFiles) {
  const source = await readFile(path.join(jsRoot, file), 'utf8');
  const ast = parse(source, { sourceType: 'script', plugins: ['optionalChaining', 'nullishCoalescingOperator', 'classProperties', 'topLevelAwait'] });
  const declarations = [];
  for (const statement of ast.program.body) {
    if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
      if (statement.id?.name) declarations.push({ name: statement.id.name, kind: statement.type === 'FunctionDeclaration' ? 'function' : 'class' });
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        for (const name of bindingNames(declarator.id)) declarations.push({ name, kind: statement.kind });
      }
    }
  }
  parsed.set(file, { source, ast, declarations });
  for (const declaration of declarations) {
    if (!declarationOwner.has(declaration.name)) declarationOwner.set(declaration.name, []);
    declarationOwner.get(declaration.name).push(file);
  }
}

const report = { order: allFiles, duplicateDeclarations: {}, files: {} };
for (const [name, owners] of declarationOwner) if (owners.length > 1) report.duplicateDeclarations[name] = owners;

for (const file of allFiles) {
  const { ast, declarations } = parsed.get(file);
  const dependencies = new Map();
  const externalAssignments = [];
  const localDeclarationNames = new Set(declarations.map(item => item.name));
  traverse(ast, {
    ReferencedIdentifier(pathRef) {
      const name = pathRef.node.name;
      if (pathRef.scope.hasBinding(name)) return;
      const owners = declarationOwner.get(name);
      if (!owners) return;
      const owner = owners.find(candidate => candidate !== file) || owners[0];
      if (owner === file && localDeclarationNames.has(name)) return;
      dependencies.set(name, owner);
    },
    AssignmentExpression(pathRef) {
      const left = pathRef.get('left');
      if (!left.isIdentifier()) return;
      const name = left.node.name;
      if (left.scope.hasBinding(name)) return;
      const owners = declarationOwner.get(name);
      if (owners) externalAssignments.push({ name, owner: owners[0], operator: pathRef.node.operator, line: pathRef.node.loc?.start.line || 0 });
    },
    UpdateExpression(pathRef) {
      const argument = pathRef.get('argument');
      if (!argument.isIdentifier()) return;
      const name = argument.node.name;
      if (argument.scope.hasBinding(name)) return;
      const owners = declarationOwner.get(name);
      if (owners) externalAssignments.push({ name, owner: owners[0], operator: pathRef.node.operator, line: pathRef.node.loc?.start.line || 0 });
    }
  });
  report.files[file] = {
    declarations,
    dependencies: [...dependencies].map(([name, owner]) => ({ name, owner })).sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name)),
    externalAssignments
  };
}

const output = JSON.stringify(report, null, 2);
await writeFile('.module-analysis.json', `${output}\n`, 'utf8');
console.log('MODULE_ANALYSIS_BEGIN');
console.log(output);
console.log('MODULE_ANALYSIS_END');
