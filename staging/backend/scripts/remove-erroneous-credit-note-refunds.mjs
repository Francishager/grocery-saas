import { PrismaClient } from '@prisma/client';
import { reconcileCustomerReceivableBalance } from '../src/utils/customerBalance.js';
import { syncLinkedTransactionAccountBalance } from '../src/utils/accountingSync.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const noteArgs = process.argv.filter((arg) => arg.startsWith('--note=')).map((arg) => arg.slice('--note='.length)).filter(Boolean);
const tenantId = tenantArg ? tenantArg.slice('--tenant='.length) : null;
const noteNos = noteArgs.length ? noteArgs : ['CN-2026-00002', 'CN-2026-00011'];
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const refundReference = (noteNo) => `CNREF-${noteNo}`;

if (!tenantId) {
  console.error('Missing --tenant=<tenantId>');
  process.exit(1);
}

async function undoNoteRefund(tx, note) {
  const reference = refundReference(note.noteNo);
  const withdrawals = await tx.customerWithdrawal.findMany({
    where: {
      tenantId: note.tenantId,
      OR: [
        { id: note.refundWithdrawalId || '__none__' },
        { reference },
      ],
    },
    include: { cashAccount: { select: { id: true, name: true, type: true, balance: true } } },
  });

  const cashTransactions = await tx.cashTransaction.findMany({
    where: {
      tenantId: note.tenantId,
      OR: [
        { reference },
        { description: { contains: note.noteNo } },
      ],
    },
    include: { account: { select: { id: true, name: true, type: true, balance: true } } },
  });

  const accountCredits = new Map();
  for (const withdrawal of withdrawals) {
    if (withdrawal.cashAccountId && money(withdrawal.amount) > 0) {
      accountCredits.set(withdrawal.cashAccountId, money((accountCredits.get(withdrawal.cashAccountId) || 0) + money(withdrawal.amount)));
    }
  }
  if (!accountCredits.size && note.refundCashAccountId && money(note.refundAmount) > 0) {
    accountCredits.set(note.refundCashAccountId, money(note.refundAmount));
  }

  const before = {
    noteNo: note.noteNo,
    customer: note.customer?.name || note.customerId,
    customerBalance: money(note.customer?.balance),
    refundAmount: money(note.refundAmount),
    refundWithdrawalId: note.refundWithdrawalId,
    refundCashAccountId: note.refundCashAccountId,
    withdrawals: withdrawals.map((w) => ({ id: w.id, amount: money(w.amount), account: w.cashAccount?.name || w.cashAccountId, reference: w.reference })),
    cashTransactions: cashTransactions.map((t) => ({ id: t.id, type: t.type, amount: money(t.amount), account: t.account?.name || t.accountId, reference: t.reference })),
    accountCredits: [...accountCredits.entries()],
  };

  if (!apply) return { ...before, apply: false };

  for (const [accountId, amount] of accountCredits.entries()) {
    await tx.cashAccount.update({ where: { id: accountId }, data: { balance: { increment: amount } } });
    await syncLinkedTransactionAccountBalance(tx, note.tenantId, accountId);
  }

  if (cashTransactions.length) {
    await tx.cashTransaction.deleteMany({ where: { id: { in: cashTransactions.map((t) => t.id) } } });
  }
  if (withdrawals.length) {
    await tx.customerWithdrawal.deleteMany({ where: { id: { in: withdrawals.map((w) => w.id) } } });
  }

  await tx.creditNote.update({
    where: { id: note.id },
    data: { refundAmount: 0, refundWithdrawalId: null, refundCashAccountId: null },
  });

  const reconciled = await reconcileCustomerReceivableBalance(tx, { tenantId: note.tenantId, branchId: note.branchId }, note.customerId);
  const refreshedAccounts = await tx.cashAccount.findMany({
    where: { id: { in: [...accountCredits.keys()] } },
    select: { id: true, name: true, type: true, balance: true },
  });

  return {
    ...before,
    apply: true,
    customerBalanceAfter: money(reconciled?.balance),
    accountBalancesAfter: refreshedAccounts.map((account) => ({ id: account.id, name: account.name, type: account.type, balance: money(account.balance) })),
  };
}

async function main() {
  const notes = await prisma.creditNote.findMany({
    where: { tenantId, noteNo: { in: noteNos } },
    include: { customer: { select: { id: true, name: true, balance: true } }, sale: { select: { id: true, receiptNo: true, total: true, amountPaid: true, balance: true, status: true } } },
    orderBy: { noteNo: 'asc' },
  });

  const found = new Set(notes.map((note) => note.noteNo));
  const missing = noteNos.filter((noteNo) => !found.has(noteNo));
  const results = [];
  for (const note of notes) {
    const result = await prisma.$transaction((tx) => undoNoteRefund(tx, note), { timeout: 30000 });
    results.push(result);
  }

  console.dir({ apply, tenantId, requested: noteNos, missing, results }, { depth: null });
  if (!apply) console.log('Dry run only. Re-run with --apply to remove these erroneous credit-note refund artifacts.');
}

main().finally(() => prisma.$disconnect());