import dotenv from 'dotenv';
import assert from 'node:assert/strict';
dotenv.config({ quiet: true });
const { default: prisma } = await import('../src/db.js');
const { default: dashboard } = await import('../src/routes/dashboard.js');
const { default: reports } = await import('../src/routes/reports.js');
const tenantId = 'cmttvb1zz02816peswb6cf02j';
try {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, ownerId: true } });
  assert.equal(tenant.name, 'ABBA SHAK ENTERPRISES LIMITED');
  const user = await prisma.user.findUnique({ where: { id: tenant.ownerId } });
  assert.equal(user.tenantId, tenantId);
  const invoke = async (router, routePath, query = {}) => {
    let payload;
    const response = { json(value) { payload = value; }, status(code) { throw new Error(`${routePath}: HTTP ${code}`); } };
    const handler = router.stack.find((layer) => layer.route?.path === routePath).route.stack.at(-1).handle;
    await handler({ user, query }, response);
    assert(payload, `No response from ${routePath}`);
    return payload;
  };
  const kpis = await invoke(dashboard, '/kpis');
  for (const key of ['revenue', 'salesCount', 'purchases', 'expenses', 'cogs', 'grossProfit', 'netProfit', 'receivablesOutstanding', 'receivablesCount']) {
    assert.equal(kpis[key], 0, `Dashboard ${key}`);
  }
  const daily = await invoke(reports, '/daily-business', { from: '2026-01-01', to: '2026-12-31' });
  for (const key of ['totalSales', 'cashSales', 'creditSales', 'debtCollections', 'cashAtHand', 'netCashMovement', 'expenses', 'grossProfit', 'netProfit', 'transactionCount']) {
    assert.equal(daily.summary[key], 0, `Daily report ${key}`);
  }
  assert.equal(daily.transactions.length, 0);
  const expense = await invoke(reports, '/financial/expense');
  assert.equal(expense.totalExpense, 0);
  assert.equal(expense.transactions.length, 0);
  console.log(JSON.stringify({ tenant: tenant.name, dashboard: kpis, dailyReport: daily.summary, expenseReport: expense.summary }, null, 2));
} finally {
  await prisma.$disconnect();
}
