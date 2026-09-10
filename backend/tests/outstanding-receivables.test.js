import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutstandingReceivableRows } from '../src/utils/outstandingReceivables.js';

test('existing credit from a returned paid sale reduces remaining customer exposure', () => {
  const customers = [{ id: 'customer', name: 'John', openingBalance: 0, balance: 21000 }];
  const sales = [{ id: 'sale', customerId: 'customer', receiptNo: 'SALE-2', total: 25000,
    amountPaid: 2000, balance: 23000, paymentStatus: 'partial', createdAt: '2026-09-09' }];
  const rows = buildOutstandingReceivableRows(customers, sales);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 21000);
  assert.equal(rows[0].creditApplied, 2000);
  assert.equal(rows[0].credit, 4000);
  assert.equal(sales[0].balance, 23000);
});

test('payments already covering opening debt do not reappear in aging', () => {
  const rows = buildOutstandingReceivableRows([{ id: 'c', name: 'Customer', openingBalance: 100, balance: 50 }],
    [{ id: 's', customerId: 'c', balance: 50, total: 50, amountPaid: 0, createdAt: '2026-09-10' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 's');
  assert.equal(rows[0].balance, 50);
});

test('a fully credited customer has no outstanding or aging rows', () => {
  const rows = buildOutstandingReceivableRows([{ id: 'c', name: 'Customer', openingBalance: 100, balance: -20 }],
    [{ id: 's', customerId: 'c', balance: 50, total: 50, amountPaid: 0 }]);
  assert.deepEqual(rows, []);
});
