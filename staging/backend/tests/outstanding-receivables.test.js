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

test('collectible historical rental balances appear as dated, referenceable aging documents', () => {
  const rows = buildOutstandingReceivableRows(
    [{ id: 'c', name: 'Customer', openingBalance: 0, balance: 180 }],
    [],
    [{ id: 'rental-1', customerId: 'c', rentalNo: 'HIST-20260101-ABC123', historicalReference: 'Receipt Book 00418', historicalReceivableAmount: 240, balance: 180, hireDate: '2026-01-02', expectedReturnDate: '2026-01-09' }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reference, 'Receipt Book 00418');
  assert.equal(rows[0].type, 'Historical Rental Receivable');
  assert.equal(rows[0].balance, 180);
  assert.equal(rows[0].amountPaid, 60);
  assert.equal(rows[0].dueDate, '2026-01-09');
});

test('checked-out rental balances appear separately from trade invoices in receivables aging', () => {
  const rows = buildOutstandingReceivableRows(
    [{ id: 'c', name: 'Customer', openingBalance: 0, balance: 350 }],
    [],
    [{ id: 'rental-2', customerId: 'c', rentalNo: 'HIRE-20261031', isHistoricalReceivable: false,
      isHistoricalRecord: false, bookingState: 'checked_out', totalAmount: 500, balance: 350,
      hireDate: '2026-10-31', expectedReturnDate: '2026-11-02' }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'Rental Receivable');
  assert.equal(rows[0].total, 500);
  assert.equal(rows[0].amountPaid, 150);
  assert.equal(rows[0].balance, 350);
});
