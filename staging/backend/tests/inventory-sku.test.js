import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUniqueSku, buildSkuBase } from '../src/routes/inventory.js';

class FakePrisma {
  constructor(existingSkus = []) {
    this.existingSkus = new Set(existingSkus);
  }

  product = {
    findFirst: async ({ where }) => {
      const sku = where?.sku;
      return this.existingSkus.has(sku) ? { id: 'existing' } : null;
    },
  };
}

test('buildSkuBase returns a category-based prefix when category is present', () => {
  assert.equal(buildSkuBase('Milk Powder', { name: 'Beverages', slug: 'beverages' }), 'BEV');
});

test('resolveUniqueSku generates a dynamic SKU that is not a static 0001 fallback', async () => {
  const prisma = new FakePrisma([]);
  const sku = await resolveUniqueSku(prisma, 'tenant-a', 'branch-a', 'Organic Milk', 'product', { name: 'Food', slug: 'food' });

  assert.match(sku, /^FOO-\d{6}-\d{4}$/);
  assert.notEqual(sku, 'FOO-0001');
});
