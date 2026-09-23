import { PrismaClient } from '@prisma/client';
import { getCustomerReceivableBalanceMap, effectiveCreditNoteRows, receivableSaleNetTotal } from '../src/utils/customerBalance.js';
import { syncLinkedTransactionAccountBalance, linkedCashAccountId } from '../src/utils/accountingSync.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenantFilter = tenantArg ? tenantArg.slice('--tenant='.length) : null;
const tolerance = Number(process.env.AUDIT_TOLERANCE || 0.01);
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const diff = (a, b) => money(money(a) - money(b));
const isMismatch = (a, b) => Math.abs(diff(a, b)) > tolerance;

function paymentStatus(total, paid, balance) {
  if (money(balance) <= 0) return 'paid';
  if (money(paid) > 0 || money(balance) < money(total)) return 'partial';
  return 'unpaid';
}

async function calculateSupplierBalance(tx, tenantId, supplierId) {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, openingBalance: true } });
  if (!supplier) return null;
  const [purchases, payments, debitNotes] = await Promise.all([
    tx.supplierPurchase.findMany({ where: { tenantId, supplierId }, select: { id: true, total: true, amountPaid: true, balance: true } }),
    tx.supplierPayment.aggregate({ where: { tenantId, supplierId }, _sum: { amount: true } }),
    tx.debitNote.aggregate({ where: { tenantId, supplierId, status: { not: 'cancelled' } }, _sum: { amount: true } }),
  ]);
  const purchasesTotal = purchases.reduce((sum, row) => money(sum + money(row.total)), 0);
  const paymentTotal = money(payments._sum.amount);
  const debitNoteTotal = money(debitNotes._sum.amount);
  return {
    balance: money(Math.max(0, money(supplier.openingBalance) + purchasesTotal - paymentTotal - debitNoteTotal)),
    components: { openingBalance: money(supplier.openingBalance), purchases: purchasesTotal, payments: paymentTotal, debitNotes: debitNoteTotal },
  };
}

async function auditCustomers(tenant) {
  const customers = await prisma.customer.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, balance: true, openingBalance: true } });
  const balanceMap = await getCustomerReceivableBalanceMap(prisma, { tenantId: tenant.id }, customers);
  const mismatches = [];
  for (const customer of customers) {
    const calculated = balanceMap.get(customer.id);
    if (!calculated || !isMismatch(customer.balance, calculated.balance)) continue;
    mismatches.push({ id: customer.id, name: customer.name, stored: money(customer.balance), calculated: calculated.balance, difference: diff(customer.balance, calculated.balance), components: calculated.components });
    if (apply) await prisma.customer.update({ where: { id: customer.id }, data: { balance: calculated.balance } });
  }
  return mismatches;
}

async function auditSales(tenant) {
  const sales = await prisma.saleRecord.findMany({
    where: { tenantId: tenant.id },
    include: { creditNotes: { where: { status: { not: 'cancelled' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
  const mismatches = [];
  for (const sale of sales) {
    if (['cancelled', 'refunded'].includes(sale.status)) continue;
    const noteTotal = effectiveCreditNoteRows(sale.creditNotes.map((note) => ({ ...note, sale }))).reduce((sum, note) => money(sum + note.effectiveAmount), 0);
    const netTotal = receivableSaleNetTotal(sale);
    const expected = money(Math.max(0, netTotal - money(sale.amountPaid) - noteTotal));
    if (!isMismatch(sale.balance, expected)) continue;
    mismatches.push({ id: sale.id, receiptNo: sale.receiptNo, stored: money(sale.balance), expected, difference: diff(sale.balance, expected), netTotal, amountPaid: money(sale.amountPaid), creditNotes: noteTotal });
    if (apply) await prisma.saleRecord.update({ where: { id: sale.id }, data: { balance: expected, paymentStatus: paymentStatus(netTotal, sale.amountPaid, expected) } });
  }
  return mismatches;
}

async function auditSuppliers(tenant) {
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, balance: true, openingBalance: true } });
  if (!suppliers.length) return [];
  const supplierIds = suppliers.map((supplier) => supplier.id);
  const [purchases, payments, debitNotes] = await Promise.all([
    prisma.supplierPurchase.groupBy({ by: ['supplierId'], where: { tenantId: tenant.id, supplierId: { in: supplierIds } }, _sum: { total: true } }),
    prisma.supplierPayment.groupBy({ by: ['supplierId'], where: { tenantId: tenant.id, supplierId: { in: supplierIds } }, _sum: { amount: true } }),
    prisma.debitNote.groupBy({ by: ['supplierId'], where: { tenantId: tenant.id, supplierId: { in: supplierIds }, status: { not: 'cancelled' } }, _sum: { amount: true } }),
  ]);
  const purchaseMap = new Map(purchases.map((row) => [row.supplierId, money(row._sum.total)]));
  const paymentMap = new Map(payments.map((row) => [row.supplierId, money(row._sum.amount)]));
  const noteMap = new Map(debitNotes.map((row) => [row.supplierId, money(row._sum.amount)]));
  const mismatches = [];
  for (const supplier of suppliers) {
    const components = { openingBalance: money(supplier.openingBalance), purchases: purchaseMap.get(supplier.id) || 0, payments: paymentMap.get(supplier.id) || 0, debitNotes: noteMap.get(supplier.id) || 0 };
    const calculated = money(Math.max(0, components.openingBalance + components.purchases - components.payments - components.debitNotes));
    if (!isMismatch(supplier.balance, calculated)) continue;
    mismatches.push({ id: supplier.id, name: supplier.name, stored: money(supplier.balance), calculated, difference: diff(supplier.balance, calculated), components });
    if (apply) await prisma.supplier.update({ where: { id: supplier.id }, data: { balance: calculated } });
  }
  return mismatches;
}

async function auditPurchases(tenant) {
  const purchases = await prisma.supplierPurchase.findMany({ where: { tenantId: tenant.id }, include: { debitNotes: { where: { status: { not: 'cancelled' } } } } });
  const mismatches = [];
  for (const purchase of purchases) {
    const noteTotal = purchase.debitNotes.reduce((sum, note) => money(sum + money(note.amount)), 0);
    const expected = money(Math.max(0, money(purchase.total) - money(purchase.amountPaid) - noteTotal));
    if (!isMismatch(purchase.balance, expected)) continue;
    mismatches.push({ id: purchase.id, refNo: purchase.refNo, stored: money(purchase.balance), expected, difference: diff(purchase.balance, expected), total: money(purchase.total), amountPaid: money(purchase.amountPaid), debitNotes: noteTotal });
    if (apply) await prisma.supplierPurchase.update({ where: { id: purchase.id }, data: { balance: expected, paymentStatus: paymentStatus(purchase.total, purchase.amountPaid, expected) } });
  }
  return mismatches;
}

async function auditLinkedCashAccounts(tenant) {
  const accounts = await prisma.account.findMany({ where: { tenantId: tenant.id, description: { contains: 'cashAccount:' } }, select: { id: true, code: true, name: true, balance: true, description: true } });
  const mismatches = [];
  for (const account of accounts) {
    const cashAccountId = linkedCashAccountId(account);
    if (!cashAccountId) continue;
    const cash = await prisma.cashAccount.findUnique({ where: { id: cashAccountId }, select: { id: true, name: true, type: true, balance: true } });
    if (!cash || !isMismatch(account.balance, cash.balance)) continue;
    mismatches.push({ accountId: account.id, code: account.code, account: account.name, cashAccountId: cash.id, cashAccount: cash.name, cashType: cash.type, storedAccountBalance: money(account.balance), cashBalance: money(cash.balance), difference: diff(account.balance, cash.balance) });
    if (apply) await syncLinkedTransactionAccountBalance(prisma, tenant.id, cash.id);
  }
  return mismatches;
}

async function auditJournals(tenant) {
  const entries = await prisma.journalEntry.findMany({ where: { tenantId: tenant.id, status: { not: 'reversed' } }, include: { lines: true } });
  const unbalanced = [];
  for (const entry of entries) {
    const debit = money(entry.lines.reduce((sum, line) => sum + money(line.debit), 0));
    const credit = money(entry.lines.reduce((sum, line) => sum + money(line.credit), 0));
    if (isMismatch(debit, credit)) unbalanced.push({ id: entry.id, entryNo: entry.entryNo, date: entry.date, description: entry.description, debit, credit, difference: diff(debit, credit) });
  }
  return unbalanced;
}

async function auditOrphanRefundArtifacts(tenant) {
  const notes = await prisma.creditNote.findMany({
    where: { tenantId: tenant.id, status: { not: 'cancelled' }, OR: [{ refundAmount: { gt: 0 } }, { refundWithdrawalId: { not: null } }, { refundCashAccountId: { not: null } }] },
    include: { customer: { select: { name: true } }, sale: { select: { total: true, subtotal: true, discount: true, cashDiscount: true, tax: true, amountPaid: true, status: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return notes.map((note) => ({ noteNo: note.noteNo, customer: note.customer?.name || note.customerId, amount: money(note.amount), refundAmount: money(note.refundAmount), reason: note.reason, salePaid: money(note.sale?.amountPaid), saleStatus: note.sale?.status || null }));
}

async function auditTenant(tenant) {
  const [customers, sales, suppliers, purchases, linkedCashAccounts, journals, refundArtifacts] = await Promise.all([
    auditCustomers(tenant),
    auditSales(tenant),
    auditSuppliers(tenant),
    auditPurchases(tenant),
    auditLinkedCashAccounts(tenant),
    auditJournals(tenant),
    auditOrphanRefundArtifacts(tenant),
  ]);
  return { tenantId: tenant.id, tenant: tenant.name || tenant.id, customers, sales, suppliers, purchases, linkedCashAccounts, journals, refundArtifacts };
}

async function main() {
  const tenants = await prisma.tenant.findMany({ where: tenantFilter ? { id: tenantFilter } : {}, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const results = [];
  for (const tenant of tenants) results.push(await auditTenant(tenant));
  const summary = results.map((r) => ({ tenantId: r.tenantId, tenant: r.tenant, customerMismatches: r.customers.length, saleMismatches: r.sales.length, supplierMismatches: r.suppliers.length, purchaseMismatches: r.purchases.length, linkedCashMismatches: r.linkedCashAccounts.length, unbalancedJournals: r.journals.length, refundArtifacts: r.refundArtifacts.length }));
  console.table(summary.filter((row) => Object.entries(row).some(([key, value]) => !['tenantId', 'tenant'].includes(key) && Number(value) > 0)));
  console.dir({ apply, tenantCount: tenants.length, summary, details: results.filter((r) => r.customers.length || r.sales.length || r.suppliers.length || r.purchases.length || r.linkedCashAccounts.length || r.journals.length || r.refundArtifacts.length) }, { depth: null });
  if (!apply) console.log('Dry run only. Re-run with --apply to reconcile customer/supplier/sale/purchase balances and linked cash accounts. Journal imbalance and refund artifacts are reported only for manual review.');
}

main().finally(() => prisma.$disconnect());