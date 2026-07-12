import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSupplierStatementData, buildDecisionSupportSummary } from '../src/utils/reportingHelpers.js';

test('buildSupplierStatementData summarizes purchases and payments', () => {
  const result = buildSupplierStatementData(
    { id: 'sup-1', name: 'North Foods' },
    [
      { id: 'po-1', refNo: 'PO-100', total: 1000, balance: 400, createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'po-2', refNo: 'PO-101', total: 500, balance: 0, createdAt: '2024-01-15T00:00:00.000Z' },
    ],
    [
      { id: 'pay-1', amount: 600, createdAt: '2024-01-10T00:00:00.000Z' },
    ]
  );

  assert.equal(result.summary.totalPurchases, 1500);
  assert.equal(result.summary.totalPayments, 600);
  assert.equal(result.summary.openBalance, 400);
  assert.equal(result.openPurchases.length, 1);
  assert.equal(result.openPurchases[0].refNo, 'PO-100');
});

test('buildDecisionSupportSummary highlights finance and inventory risks', () => {
  const result = buildDecisionSupportSummary({
    sales: [{ total: 5000 }],
    purchases: [{ total: 2500 }],
    products: [
      { quantity: 2, minStock: 5, expiryDate: new Date('2024-02-01T00:00:00.000Z') },
      { quantity: 1, minStock: 5, expiryDate: null },
    ],
    expenses: [{ amount: 1000 }],
    suppliers: [{ balance: 300 }],
  });

  assert.equal(result.grossProfit, 2500);
  assert.equal(result.netProfit, 1500);
  assert.equal(result.lowStockProducts, 2);
  assert.equal(result.expiringSoonProducts, 1);
  assert.equal(result.supplierBalanceTotal, 300);
});
