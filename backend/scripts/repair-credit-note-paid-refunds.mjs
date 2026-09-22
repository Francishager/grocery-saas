import { PrismaClient } from '@prisma/client';
import { reconcileCustomerReceivableBalance, receivableSaleNetTotal } from '../src/utils/customerBalance.js';
import { syncLinkedTransactionAccountBalance } from '../src/utils/accountingSync.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find(arg => arg.startsWith('--tenant='));
const tenantId = tenantArg ? tenantArg.slice('--tenant='.length) : null;
const toMoney = value => Math.round((Number(value) || 0) * 100) / 100;
const refundReference = noteNo => `CNREF-${noteNo}`;

function refundSlice({ saleTotal, amountPaid, previousCredit = 0, noteAmount = 0 }) {
  const total = toMoney(saleTotal);
  const paid = toMoney(amountPaid);
  const unpaidPortion = Math.max(0, toMoney(total - paid));
  const beforePaidCoverage = Math.max(0, toMoney(Math.min(total, toMoney(previousCredit)) - unpaidPortion));
  const afterPaidCoverage = Math.max(0, toMoney(Math.min(total, toMoney(previousCredit) + toMoney(noteAmount)) - unpaidPortion));
  return toMoney(Math.max(0, afterPaidCoverage - beforePaidCoverage));
}

async function findRefundAccount(tx, note, sale, amount) {
  const payments = await tx.customerPayment.findMany({ where: { tenantId: note.tenantId, saleId: sale.id }, orderBy: { createdAt: 'asc' } });
  for (const payment of payments) {
    const references = [...new Set([payment.reference, payment.id, sale.receiptNo].filter(Boolean))];
    const receipt = await tx.cashTransaction.findFirst({
      where: { tenantId: note.tenantId, type: 'receipt', amount: toMoney(payment.amount), ...(references.length ? { reference: { in: references } } : {}) },
      include: { account: true },
      orderBy: { createdAt: 'asc' },
    });
    if (receipt?.account?.isActive !== false && Number(receipt.account?.balance || 0) >= amount) return receipt.account;
  }
  return null;
}

async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0');
  await prisma.$executeRawUnsafe('ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "refundWithdrawalId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "refundCashAccountId" TEXT');

  const sales = await prisma.saleRecord.findMany({
    where: { ...(tenantId ? { tenantId } : {}), status: { not: 'cancelled' }, amountPaid: { gt: 0 }, creditNotes: { some: { status: { not: 'cancelled' } } } },
    include: { customer: { select: { id: true, name: true, email: true } }, creditNotes: { where: { status: { not: 'cancelled' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });

  const results = [];
  for (const sale of sales) {
    let creditedBefore = 0;
    const saleTotal = receivableSaleNetTotal(sale);
    for (const note of sale.creditNotes) {
      const targetRefund = refundSlice({ saleTotal, amountPaid: sale.amountPaid, previousCredit: creditedBefore, noteAmount: note.amount });
      creditedBefore = toMoney(creditedBefore + toMoney(note.amount));
      if (targetRefund <= 0 || toMoney(note.refundAmount) >= targetRefund) continue;
      const reference = refundReference(note.noteNo);
      const existingWithdrawal = await prisma.customerWithdrawal.findFirst({ where: { tenantId: note.tenantId, reference } });
      if (existingWithdrawal) {
        results.push({ noteNo: note.noteNo, skipped: 'withdrawal already exists', amount: targetRefund });
        continue;
      }
      const account = await findRefundAccount(prisma, note, sale, targetRefund);
      if (!account) {
        results.push({ noteNo: note.noteNo, error: 'original receipt account not found or has insufficient balance', amount: targetRefund });
        continue;
      }
      results.push({ noteNo: note.noteNo, tenantId: note.tenantId, customer: sale.customer?.name || sale.customer?.email || note.customerId, amount: targetRefund, account: account.name, apply });
      if (!apply) continue;
      await prisma.$transaction(async (tx) => {
        const debited = await tx.cashAccount.updateMany({ where: { id: account.id, tenantId: note.tenantId, isActive: true, balance: { gte: targetRefund } }, data: { balance: { decrement: targetRefund } } });
        if (debited.count !== 1) throw new Error(`Insufficient balance in ${account.name} for ${note.noteNo}`);
        const updatedAccount = await tx.cashAccount.findUnique({ where: { id: account.id } });
        const withdrawal = await tx.customerWithdrawal.create({ data: { tenantId: note.tenantId, branchId: note.branchId, customerId: note.customerId, userId: note.userId, cashAccountId: account.id, amount: targetRefund, paymentMethod: account.type || 'cash', reference, notes: `Customer refund for credit note ${note.noteNo} (${note.reason})` } });
        await tx.cashTransaction.create({ data: { tenantId: note.tenantId, accountId: account.id, type: 'credit_note_refund', amount: targetRefund, balanceAfter: updatedAccount.balance, reference, description: `Credit note refund repair: ${sale.customer?.name || note.customerId}`, userId: note.userId } });
        await tx.creditNote.update({ where: { id: note.id }, data: { refundAmount: targetRefund, refundWithdrawalId: withdrawal.id, refundCashAccountId: account.id } });
        await syncLinkedTransactionAccountBalance(tx, note.tenantId, account.id);
        await reconcileCustomerReceivableBalance(tx, { tenantId: note.tenantId, branchId: note.branchId }, note.customerId);
      }, { timeout: 30000 });
    }
  }
  console.table(results);
  if (!apply) console.log('Dry run only. Re-run with --apply to create missing refunds. Optional: --tenant=<tenantId>');
}

main().finally(() => prisma.$disconnect());
