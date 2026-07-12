import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySalesSummaryMessage } from '../src/utils/notifications.js';

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
