import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJobRequests, prepareSaleServiceJobs, createSaleServiceJobs, saveProductServiceLinks, saleJobReportRow, applySaleServiceRevenueSplit } from '../src/services/saleServiceJobs.js';

const scope = { tenantId: 'tenant-a', branchId: 'branch-a' };
const job = () => ({ serviceProductId: 'service-a', technicianId: 'tech-a', description: 'Install the purchased equipment', priority: 'normal' });
const item = (type = 'product') => ({ id: 'sale-item-a', productId: type === 'service' ? 'service-a' : 'product-a', productName: 'Equipment', itemType: type, quantity: 2, jobRequests: normalizeJobRequests([job()]) });
const request = (permissions = ['canCreateServiceJobCard', 'canAssignServiceJobCard']) => ({ user: { id: 'cashier-a', permissions } });
function fixture({ linked = true, technicianUserId = 'tech-login', services = true } = {}) {
  return {
    product: { findMany: async ({ where }) => { assert.equal(where.tenantId, scope.tenantId); return services ? [{ id: 'service-a', name: 'Installation', branchId: scope.branchId, price: 30 }] : []; } },
    serviceTechnician: { findMany: async ({ where }) => { assert.equal(where.tenantId, scope.tenantId); assert.deepEqual(where.OR, [{ branchId: scope.branchId }, { branchId: null }]); return [{ id: 'tech-a', userId: technicianUserId }]; } },
    productServiceLink: { findMany: async () => linked ? [{ productId: 'product-a', serviceProductId: 'service-a' }] : [] },
  };
}

test('job requests reject duplicate services, missing assignments and invalid details', () => {
  for (const value of [{}, [job(), job()], [{ ...job(), technicianId: '' }], [{ ...job(), description: '' }], [{ ...job(), scheduledStart: 'invalid' }], [{ ...job(), priority: 'unknown' }]]) assert.throws(() => normalizeJobRequests(value));
  assert.deepEqual(normalizeJobRequests(undefined), []);
});

test('included service requires the saved product link and a named customer', async () => {
  const selected = item();
  await prepareSaleServiceJobs(fixture(), request(), scope, [selected], 'Alice');
  assert.equal(selected.jobRequests[0].serviceSource, 'included_service');
  await assert.rejects(prepareSaleServiceJobs(fixture({ linked: false }), request(), scope, [item()], 'Alice'), /no longer included/);
  await assert.rejects(prepareSaleServiceJobs(fixture(), request(), scope, [item()], ''), /Customer name/);
  await assert.rejects(prepareSaleServiceJobs(fixture({ services: false }), request(), scope, [item()], 'Alice'), /unavailable/);
});

test('additional paid service creates its own linked job without a free-service link', async () => {
  const selected = item('service');
  await prepareSaleServiceJobs(fixture({ linked: false }), request(), scope, [selected], 'Alice');
  assert.equal(selected.jobRequests[0].serviceSource, 'paid_service');
});

test('sale permission does not grant job creation or assignment to other technicians', async () => {
  await assert.rejects(prepareSaleServiceJobs(fixture(), request(['canCreateSale']), scope, [item()], 'Alice'), error => error.statusCode === 403);
  await assert.rejects(prepareSaleServiceJobs(fixture(), request(['canCreateServiceJobCard']), scope, [item()], 'Alice'), error => error.statusCode === 403);
  await prepareSaleServiceJobs(fixture({ technicianUserId: 'cashier-a' }), request(['canCreateServiceJobCard']), scope, [item()], 'Alice');
});

test('job persistence keeps receipt, customer, quantity, cashier and allocated service revenue', async () => {
  const selected = item();
  await prepareSaleServiceJobs(fixture(), request(), scope, [selected], 'Alice');
  selected.cost = 20;
  selected.total = 140;
  applySaleServiceRevenueSplit([selected]);
  const notifications = [];
  const tx = { serviceJobCard: { create: async ({ data }) => ({ id: 'job-a', ...data, technician: { name: 'Technician A' } }) }, notification: { create: async ({ data }) => notifications.push(data) } };
  const [card] = await createSaleServiceJobs(tx, { id: 'sale-a', receiptNo: 'RCP-A', tenantId: scope.tenantId, branchId: scope.branchId, userId: 'cashier-a', customerName: 'Alice' }, [selected]);
  assert.equal(card.saleItemId, selected.id);
  assert.equal(card.customerName, 'Alice');
  assert.equal(card.serviceQuantity, 2);
  assert.equal(card.createdByUserId, 'cashier-a');
  assert.equal(card.totalCost, 0);
  assert.equal(card.laborCost, 0);
  assert.equal(card.status, 'pending');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].metadata.link, '/tenant/service/job-cards?jobCardId=job-a');
  const row = saleJobReportRow({ ...card, sale: { user: { fname: 'Cashier', lname: 'A' }, status: 'completed' } });
  assert.equal(row.source, 'Included free');
  assert.equal(row.servicePrice, 30);
  assert.equal(row.serviceRevenue, 60);
  assert.equal(row.cashier, 'Cashier A');
  assert.equal(row.technician, 'Technician A');
});

test('included service revenue is split from product selling price after product cost', async () => {
  const selected = { ...item(), quantity: 2, cost: 35, total: 120 };
  await prepareSaleServiceJobs(fixture(), request(), scope, [selected], 'Alice');
  applySaleServiceRevenueSplit([selected]);
  assert.equal(selected.serviceRevenue, 50);
  assert.equal(selected.productRevenue, 70);
  assert.equal(selected.jobRequests[0].servicePrice, 30);
  assert.equal(selected.jobRequests[0].serviceRevenue, 50);

  const highMargin = { ...item(), quantity: 2, cost: 20, total: 140 };
  await prepareSaleServiceJobs(fixture(), request(), scope, [highMargin], 'Alice');
  applySaleServiceRevenueSplit([highMargin]);
  assert.equal(highMargin.serviceRevenue, 60);
  assert.equal(highMargin.productRevenue, 80);

  const paidService = item('service');
  paidService.total = 75;
  await prepareSaleServiceJobs(fixture({ linked: false }), request(), scope, [paidService], 'Alice');
  applySaleServiceRevenueSplit([paidService]);
  assert.equal(paidService.productRevenue, 0);
  assert.equal(paidService.serviceRevenue, 75);
});

test('links can be saved from either catalog and reject unavailable or cross-branch items before writes', async () => {
  for (const itemType of ['product', 'service']) {
    const writes = [];
    const product = { id: 'own', tenantId: scope.tenantId, branchId: scope.branchId, itemType };
    const db = { product: { findMany: async () => [{ id: 'counterpart', branchId: scope.branchId }] }, productServiceLink: { deleteMany: async data => writes.push(data), createMany: async data => writes.push(data) } };
    await saveProductServiceLinks(db, product, ['counterpart']);
    assert.equal(writes[1].data[0].productId, itemType === 'product' ? 'own' : 'counterpart');
    assert.equal(writes[1].data[0].serviceProductId, itemType === 'service' ? 'own' : 'counterpart');
    writes.length = 0;
    db.product.findMany = async () => [{ id: 'counterpart', branchId: 'another-branch' }];
    await assert.rejects(saveProductServiceLinks(db, product, ['counterpart']), /this business and branch/);
    assert.equal(writes.length, 0);
  }
});
