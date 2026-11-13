import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUsageLimit, getTenantLimits } from '../src/utils/usageLimits.js';

function client({ maxBranches = 2, branchCount = 1 } = {}) {
  return {
    tenant: { findUnique: async () => ({ plan: { maxUsers: 5, maxProducts: 100, maxBranches, maxCustomers: 100, maxSuppliers: 50 }, usageLimit: null }) },
    branch: { count: async () => branchCount },
  };
}

test('effective branch cap comes from the plan when there is no tenant override', async () => {
  const limits = await getTenantLimits('tenant', client({ maxBranches: 2 }));
  assert.equal(limits.maxBranches, 2);
});

test('branch creation is denied when the tenant has reached its effective cap', async () => {
  await assert.rejects(
    () => checkUsageLimit('tenant', 'branches', client({ maxBranches: 2, branchCount: 2 })),
    (error) => error.code === 'LIMIT_REACHED' && error.statusCode === 403,
  );
});

test('branch creation remains available below the effective cap', async () => {
  await assert.doesNotReject(() => checkUsageLimit('tenant', 'branches', client({ maxBranches: 2, branchCount: 1 })));
});
