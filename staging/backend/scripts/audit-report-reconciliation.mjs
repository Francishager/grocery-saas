import assert from 'node:assert/strict';
import prisma from '../src/db.js';
import reports from '../src/routes/reports.js';
import accounting from '../routes/accounting.js';
import dashboard from '../src/routes/dashboard.js';

const arg = (key) => process.argv.find((value) => value.startsWith('--' + key + '='))?.split('=').slice(1).join('=');
const now = new Date();
const from = arg('from') || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
const to = arg('to') || now.toISOString();
const tenantId = arg('tenant');
const close = (actual, expected, label) => {
  assert.ok(Math.abs(Number(actual || 0) - Number(expected || 0)) < 0.02,
    label + ': actual=' + actual + ', expected=' + expected);
};
async function report(path, tenant, query = {}, router = reports) {
  const route = router.stack.find((layer) => layer.route?.path === path)?.route;
  if (!route) throw new Error('Report route missing: ' + path);
  let payload;
  let status = 200;
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  await route.stack.at(-1).handle({
    user: { id: 'read-only-report-audit', tenantId: tenant.id, role: 'owner', permissions: ['*'] },
    query: { from, to, ...query },
  }, res);
  assert.equal(status, 200, path + ' failed');
  return payload;
}
try {
  const tenants = await prisma.tenant.findMany({ where: tenantId ? { id: tenantId } : {}, select: { id: true, name: true } });
  let failures = 0;
  for (const tenant of tenants) {
    try {
      if (process.argv.includes('--statements')) {
        const trial = await report('/financial/trial-balance', tenant);
        const sheet = await report('/financial/balance-sheet', tenant);
        const accountingTrial = await report('/reports/trial-balance', tenant, {}, accounting);
        close(trial.totalDebit, accountingTrial.totalDebit, 'accounting versus reports debits');
        close(trial.totalCredit, accountingTrial.totalCredit, 'accounting versus reports credits');
        close(trial.difference, sheet.difference, 'trial balance versus balance sheet difference');
        close(sheet.summary.totalAssets - sheet.summary.totalLiabilities - sheet.summary.totalEquity, sheet.difference, 'balance sheet equation');
        for (const account of trial.accounts) close(account.details.reduce((sum, row) => sum + row.debit - row.credit, 0), account.debit - account.credit, 'account details: ' + account.account);
        console.log(JSON.stringify({ tenant: tenant.name, passed: true, accounts: trial.accounts.length,
          ledgerDifference: trial.difference, unjournaledAccounts: trial.accounts.filter((row) => Math.abs(row.unjournaledBalance) > 0.01).length }));
        continue;
      }
      const daily = await report('/daily-business', tenant, { limit: '1' });
      const expenses = await report('/financial/expense', tenant);
      const cashFlow = await report('/financial/cash-flow', tenant);
      const profit = await report('/profit', tenant);
      const bank = await report('/financial/bank-transactions', tenant);
      const tillTotal = daily.staffTills.filter((row) => row.type === 'cash').reduce((sum, row) => sum + row.balance, 0);
      close(daily.summary.cashAtHand, tillTotal, 'cash card versus tills');
      close(daily.cashMovement.openingCash + daily.summary.netCashMovement, tillTotal, 'cash rollforward');
      close(daily.cashLedger.reduce((sum, row) => sum + row.debit - row.credit, 0), daily.summary.netCashMovement, 'cash drilldown');
      close(daily.expenses.reduce((sum, row) => sum + row.amount, 0), daily.summary.expenses, 'expense drilldown');
      close(daily.summary.expenses, expenses.totalExpense, 'daily versus financial expenses');
      close(daily.summary.grossProfit, daily.summary.revenue - daily.profitability.cogs, 'gross profit');
      close(daily.summary.netProfit, daily.summary.grossProfit - daily.summary.expenses, 'net profit');
      close(daily.summary.expenses, profit.expenses, 'legacy profit expenses');
      close(daily.summary.grossProfit, profit.grossProfit, 'legacy gross profit');
      close(bank.currentBalance, daily.staffTills.filter((row) => row.type === 'bank').reduce((sum, row) => sum + row.balance, 0), 'bank report versus account balances');
      const saleRows = daily.transactions.filter((row) => ['sale', 'credit-sale'].includes(row.kind));
      close(saleRows.reduce((sum, row) => sum + Number(row.revenue) - Number(row.cogs), 0), daily.summary.grossProfit, 'gross profit drilldown');
      close(saleRows.reduce((sum, row) => sum + Number(row.creditAmount || 0), 0), daily.summary.creditSales, 'credit sales drilldown');
      close(saleRows.reduce((sum, row) => sum + Number(row.paidByMethod ? row.paidByMethod.cash || 0 : row.paymentMethod === 'cash' ? row.cashAmount || 0 : 0), 0), daily.summary.cashSales, 'cash sales drilldown');
      if (process.argv.includes('--dashboard')) {
        const kpis = await report('/kpis', tenant, {}, dashboard);
        close(kpis.expenses, daily.summary.expenses, 'dashboard expenses');
        close(kpis.grossProfit, daily.summary.grossProfit, 'dashboard gross profit');
      }
      close(cashFlow.netAccountMovement, cashFlow.inflow + cashFlow.transfersIn - cashFlow.outflow - cashFlow.transfersOut, 'cash flow');
      console.log(JSON.stringify({ tenant: tenant.name, passed: true, cashAtHand: daily.summary.cashAtHand,
        expenses: daily.summary.expenses, grossProfit: daily.summary.grossProfit, transactions: daily.transactions.length }));
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ tenant: tenant.name, passed: false, error: error.message }));
    }
  }
  console.log(JSON.stringify({ mode: 'read-only', tenants: tenants.length, failures, from, to }));
  process.exitCode = failures ? 1 : 0;
} finally { await prisma.$disconnect(); }
