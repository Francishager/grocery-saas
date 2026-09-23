import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import express from 'express';

// Fail closed on unexpected reads or writes. No test in this file uses a database.
const prisma = {};
for (const model of ['account', 'journalLine', 'cashAccount', 'cashTransaction', 'branch', 'userBranch', 'userPermission']) {
  prisma[model] = Object.fromEntries(['findMany', 'findFirst', 'findUnique', 'groupBy'].map((method) =>
    [method, async () => { throw new Error(`Unexpected query: ${model}.${method}`); }]));
}
globalThis.prisma = prisma;
const { default: reports } = await import('../src/routes/reports.js');
const { default: accounting } = await import('../routes/accounting.js');
const { default: dashboard } = await import('../src/routes/dashboard.js');

const protectedRoutes = [
  [reports, '/api/reports', ['/daily-business', '/expenses', '/profit', '/financial/profit-loss',
    '/financial/income', '/financial/expense', '/financial/cash-flow', '/financial/trial-balance',
    '/financial/balance-sheet', '/financial/general-ledger', '/financial/bank-transactions']],
  [accounting, '/api/accounting', ['/reports/trial-balance', '/reports/profit-loss', '/reports/balance-sheet']],
  [dashboard, '/api/dashboard', ['/kpis', '/sales-chart', '/profit-loss', '/daily-performance', '/top-products', '/payment-methods']],
];

function route(router, path) {
  const matches = router.stack.filter((layer) => layer.route?.path === path && layer.route.methods.get);
  assert.equal(matches.length, 1, `${path} must be registered exactly once`);
  return matches[0].route;
}

async function invoke(router, path, query = {}, user = { id: 'owner', tenantId: 'tenant-a', role: 'owner' }) {
  let status = 200;
  let body;
  await route(router, path).stack.at(-1).handle({ user, query }, {
    status(code) { status = code; return this; }, json(value) { body = value; },
  });
  return { status, body };
}

test('all protected report routes are unique and reject anonymous HTTP requests', async () => {
  const app = express();
  for (const [router, prefix, paths] of protectedRoutes) {
    for (const path of paths) route(router, path);
    app.use(prefix, router);
  }
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [, prefix, paths] of protectedRoutes) {
      for (const path of paths) {
        const status = await new Promise((resolve, reject) => {
          get(`http://127.0.0.1:${server.address().port}${prefix}${path}`, (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode));
          }).on('error', reject);
        });
        assert.equal(status, 401, `${prefix}${path} must require authentication`);
      }
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('sales and financial report permissions are distinct and fail closed', async (t) => {
  t.mock.method(prisma.userPermission, 'findUnique', async () => ({}));
  const check = reports.stack.find((layer) => layer.handle.name === 'requireReportPermission').handle;
  for (const [path, permission, unrelated] of [
    ['/daily-business', 'canViewSalesReport', 'canViewFinancialReport'],
    ['/financial/trial-balance', 'canViewFinancialReport', 'canViewSalesReport'],
    ['/expenses', 'canViewFinancialReport', 'canViewSalesReport'],
  ]) {
    const run = (permissions) => new Promise((resolve) => {
      let status = 200;
      check({ path, user: { id: 'staff', permissions } }, {
        status(value) { status = value; return this; }, json(body) { resolve({ status, body }); },
      }, () => resolve({ status: 200 }));
    });
    assert.equal((await run([permission])).status, 200);
    assert.deepEqual(await run([unrelated]), { status: 403, body: { error: 'Permission denied', required: permission } });
  }
});

function ledgerFixture(t, { branchId = null, gap = 0 } = {}) {
  const accounts = [
    ['asset', '1000', 'Cash and assets', 'asset', 1200 + gap],
    ['liability', '2000', 'Payables', 'liability', 300],
    ['equity', '3000', 'Capital', 'equity', 200],
    ['revenue', '4000', 'Sales', 'revenue', 900],
    ['expense', '6000', 'Expenses', 'expense', 200],
  ].map(([id, code, name, type, balance]) => ({ id, code, name, type, balance,
    createdAt: new Date('2026-01-01'), isActive: id !== 'equity' }));
  const line = (id, accountId, date, debit, credit) => ({ id, accountId, debit, credit,
    entry: { id, entryNo: id, date: new Date(date), status: 'posted' } });
  const lines = [
    line('asset-old', 'asset', '2026-08-01', 1000, 0),
    line('asset-future', 'asset', '2026-10-01', 200, 0),
    line('liability', 'liability', '2026-08-01', 0, 300),
    line('capital', 'equity', '2026-08-01', 0, 200),
    line('revenue-old', 'revenue', '2026-08-01', 0, 100),
    line('revenue-period', 'revenue', '2026-09-30T18:00:00Z', 0, 600),
    line('revenue-future', 'revenue', '2026-10-01', 0, 200),
    line('expense-old', 'expense', '2026-08-01', 50, 0),
    line('expense-period', 'expense', '2026-09-01', 200, 0),
    line('expense-reversal', 'expense', '2026-09-30T18:00:00Z', 0, 50),
  ];
  t.mock.method(prisma.account, 'findMany', async ({ where, take }) => {
    assert.equal(where.tenantId, 'tenant-a');
    assert.equal(where.isActive, undefined, 'inactive historical accounts must remain visible');
    assert.equal(take, undefined, 'statement totals must not be truncated');
    if (branchId) assert.deepEqual(where.OR, [{ branchId }, { branchId: null }]);
    return accounts;
  });
  t.mock.method(prisma.journalLine, 'findMany', async ({ where }) => {
    assert.equal(where.entry.tenantId, 'tenant-a');
    assert.deepEqual(where.entry.OR, [{ status: 'posted' }, { status: 'reversed', reversalJournalId: { not: null } }]);
    return lines;
  });
  if (branchId) t.mock.method(prisma.branch, 'findFirst', async ({ where }) => {
    assert.equal(where.tenantId, 'tenant-a');
    assert.equal(where.id, branchId);
    return { id: branchId, name: 'Branch A' };
  });
}

for (const gap of [0, 25]) {
  test(`Accounting and Reports statements reconcile with an exposed ledger gap of ${gap}`, async (t) => {
    ledgerFixture(t, { branchId: 'branch-a', gap });
    const query = { to: '2026-09-30', branchId: 'branch-a', tenantId: 'attempted-other-tenant' };
    const report = await invoke(reports, '/financial/trial-balance', query);
    const account = await invoke(accounting, '/reports/trial-balance', query);
    assert.equal(report.status, 200);
    assert.equal(account.status, 200);
    for (const key of ['accounts', 'totalDebit', 'totalCredit', 'difference', 'isBalanced']) {
      assert.deepEqual(report.body[key], account.body[key], key);
    }
    assert.equal(report.body.totalDebit, 1200 + gap);
    assert.equal(report.body.totalCredit, 1200);
    assert.equal(report.body.difference, gap);
    assert.equal(report.body.isBalanced, gap === 0);
    for (const item of report.body.accounts) {
      assert.equal(item.details.reduce((sum, row) => sum + row.debit - row.credit, 0), item.debit - item.credit);
      assert.ok(item.name && item.account, 'print/export must retain account names');
    }
    const sheet = (await invoke(reports, '/financial/balance-sheet', query)).body;
    const accountingSheet = (await invoke(accounting, '/reports/balance-sheet', query)).body;
    for (const key of ['totalAssets', 'totalLiabilities', 'totalEquity', 'retainedEarnings', 'difference']) {
      assert.equal(sheet.summary[key], accountingSheet[key], key);
    }
    assert.equal(sheet.difference, gap, 'never invent equity to force balance');
    assert.equal(sheet.lineItems.equity.reduce((sum, row) => sum + row.amount, 0), sheet.summary.totalEquity);
  });
}

test('Accounting profit/loss honors both dates, including end-of-day and expense reversals', async (t) => {
  ledgerFixture(t);
  const result = await invoke(accounting, '/reports/profit-loss', { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(result.status, 200);
  assert.equal(result.body.totalRevenue, 600);
  assert.equal(result.body.totalExpenses, 150);
  assert.equal(result.body.netProfit, 450);
});

test('report handlers reject another tenant branch, unassigned staff branches, and missing tenant identity', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(prisma.branch, 'findFirst', async ({ where }) => {
    assert.equal(where.tenantId, 'tenant-a');
    return null;
  });
  t.mock.method(prisma.userBranch, 'findMany', async ({ where }) => {
    assert.equal(where.branch.tenantId, 'tenant-a');
    return [{ branchId: 'branch-a', branch: { id: 'branch-a' } }];
  });
  for (const [router, path] of [[reports, '/daily-business'], [reports, '/financial/trial-balance'], [accounting, '/reports/trial-balance']]) {
    assert.equal((await invoke(router, path, { branchId: 'foreign-branch' })).status, 404);
    assert.equal((await invoke(router, path, { branchId: 'branch-b' },
      { id: 'staff', tenantId: 'tenant-a', role: 'attendant', permissions: ['canViewBranch'] })).status, 403);
    assert.equal((await invoke(router, path, {}, { id: 'owner', role: 'owner' })).status, 403);
  }
});

test('Accounting ignores branch switching for staff without that permission', async (t) => {
  ledgerFixture(t, { branchId: 'branch-a' });
  t.mock.method(prisma.userBranch, 'findMany', async () => [
    { branchId: 'branch-a', branch: { id: 'branch-a' } },
  ]);
  const result = await invoke(accounting, '/reports/trial-balance', { branchId: 'branch-b' },
    { id: 'staff', tenantId: 'tenant-a', role: 'attendant', permissions: ['canViewFinancialReport'] });
  assert.equal(result.status, 200);
  assert.equal(result.body.totalDebit, 1400);
});
