import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../src/', import.meta.url));
const notificationSource = readFileSync(root + '/lib/notificationDisplay.ts', 'utf8');
const notificationModule = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(notificationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(notificationModule.exports, require, notificationModule);
const { notificationActionLink } = notificationModule.exports;
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

test('stock alerts deep-link to a specific product stock-in form', () => {
  const bell = readFileSync(root + '/components/NotificationBell.tsx', 'utf8');
  const inventory = readFileSync(root + '/pages/InventoryPage.tsx', 'utf8');
  const backend = readFileSync(new URL('../../backend/src/utils/notifications.js', import.meta.url), 'utf8');
  assert.match(bell, /inventory\/products\?productId=\$\{encodeURIComponent\(String\(p\.id\)\)\}&stockAction=stock_in/);
  assert.match(backend, /productId=\$\{encodeURIComponent\(String\(product\.id\)\)\}&stockAction=stock_in/);
  assert.match(inventory, /await inventoryApi\.get\(productId\)/);
  assert.match(inventory, /openStockAdjust\(item, requestedAction\)/);
});

test('stock detail action is only available to users with stock-adjustment permission', () => {
  const link = '/tenant/inventory/products?productId=product-1&stockAction=stock_in';
  assert.equal(notificationActionLink(link, false), undefined);
  assert.equal(notificationActionLink(link, true), link);
  assert.equal(notificationActionLink('/tenant/reports', false), '/tenant/reports');
});
