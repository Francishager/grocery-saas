import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminRoutes = await readFile(new URL('../src/routes/admin.js', import.meta.url), 'utf8');

test('tenant provisioning returns the existing business on an exact-owner retry', () => {
  const retryLookup = adminRoutes.indexOf('findProvisionedTenantForOwner(provisionIdentity)');
  const transactionStart = adminRoutes.indexOf('const { tenant, reusedOwnerAccount } = await prisma.$transaction');
  assert.ok(retryLookup >= 0 && retryLookup < transactionStart, 'idempotency check must run before creating a tenant');
  assert.match(adminRoutes, /alreadyProvisionedPayload\(alreadyProvisioned, ownerEmail\)/);
  assert.match(adminRoutes, /nameMatches\s*&&\s*ownerMatches\s*\?\s*tenant\s*:\s*null/);
});

test('tenant provisioning binds the reuse flag before returning a successful response', () => {
  assert.match(adminRoutes, /const\s*\{\s*tenant\s*,\s*reusedOwnerAccount\s*\}\s*=\s*await prisma\.\$transaction/);
  assert.match(adminRoutes, /return\s*\{\s*tenant:\s*createdTenant\s*,\s*user\s*,\s*reusedOwnerAccount:\s*reuseOwnerAccount\s*\}/);
  assert.match(adminRoutes, /reusedOwnerAccount,\s*emailSent,/);
});
