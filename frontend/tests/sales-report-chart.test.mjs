import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/salesReportChartData.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const { buildDailySalesTrend } = module.exports;

test('daily sales chart groups the business day and keeps collections, returns and expenses distinct', () => {
  const rows = buildDailySalesTrend([
    { kind: 'sale', date: '2026-10-20T07:00:00.000Z', amount: 118, revenue: 100 },
    { kind: 'collection', date: '2026-10-20T07:30:00.000Z', amount: 40 },
    { kind: 'sales-adjustment', date: '2026-10-20T08:15:00.000Z', amount: 20, revenue: -20 },
    { kind: 'expense', date: '2026-10-20T08:45:00.000Z', amount: 5 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { label: '10:00', sales: 118, netRevenue: 100, collections: 40, returns: 0, expenses: 0 });
  assert.deepEqual(rows[1], { label: '11:00', sales: 0, netRevenue: -20, collections: 0, returns: -20, expenses: -5 });
});

test('daily report chart switches to date buckets for a multi-day selection', () => {
  const rows = buildDailySalesTrend([
    { kind: 'sale', date: '2026-10-19T09:00:00.000Z', amount: 10 },
    { kind: 'sale', date: '2026-10-20T09:00:00.000Z', amount: 20 },
  ]);
  assert.deepEqual(rows.map((row) => row.label), ['19/10', '20/10']);
});
