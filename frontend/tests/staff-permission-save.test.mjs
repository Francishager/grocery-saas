import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(path.join(root, 'src/pages/RolesPermissionsPage.tsx'), 'utf8');

test('unchecking an individual or grouped permission sends false instead of omitting the key', () => {
  assert.match(page, /keys\.forEach\(\(key\) => \{ next\[key\] = checked \}\)/);
  assert.match(page, /onChange\(\{ \.\.\.values, \[key\]: checked \}\)/);
  assert.doesNotMatch(page, /delete next\[key\]/);
});

test('permission save verifies persisted values before reporting success', () => {
  assert.match(page, /const saved = await staffApi\.updatePermissions\(id, permissions\)/);
  assert.match(page, /const persisted = await staffApi\.getPermissions\(id\)/);
  assert.match(page, /savedPermissions\[key\].*!== Boolean\(persisted\?\.\[key\]\)/);
});
