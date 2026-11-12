import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(path.join(root, 'src/pages/RolesPermissionsPage.tsx'), 'utf8');
const tenantHistory = readFileSync(path.join(root, 'src/components/customer/CustomerTransactionHistoryDialog.tsx'), 'utf8');
const backendRoute = readFileSync(path.join(root, '../backend/src/routes/propertyManagement.js'), 'utf8');
const permissionCatalog = readFileSync(path.join(root, 'src/components/Constants/permissions.ts'), 'utf8');

test('unchecking an individual or grouped permission sends false instead of omitting the key', () => {
  assert.match(page, /keys\.forEach\(\(key\) => \{ next\[key\] = checked \}\)/);
  assert.match(page, /onChange\(\{ \.\.\.values, \[key\]: checked \}\)/);
  assert.doesNotMatch(page, /delete next\[key\]/);
});

test('permission save verifies persisted values before reporting success', () => {
  assert.match(page, /const saved = await staffApi\.updatePermissions\(id, permissions\)/);
  assert.match(page, /const persisted = await staffApi\.getPermissions\(id\)/);
  assert.match(page, /Boolean\(permissions\[key\]\) !== Boolean\(savedPermissions\[key\]\)/);
  assert.match(page, /Boolean\(permissions\[key\]\) !== Boolean\(persisted\?\.\[key\]\)/);
});

test('tenant note follow-ups are separately permissioned, appended, and reloaded from storage', () => {
  assert.match(permissionCatalog, /id: 'canAddTenantNoteFollowUps'/);
  assert.match(tenantHistory, /notes\/\$\{noteId\}\/follow-ups/);
  assert.match(tenantHistory, /note\.followUps\.map\(followUp/);
  assert.match(backendRoute, /router\.post\('\/customers\/:customerId\/notes\/:noteId\/follow-ups', requirePermission\('canAddTenantNoteFollowUps'\)/);
  assert.match(backendRoute, /tx\.propertyTenantNoteFollowUp\.create/);
  assert.match(backendRoute, /idempotencyKey/);
});
