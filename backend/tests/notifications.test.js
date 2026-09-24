import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySalesSummaryMessage, notifyOwnerOfSale } from '../src/utils/notifications.js';

test('builds a clear daily sales summary message for owner notifications', () => {
  const message = buildDailySalesSummaryMessage({
    salesCount: 3,
    totalRevenue: 1250000,
    totalDiscount: 50000,
    totalTax: 75000,
    currency: 'UGX',
    lowStockCount: 2,
    expiringSoonCount: 4,
  });

  assert.match(message, /3 sales/i);
  assert.match(message, /UGX 1,250,000/i);
  assert.match(message, /discount/i);
  assert.match(message, /2 low-stock/i);
  assert.match(message, /4 expiring soon/i);
});

for (const [ownerId, operatorId, expected] of [
  ['owner', 'staff', ['owner', 'staff']],
  ['owner', 'owner', ['owner']],
  [null, 'staff', ['staff']],
]) {
  test('sale delivery targets each recipient once: ' + expected.join(', '), async () => {
    const rows = [], pushes = [];
    const prismaClient = {
      user: { findFirst: async () => ownerId ? { id: ownerId } : null },
      tenant: { findUnique: async () => ({ currency: 'UGX' }) },
      notification: { create: async ({ data }) => {
        const row = { id: 'notification-' + rows.length, ...data };
        rows.push(row);
        return row;
      } },
    };
    await notifyOwnerOfSale({
      prismaClient, sendPush: async (userId, payload) => { pushes.push({ userId, payload }); },
      tenantId: 'test-tenant', user: { id: operatorId },
      sale: { id: 'test-sale', receiptNo: 'TEST-001', total: 12500 },
      itemDetails: [{ name: 'Rice', price: 12500 }],
    });
    assert.deepEqual(rows.map(row => row.userId), expected);
    assert.ok(rows.every(row => row.tenantId === 'test-tenant' && row.type === 'sale'));
    assert.ok(rows.every(row => row.metadata.saleId === 'test-sale'));
    assert.ok(rows.every(row => row.message.includes('UGX 12,500')));
    for (const { payload } of pushes) {
      assert.ok(Object.values(payload.data).every(value => typeof value === 'string'));
      assert.ok(payload.data.notificationId.startsWith('notification-'));
    }
  });
}
