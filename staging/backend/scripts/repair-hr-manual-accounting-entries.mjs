import { PrismaClient } from '@prisma/client';
import { syncLinkedTransactionAccountBalance, linkedCashAccountId } from '../src/utils/accountingSync.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find(arg => arg.startsWith('--tenant='));
const tenantIdFilter = tenantArg ? tenantArg.slice('--tenant='.length) : null;

const HR_SOURCE_TYPES = new Set([
  'SALARY_ADVANCE',
  'HR_OPENING_ADVANCE',
  'HR_OPENING_SALARY_PAYABLE',
  'PAYROLL',
  'PAYROLL_PAYMENT',
  'SALARY_ADVANCE_REPAYMENT',
  'HR_JOURNAL_REVERSAL',
]);
const HR_ACCOUNT_NAMES = new Set([
  'staff salaries & wages',
  'salaries payable',
  'employee advances/loans',
  'employee advances / loans',
  'paye tax payable',
  'social security payable',
]);
const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense', 'expenses']);
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const normalize = value => String(value || '').trim().toLowerCase();
const isDebitNormal = account => DEBIT_NORMAL_TYPES.has(normalize(account?.type));
const lineDelta = (account, debit, credit) => isDebitNormal(account) ? money(debit - credit) : money(credit - debit);

function isHrAccount(account, protectedIds) {
  if (!account) return false;
  if (protectedIds.has(account.id)) return true;
  const name = normalize(account.name);
  if (HR_ACCOUNT_NAMES.has(name)) return true;
  const description = normalize(account.description);
  return description.includes('payroll') || description.includes('salary') || description.includes('employee social security') || description.includes('social security deductions');
}

async function protectedAccountIdsForTenant(tenantId) {
  const config = await prisma.hRAccountingConfig.findUnique({
    where: { tenantId },
    select: {
      salaryExpenseAccountId: true,
      salaryPayableAccountId: true,
      salaryAdvanceAccountId: true,
      payeTaxAccountId: true,
      socialSecurityAccountId: true,
    },
  }).catch(() => null);
  return new Set(Object.values(config || {}).filter(Boolean));
}

async function findCandidates() {
  const tenants = tenantIdFilter
    ? [{ id: tenantIdFilter, name: tenantIdFilter }]
    : await prisma.tenant.findMany({ select: { id: true, name: true } });
  const rows = [];
  for (const tenant of tenants) {
    const protectedIds = await protectedAccountIdsForTenant(tenant.id);
    const entries = await prisma.journalEntry.findMany({
      where: {
        tenantId: tenant.id,
        status: { not: 'reversed' },
        reversalOfId: null,
        reversalJournalId: null,
        OR: [{ sourceType: null }, { sourceType: { notIn: [...HR_SOURCE_TYPES] } }],
      },
      include: {
        lines: { include: { account: true } },
        user: { select: { id: true, fname: true, lname: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const entry of entries) {
      const hrLines = entry.lines.filter(line => isHrAccount(line.account, protectedIds));
      if (!hrLines.length) continue;
      rows.push({
        tenant,
        entry,
        hrAccounts: hrLines.map(line => `${line.account.code} ${line.account.name}`).join('; '),
        debit: money(entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)),
        credit: money(entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)),
      });
    }
  }
  return rows;
}

async function reverseEntry(candidate) {
  const { entry, tenant } = candidate;
  const reversalLines = entry.lines.map(line => ({
    accountId: line.accountId,
    debit: money(line.credit),
    credit: money(line.debit),
    description: `Repair reversal of ${entry.entryNo}: ${line.description || entry.description || 'manual HR accounting entry'}`,
  }));
  const totalDebit = money(reversalLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = money(reversalLines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`${entry.entryNo} is not balanced; refusing to reverse automatically`);

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const reversal = await tx.journalEntry.create({
      data: {
        entryNo: `HRFIX-${Date.now()}-${entry.id.slice(-4)}`,
        tenantId: entry.tenantId,
        branchId: entry.branchId || null,
        date: now,
        description: `Repair reversal: manual entry used HR Accounting account(s)`,
        reference: entry.reference || entry.entryNo,
        status: 'posted',
        userId: entry.userId,
        sourceType: 'HR_MANUAL_ENTRY_REPAIR',
        sourceId: entry.id,
        reversalOfId: entry.id,
        reversalReason: 'Manual accounting entry used HR Accounting protected account(s); reverse and repost through HR Accounting.',
        lines: { create: reversalLines },
      },
    });
    await tx.journalEntry.update({
      where: { id: entry.id },
      data: {
        status: 'reversed',
        reversalJournalId: reversal.id,
        reversalReason: 'Manual accounting entry used HR Accounting protected account(s); reverse and repost through HR Accounting.',
        reversedBy: entry.userId,
        reversedAt: now,
      },
    });

    const affectedCashAccounts = new Set();
    for (const line of reversalLines) {
      const originalLine = entry.lines.find(item => item.accountId === line.accountId);
      const account = originalLine?.account;
      const delta = lineDelta(account, line.debit, line.credit);
      await tx.account.update({ where: { id: line.accountId }, data: { balance: { increment: delta } } });
      const cashAccountId = linkedCashAccountId(account);
      if (cashAccountId && Math.abs(delta) > 0) {
        affectedCashAccounts.add(cashAccountId);
        const updatedCash = await tx.cashAccount.update({ where: { id: cashAccountId }, data: { balance: { increment: delta } } });
        await tx.cashTransaction.create({ data: {
          tenantId: entry.tenantId,
          accountId: cashAccountId,
          type: delta >= 0 ? 'hr_manual_repair_in' : 'hr_manual_repair_out',
          amount: Math.abs(delta),
          balanceAfter: updatedCash.balance,
          reference: reversal.entryNo,
          description: `Repair reversal of ${entry.entryNo}`,
          userId: entry.userId,
        } });
      }
    }
    for (const cashAccountId of affectedCashAccounts) await syncLinkedTransactionAccountBalance(tx, entry.tenantId, cashAccountId).catch(() => null);
  }, { timeout: 30000 });
  return { tenant: tenant.name || tenant.id, entryNo: entry.entryNo };
}

async function main() {
  const candidates = await findCandidates();
  console.table(candidates.map(row => ({
    tenantId: row.tenant.id,
    tenant: row.tenant.name || row.tenant.id,
    entryNo: row.entry.entryNo,
    date: row.entry.date?.toISOString?.().slice(0, 10),
    sourceType: row.entry.sourceType || 'manual',
    description: row.entry.description || '',
    user: [row.entry.user?.fname, row.entry.user?.lname].filter(Boolean).join(' ') || row.entry.user?.email || row.entry.userId,
    hrAccounts: row.hrAccounts,
    debit: row.debit,
    credit: row.credit,
    apply,
  })));
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to reverse these manual HR-account journal entries. Optional: --tenant=<tenantId>');
    return;
  }
  for (const candidate of candidates) await reverseEntry(candidate);
  console.log(`Applied reversals: ${candidates.length}`);
}

main().finally(() => prisma.$disconnect());
