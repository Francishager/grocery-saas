import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCashMovements, accountCashBalances, expenseDateWhere, loadJournalExpenseRows, postedJournalWhere, loadLedgerBalances, ledgerBalanceSheet } from '../src/utils/reportAccounting.js';

test('balance sheet reports recorded equity and exposes a difference instead of plugging it', () => {
  const accounts = [
    { type: 'asset', balance: 1000 }, { type: 'liability', balance: 300 },
    { type: 'equity', balance: 200 }, { type: 'revenue', balance: 400 },
    { type: 'expense', balance: 100 },
  ];
  const sheet = ledgerBalanceSheet(accounts);
  assert.equal(sheet.retainedEarnings, 300);
  assert.equal(sheet.totalEquity, 500);
  assert.equal(sheet.difference, 200);
  assert.equal(sheet.isBalanced, false);
});

test('trial balance includes inactive accounts, correct credit balances, reversals and historical cutoffs', async () => {
  const accounts = [
    { id: 'asset', code: '1000', name: 'Asset', type: 'asset', balance: 800, createdAt: new Date('2026-01-01') },
    { id: 'capital', code: '3000', name: 'Capital', type: 'equity', balance: 500, isActive: false, createdAt: new Date('2026-01-01') },
    { id: 'overdraft', code: '1001', name: 'Overdraft', type: 'asset', balance: -200, createdAt: new Date('2026-01-01') },
  ];
  const client = {
    account: { findMany: async (query) => { assert.equal(query.where.isActive, undefined); return accounts; } },
    journalLine: { findMany: async () => [
      { id: 'j1', accountId: 'asset', debit: 500, credit: 0, entry: { date: new Date('2026-08-01') } },
      { id: 'j2', accountId: 'asset', debit: 300, credit: 0, entry: { date: new Date('2026-09-01') } },
      { id: 'j3', accountId: 'capital', debit: 0, credit: 500, entry: { date: new Date('2026-08-01') } },
    ] },
  };
  const result = await loadLedgerBalances(client, { tenantId: 'tenant' }, new Date('2026-08-31'));
  assert.equal(result[0].debit, 500);
  assert.equal(result[1].credit, 500);
  assert.equal(result[2].credit, 200);
  for (const account of result) {
    assert.equal(account.details.reduce((sum, line) => sum + line.debit - line.credit, 0), account.debit - account.credit);
  }
});

const movement = (accountId, type, amount, reference, accountType = 'cash') => ({
  accountId, type, amount, reference, account: { type: accountType },
});

test('cash expense breakdown uses the actual journal payment rather than gross accrued expense', () => {
  const result = summarizeCashMovements([
    movement('till', 'journal_out', 200000, 'expense-entry'),
    movement('till', 'hr_journal_out', 100000, 'salary-payment'),
  ], 500000, { expenseReferences: new Set(['expense-entry']) });
  assert.equal(result.cashExpenses, 200000);
  assert.equal(result.otherCashOut, 100000);
  assert.equal(result.cashAtHand, 200000);
});

test('cash tills reconcile receipts, repayments, expenses, refunds and transfers exactly once', () => {
  const rows = [
    movement('till', 'sale', 500000, 'sale'),
    movement('till', 'receipt', 200000, 'payment'),
    movement('till', 'expense', 50000, 'expense'),
    movement('till', 'transfer_out', 100000, 'banking'),
    movement('bank', 'transfer_in', 100000, 'banking', 'bank'),
    movement('safe', 'transfer_out', 300000, 'safe-bank', 'safe'),
    movement('bank', 'transfer_in', 300000, 'safe-bank', 'bank'),
    movement('till', 'refund', 25000, 'refund'),
  ];
  const result = summarizeCashMovements(rows, 100000);
  assert.equal(result.cashAtHand, 625000);
  assert.equal(result.expectedCash, result.cashAtHand);
  assert.equal(result.netCashMovement, 525000);
  assert.equal(result.cashToBank, 100000);
  assert.equal(result.cashPaidOut, 175000);
});

test('bank-only and safe-to-bank movements cannot reduce cash at hand', () => {
  const result = summarizeCashMovements([
    movement('bank', 'deposit', 900000, null, 'bank'),
    movement('safe', 'transfer_out', 200000, 'transfer', 'safe'),
    movement('bank', 'transfer_in', 200000, 'transfer', 'bank'),
  ], 300000);
  assert.equal(result.cashAtHand, 300000);
  assert.equal(result.netCashMovement, 0);
  assert.equal(result.cashToBank, 0);
});

test('cancelled-sale cash receipts and their refunds remain in cash reconciliation', () => {
  const result = summarizeCashMovements([
    movement('till', 'income', 200000, 'cancelled-sale'),
    movement('till', 'refund', 200000, 'credit-note'),
  ]);
  assert.equal(result.cashAtHand, 0);
  assert.equal(result.netCashMovement, 0);
});

test('historical cash balances exclude later activity and preserve opening float', () => {
  const balances = accountCashBalances(
    [{ id: 'till', balance: 850000 }, { id: 'quiet', balance: 90000 }],
    [movement('till', 'sale', 500000, 'sale'), movement('till', 'expense', 50000, 'expense')],
    [{ accountId: 'till', type: 'income', _sum: { amount: 300000 } },
      { accountId: 'quiet', type: 'income', _sum: { amount: 70000 } }],
  );
  assert.deepEqual(balances.get('till'), { opening: 100000, closing: 550000 });
  assert.deepEqual(balances.get('quiet'), { opening: 20000, closing: 20000 });
});

test('expense belongs to its business date, not both business date and creation date', () => {
  const range = { gte: new Date('2026-09-01'), lt: new Date('2026-10-01') };
  assert.deepEqual(expenseDateWhere(range), { date: range });
});

test('expense journals use signed lines, preserve reversals, and exclude duplicate expense sources', async () => {
  const expense = { name: 'Wages', type: 'expense' };
  const entries = [
    { id: 'post', date: new Date('2026-08-31'), status: 'reversed', reversalJournalId: 'reverse', lines: [{ id: 'a', account: expense, debit: 300000, credit: 0 }] },
    { id: 'reverse', date: new Date('2026-09-01'), status: 'posted', lines: [{ id: 'b', account: expense, debit: 0, credit: 300000 }] },
    { id: 'duplicate', sourceId: 'direct-expense', lines: [{ id: 'c', account: expense, debit: 50000, credit: 0 }] },
  ];
  const client = {
    journalEntry: { findMany: async (query) => {
      assert.deepEqual(query.where.AND[0], postedJournalWhere);
      assert.equal(query.take, undefined);
      assert.equal(query.where.tenantId, 'tenant');
      return entries;
    } },
    expense: { findMany: async (query) => {
      assert.equal(query.where.tenantId, 'tenant');
      return [{ id: 'direct-expense' }];
    } },
  };
  const rows = await loadJournalExpenseRows(client, { tenantId: 'tenant' }, {});
  assert.deepEqual(rows.map((row) => row.amount), [300000, -300000]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 0);
  assert.equal(rows[0].paymentMethod, 'accrual');
  assert.equal(rows[0].cashImpact, false);
});

test('report totals include activity beyond the former 700-row limit', () => {
  const rows = Array.from({ length: 1600 }, (_, i) => movement('till', 'sale', 1000, 'sale-' + i));
  assert.equal(summarizeCashMovements(rows).cashAtHand, 1600000);
});
