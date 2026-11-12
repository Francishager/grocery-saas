import test from 'node:test';
import assert from 'node:assert/strict';
import { canDelegatePlatformPermissions, PLATFORM_JOB_PRESETS, platformPermissionForRequest, sanitizePlatformPermissions } from '../src/utils/platformPermissions.js';
import { resolveEffectivePermissions } from '../src/utils/permissions.js';

test('platform staff only receive allowlisted platform permissions, never tenant permissions', () => {
  assert.deepEqual(sanitizePlatformPermissions(['view_all_tenants', 'canDeleteSale', 'view_all_tenants']), ['view_all_tenants']);
  assert.deepEqual(resolveEffectivePermissions({ role: 'platform_staff' }, { canDeleteSale: true, platformPermissions: ['view_all_tenants'] }), ['view_all_tenants']);
  assert.equal(canDelegatePlatformPermissions(['view_all_tenants'], ['view_all_tenants']), true);
  assert.equal(canDelegatePlatformPermissions(['view_all_tenants'], ['manage_tenants']), false);
});

test('platform job presets are narrow and route permissions distinguish view from changes', () => {
  assert.ok(PLATFORM_JOB_PRESETS.find((preset) => preset.id === 'billing_officer').permissions.includes('manage_tenant_billing'));
  assert.equal(platformPermissionForRequest('GET', '/api/admin/businesses'), 'view_all_tenants');
  assert.equal(platformPermissionForRequest('POST', '/api/admin/businesses'), 'manage_tenants');
  assert.equal(platformPermissionForRequest('GET', '/api/admin/subscription-payments'), 'view_tenant_billing');
  assert.equal(platformPermissionForRequest('POST', '/api/admin/subscription-payments/x/cancel'), 'manage_tenant_billing');
  assert.equal(platformPermissionForRequest('DELETE', '/api/unknown-admin-data'), null);
});
