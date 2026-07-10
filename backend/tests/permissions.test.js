import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveEffectivePermissions } from '../src/utils/permissions.js';

test('returns explicit permissions from a user permission record', () => {
  const result = resolveEffectivePermissions(
    { role: 'manager' },
    { canViewDashboard: true, canCreateSale: false, canViewSale: true }
  );

  assert.deepEqual(result, ['canViewDashboard', 'canViewSale']);
});

test('returns full permissions for owners and platform admins', () => {
  const ownerPermissions = resolveEffectivePermissions({ role: 'owner' });
  const platformPermissions = resolveEffectivePermissions({ role: 'saas_admin' });

  assert.ok(ownerPermissions.includes('canViewDashboard'));
  assert.ok(ownerPermissions.includes('canCreateSale'));
  assert.deepEqual(platformPermissions, ['*']);
});

test('owner permissions respect tenant feature access', () => {
  const allowed = resolveEffectivePermissions({ role: 'owner' }, null, [], new Set(['inventory.products', 'sales']));
  const denied = resolveEffectivePermissions({ role: 'owner' }, null, [], new Set(['sales']));

  assert.ok(allowed.includes('canCreateProduct'));
  assert.ok(allowed.includes('canCreateSale'));
  assert.ok(!denied.includes('canCreateProduct'));
  assert.ok(denied.includes('canViewDashboard'));
});

test('prisma schema exposes the staff till sheet permission field', () => {
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(schema, /canViewStaffTillSheet\s+Boolean/);
});
