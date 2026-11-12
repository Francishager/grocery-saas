import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklySalesTrend, currentWeekRange, percentageChange } from '../src/utils/weeklySalesReport.js';
import { transformSalesData } from '../src/utils/enrichedReportTransform.js';

test('current weekly range starts Monday and ends Sunday', () => {
  assert.deepEqual(currentWeekRange('2026-10-24'), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(currentWeekRange('2026-10-19'), { from: '2026-10-19', to: '2026-10-25' });
});

test('weekly trend fills quiet days and separates gross, net revenue, tax, discount and count', () => {
  const rows = buildWeeklySalesTrend([
    { createdAt: new Date('2026-10-19T09:00:00.000Z'), total: 118, tax: 18, discount: 5, cashDiscount: 2 },
    { createdAt: new Date('2026-10-19T14:00:00.000Z'), total: 50, tax: 0, discount: 0 },
  ], { from: '2026-10-19', to: '2026-10-25', timeZone: 'Africa/Kampala' });
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], { date: '2026-10-19', label: 'Mon 19 Oct', salesCount: 2, grossSales: 168, revenue: 150, tax: 18, discount: 7 });
  assert.equal(rows[1].grossSales, 0);
});

test('week comparisons distinguish a newly active period from a zero change', () => {
  assert.deepEqual(percentageChange(250, 0), { amount: 250, percent: null, direction: 'new' });
  assert.deepEqual(percentageChange(250, 250), { amount: 0, percent: 0, direction: 'unchanged' });
});

test('sales report item details count array entries instead of stringifying objects', () => {
  const report = transformSalesData([{ id: 'sale-1', items: [{ name: 'Rice' }, { name: 'Beans' }] }]);
  assert.match(report.transactions[0].details, /^Items: 2,/);
  assert.doesNotMatch(report.transactions[0].details, /\[object Object\]/);
});
