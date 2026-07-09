import test from 'node:test';
import assert from 'node:assert/strict';
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
