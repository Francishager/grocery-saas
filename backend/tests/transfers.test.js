import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDestinationProduct } from '../routes/transfers.js';

test('destination product is matched by branch-local SKU or barcode, not source product id', async () => {
  const destination = { id: 'branch-product', sku: 'RICE-1', barcode: '001' };
  const db = { product: { findMany: async ({ where }) => {
    assert.equal(where.tenantId, 'tenant');
    assert.equal(where.branchId, 'branch-b');
    return [destination];
  } } };
  assert.equal(await matchDestinationProduct(db, { id: 'source-product', sku: 'RICE-1', barcode: '001' }, 'branch-b', 'tenant'), destination);
});

test('conflicting SKU and barcode matches fail instead of adding stock to the wrong item', async () => {
  const db = { product: { findMany: async () => [
    { id: 'sku-match', sku: 'RICE-1', barcode: 'different' },
    { id: 'barcode-match', sku: 'different', barcode: '001' },
  ] } };
  await assert.rejects(
    () => matchDestinationProduct(db, { name: 'Rice', sku: 'RICE-1', barcode: '001' }, 'branch-b', 'tenant'),
    (error) => error.statusCode === 409,
  );
});

test('legacy products without identifiers only match an unambiguous name, size and brand', async () => {
  const db = { product: { findMany: async () => [
    { id: 'legacy-destination', name: 'Rice', size: '50kg', brand: 'Farm' },
  ] } };
  assert.equal((await matchDestinationProduct(db, { name: 'Rice', size: '50kg', brand: 'Farm' }, 'branch-b', 'tenant')).id, 'legacy-destination');
  db.product.findMany = async () => [
    { id: 'one', name: 'Rice', size: '50kg', brand: 'Farm' },
    { id: 'two', name: 'Rice', size: '50kg', brand: 'Farm' },
  ];
  assert.equal(await matchDestinationProduct(db, { name: 'Rice', size: '50kg', brand: 'Farm' }, 'branch-b', 'tenant'), null);
});
