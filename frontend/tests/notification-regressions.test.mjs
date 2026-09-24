import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../src/', import.meta.url));
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = dir + '/' + entry.name;
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(path) ? [path] : [];
  });
}

test('every page uses in-app feedback and awaits confirmation before proceeding', () => {
  const violations = [];
  for (const path of sourceFiles(root)) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        if (['alert', 'window.alert', 'confirm', 'window.confirm', 'prompt', 'window.prompt'].includes(name)) violations.push(path + ': native ' + name);
        if (['appConfirm', 'appPrompt'].includes(name) && !ts.isAwaitExpression(node.parent)) violations.push(path + ': confirmation must be awaited');
      }
      if (ts.isNewExpression(node) && ['Notification', 'window.Notification'].includes(node.expression.getText(source))) violations.push(path + ': native foreground notification');
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(violations, []);
});

test('global feedback hosts remain mounted and sale/print messages can coexist', () => {
  const app = readFileSync(root + '/App.tsx', 'utf8');
  assert.match(app, /<AppFeedback\s*\/>/);
  assert.match(app, /<Toaster\s*\/>/);
  const limit = readFileSync(root + '/hooks/use-toast.ts', 'utf8').match(/TOAST_LIMIT\s*=\s*(\d+)/);
  assert.ok(Number(limit?.[1]) >= 4);
});
