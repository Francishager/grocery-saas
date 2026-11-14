import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlatformRole, loginPortalMatchesUser } from '../src/utils/loginPortal.js';

test('tenant credentials are accepted only by the tenant portal', () => {
  const tenantUser = { role: 'owner', tenantId: 'tenant-1' };
  assert.equal(loginPortalMatchesUser(tenantUser, 'tenant'), true);
  assert.equal(loginPortalMatchesUser(tenantUser, 'saas_admin'), false);
});

test('platform credentials are accepted only by the SaaS Admin portal', () => {
  for (const role of ['saas_admin', 'platform_staff', 'platform_admin', 'super_admin']) {
    assert.equal(isPlatformRole(role), true);
    assert.equal(loginPortalMatchesUser({ role }, 'saas_admin'), true);
    assert.equal(loginPortalMatchesUser({ role, tenantId: 'unexpected' }, 'tenant'), false);
  }
});

test('tenant portal rejects users without a tenant and invalid portal values', () => {
  assert.equal(loginPortalMatchesUser({ role: 'owner' }, 'tenant'), false);
  assert.equal(loginPortalMatchesUser({ role: 'owner', tenantId: 'tenant-1' }, 'admin'), false);
  assert.equal(loginPortalMatchesUser(null, 'tenant'), false);
});
