import test from 'node:test';
import assert from 'node:assert/strict';
import { agingBucket, buildAgingReport } from '../src/utils/agingReport.js';

const asOf = new Date('2026-10-16T12:00:00.000Z');

test('aging assigns future, due-today, and overdue documents to explicit day bands', () => {
  assert.deepEqual(agingBucket('2026-10-20T00:00:00.000Z', asOf), { bucket: 'notDue', daysPastDue: 0, daysUntilDue: 4 });
  assert.deepEqual(agingBucket('2026-10-16T00:00:00.000Z', asOf), { bucket: 'current', daysPastDue: 0, daysUntilDue: 0 });
  assert.deepEqual(agingBucket('2026-10-15T00:00:00.000Z', asOf), { bucket: '1-30', daysPastDue: 1, daysUntilDue: 0 });
  assert.equal(agingBucket('2026-09-15T00:00:00.000Z', asOf).bucket, '31-60');
  assert.equal(agingBucket('2026-07-18T00:00:00.000Z', asOf).bucket, '61-90');
  assert.equal(agingBucket('2026-07-17T00:00:00.000Z', asOf).bucket, '90+');
});

test('aging report exposes document dates, balances, bucket totals and duplicate-name entities separately', () => {
  const report = buildAgingReport([
    { id: 'a', customerId: 'one', customer: 'Same Name', date: '2026-09-01', dueDate: '2026-09-15', total: 100, amountPaid: 30, balance: 70 },
    { id: 'b', customerId: 'two', customer: 'Same Name', date: '2026-10-01', dueDate: '2026-10-20', total: 50, amountPaid: 0, balance: 50 },
  ], { entityKey: 'customer', entityIdKey: 'customerId', asOfDate: asOf, title: 'Customer Aging Report' });

  assert.equal(report.data.length, 2);
  assert.equal(report.transactions[0].daysPastDue, 31);
  assert.equal(report.transactions[0].agingBucket, '31-60');
  assert.equal(report.transactions[0].date, '2026-09-01');
  assert.equal(report.buckets['31-60'], 70);
  assert.equal(report.buckets.notDue, 50);
  assert.equal(report.summary.totalOutstanding, 120);
});

test('documents without explicit due dates disclose that age uses the document date', () => {
  const report = buildAgingReport([
    { id: 'a', customerId: 'one', customer: 'Customer', date: '2026-10-01', balance: 20 },
  ], { entityKey: 'customer', entityIdKey: 'customerId', asOfDate: asOf, title: 'Customer Aging Report' });

  assert.equal(report.transactions[0].agingBasis, 'Document date (no due date set)');
  assert.equal(report.transactions[0].daysPastDue, 15);
});
