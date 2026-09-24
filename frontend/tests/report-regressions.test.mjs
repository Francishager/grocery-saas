import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Exercise the real component and click callbacks with a deterministic hook
// harness. Only presentation wrappers and formatting are replaced, not report logic.
const bundle = await build({
  stdin: { contents: `import Report from './src/components/DailyBusinessReport';
    import {begin, reset} from 'react';
    export {reset}; export function render(data) { begin(); return Report({data}); }`,
    resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react/jsx-runtime', 'lucide-react'],
  plugins: [{ name: 'report-test-presentation', setup(builder) {
    builder.onResolve({ filter: /^(react|@\/components\/ui\/.*|@\/lib\/utils|@\/components\/customer\/CustomerTransactionHistoryDialog)$/ },
      ({ path }) => ({ path, namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: name }) => {
      if (name === 'react') return { contents: `let state = []; let cursor = 0;
        export const reset = () => { state = []; cursor = 0; };
        export const begin = () => { cursor = 0; };
        export const useMemo = (fn) => fn();
        export function useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        }` };
      if (name.endsWith('/utils')) return { contents: `export const formatCurrency = n => 'UGX ' + Number(n).toFixed(2);
        export const formatDisplayDate = value => String(value || '');` };
      if (name.endsWith('/card')) return { contents: `export const Card='section', CardContent='div', CardHeader='header', CardTitle='h2';` };
      if (name.endsWith('/button')) return { contents: `export const Button='button';` };
      if (name.endsWith('/badge')) return { contents: `export const Badge='span';` };
      return { contents: 'export default function CustomerHistory() { return null; }' };
    });
  } }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const { render, reset } = module.exports;

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  if (tree && typeof tree === 'object') return textOf(tree.props?.children);
  return tree == null ? '' : String(tree);
}
function card(tree, label) {
  const found = nodes(tree).find((node) => node.type === 'button' && node.key === label);
  assert.ok(found, `Missing card: ${label}`);
  return found;
}
function amount(tree, label) {
  const value = textOf(card(tree, label)).match(/UGX (-?\d+\.\d+)/);
  assert.ok(value, `Missing amount: ${label}`);
  return Number(value[1]);
}
function drilldown(data, label) {
  card(render(data), label).props.onClick();
  const dialog = nodes(render(data)).find((node) => node.props?.drilldown?.title === label);
  assert.ok(dialog, `Missing details: ${label}`);
  return dialog.props.drilldown.rows;
}
const total = rows => rows.reduce((sum, row) => sum + row.amount, 0);

test.beforeEach(reset);

test('stale zero summaries are corrected from loaded report rows', () => {
  const tree = render({
    summary: { totalSales: 0, cashSales: 0, creditSales: 0, debtCollections: 0, expenses: 0 },
    cashMovement: { cashAtHand: 0, netCashMovement: 0 },
    profitability: { grossProfit: 0, netProfit: 0 },
    transactions: [
      { id: 'sale', kind: 'sale', paymentMethod: 'cash', amount: 500, debit: 500, cogs: 100 },
      { id: 'payment', kind: 'collection', paymentMethod: 'cash', amount: 100 },
      { id: 'expense', kind: 'expense', paymentMethod: 'cash', amount: 50 },
    ],
  });
  assert.equal(amount(tree, 'Total Sales'), 500);
  assert.equal(amount(tree, 'Cash Sales'), 500);
  assert.equal(amount(tree, 'Credit Sales'), 0);
  assert.equal(amount(tree, 'Debt Collections'), 100);
  assert.equal(amount(tree, 'Expenses'), 50);
  assert.equal(amount(tree, 'Cash at Hand'), 550);
  assert.equal(amount(tree, 'Net Cash Movement'), 550);
  assert.equal(amount(tree, 'Gross Profit'), 400);
  assert.equal(amount(tree, 'Net Profit'), 350);
});

test('real empty zero balances stay zero when there are no detail rows', () => {
  const tree = render({
    summary: { totalSales: 0, cashSales: 0, creditSales: 0, debtCollections: 0, expenses: 0 },
    cashMovement: { cashAtHand: 0, netCashMovement: 0 },
    profitability: { grossProfit: 0, netProfit: 0 },
    transactions: [],
    expenses: [],
  });
  for (const label of ['Total Sales', 'Cash Sales', 'Credit Sales', 'Debt Collections', 'Expenses',
    'Cash at Hand', 'Net Cash Movement', 'Gross Profit', 'Net Profit']) assert.equal(amount(tree, label), 0, label);
});

test('missing business header and an empty response cannot crash the report', () => {
  for (const input of [undefined, null, {}, { summary: {} }]) {
    const tree = render(input);
    assert.match(textOf(tree), /Daily Business Report/);
    assert.equal(amount(tree, 'Cash at Hand'), 0);
  }
});

test('Cash at Hand details include opening float but Net Cash Movement details do not', () => {
  const data = { header: { date: '2026-09-23' },
    cashMovement: { openingCash: 100, cashAtHand: 400, netCashMovement: 300 },
    cashLedger: [
      { id: 'sale', amount: 500, debit: 500, credit: 0 },
      { id: 'refund', amount: -200, debit: 0, credit: 200 },
    ],
  };
  assert.equal(total(drilldown(data, 'Cash at Hand')), amount(render(data), 'Cash at Hand'));
  assert.equal(total(drilldown(data, 'Net Cash Movement')), amount(render(data), 'Net Cash Movement'));
  assert.equal(data.cashLedger.length, 2, 'opening rows must not mutate the API ledger');
});

test('partially paid credit invoices split cash and credit card details without counting the full invoice twice', () => {
  const data = { summary: { cashSales: 200, creditSales: 800 }, transactions: [
    { id: 'invoice', kind: 'credit-sale', paymentMethod: 'credit', amount: 1000,
      cashAmount: 200, creditAmount: 800, paidByMethod: { cash: 200 } },
  ] };
  assert.equal(total(drilldown(data, 'Cash Sales')), 200);
  assert.equal(total(drilldown(data, 'Credit Sales')), 800);
  assert.equal(amount(render(data), 'Cash Sales'), 200);
  assert.equal(amount(render(data), 'Credit Sales'), 800);
});

test('gross/net profit drilldowns use revenue minus saved COGS and signed expense reversals', () => {
  const data = { profitability: { grossProfit: 400, netProfit: 320 }, transactions: [
    { id: 'sale', kind: 'sale', paymentMethod: 'cash', amount: 1180, revenue: 1000, cogs: 600 },
    { id: 'expense', kind: 'expense', amount: 100, paymentMethod: 'accrual', cashImpact: false },
    { id: 'reversal', kind: 'expense', amount: -20, paymentMethod: 'accrual', cashImpact: false },
  ] };
  assert.equal(total(drilldown(data, 'Gross Profit')), 400);
  assert.equal(total(drilldown(data, 'Net Profit')), 320);
  assert.equal(amount(render(data), 'Expenses'), 80);
});

test('fallback cash calculation subtracts a transfer once, not its destination breakdown again', () => {
  const tree = render({ cashMovement: { openingCash: 100, cashTransfersOut: 200, cashToBank: 200, cashToSafe: 0 },
    transactions: [{ id: 'sale', kind: 'sale', paymentMethod: 'cash', amount: 500, debit: 500, cashAmount: 500 }],
  });
  assert.equal(amount(tree, 'Cash at Hand'), 400);
  assert.equal(amount(tree, 'Net Cash Movement'), 300);
});

test('negative cash and profit values are displayed, never hidden or clamped to zero', () => {
  const tree = render({ cashMovement: { cashAtHand: -25, netCashMovement: -50 },
    profitability: { grossProfit: -100, netProfit: -150 } });
  for (const [label, expected] of [['Cash at Hand', -25], ['Net Cash Movement', -50], ['Gross Profit', -100], ['Net Profit', -150]]) {
    assert.equal(amount(tree, label), expected);
  }
});
