import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

dotenv.config({ quiet: true });
const prisma = new PrismaClient();
const tenantId = 'cmttvb1zz02816peswb6cf02j';
const tenantName = 'ABBA SHAK ENTERPRISES LIMITED';
const apply = process.argv.includes('--apply');
const transactionTables = [
  'sales', 'sale_records', 'customer_payments', 'customer_withdrawals', 'credit_notes',
  'sale_returns', 'invoices', 'purchases', 'supplier_purchases', 'supplier_payments',
  'debit_notes', 'expenses', 'cash_transactions', 'journal_entries', 'tax_payments',
  'payroll', 'payroll_payments', 'payroll_adjustments', 'payroll_deductions',
  'salary_advances', 'salary_advance_recoveries', 'rentals', 'stock_transfers',
  'restaurant_orders', 'tips', 'deliveries', 'reservations', 'fuel_card_transactions',
  'fuel_deliveries', 'fuel_meter_readings', 'fuel_shift_reports', 'fuel_dipstick_readings',
  'production_orders', 'production_batches', 'production_waste', 'quality_checks',
  'harvests', 'farm_expenses', 'appointments', 'work_orders', 'service_contracts',
  'service_job_cards', 'car_wash_records', 'garage_services', 'assets', 'tenant_metrics',
];
const expectedPopulated = new Set(['sales', 'sale_records', 'customer_payments', 'credit_notes',
  'sale_returns', 'cash_transactions', 'journal_entries']);
const children = [['sale_items', 'sales', 'saleId'], ['sale_record_items', 'sale_records', 'saleId'],
  ['sale_return_items', 'sale_returns', 'returnId'], ['journal_lines', 'journal_entries', 'entryId']];
const masters = ['customers', 'suppliers', 'accounts', 'cash_accounts', 'products'];
const financialModels = new Set(['Sale', 'SaleRecord', 'Receipt', 'Credit-debit-notes', 'CreditNote',
  'DebitNote', 'Expense', 'JournalEntry', 'CashTransaction', 'CustomerPayment', 'CustomerWithdrawal',
  'Purchase', 'SupplierPurchase', 'SupplierPayment', 'Invoice', 'Return', 'SaleReturn', 'Report']);
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const tableWhere = (table) => `SELECT * FROM public.${quote(table)} WHERE "tenantId" = $1`;
const childWhere = ([table, parent, key]) => `SELECT c.* FROM public.${quote(table)} c JOIN public.${quote(parent)} p ON p.id = c.${quote(key)} WHERE p."tenantId" = $1`;
const json = (value) => JSON.stringify(value, null, 2);

async function counts(client) {
  const rows = await client.$queryRawUnsafe(transactionTables.map((table) =>
    `SELECT '${table}' AS "table", COUNT(*)::int AS count FROM public.${quote(table)} WHERE "tenantId" = $1`).join(' UNION ALL '), tenantId);
  return Object.fromEntries(rows.map((row) => [row.table, row.count]));
}

async function snapshot(client) {
  const selections = [...transactionTables, ...masters, 'audit_logs', 'tenant_activity_logs', 'notifications']
    .map((table) => [table, tableWhere(table)]).concat(children.map((child) => [child[0], childWhere(child)]));
  const rows = await client.$queryRawUnsafe(selections.map(([table, query]) =>
    `SELECT '${table}' AS "table", COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) AS rows FROM (${query}) r`).join(' UNION ALL '), tenantId);
  return Object.fromEntries(rows.map((row) => [row.table, row.rows]));
}

function plan(data) {
  for (const table of transactionTables) {
    assert(expectedPopulated.has(table) || data[table].length === 0,
      `New transactions in ${table} require review before resetting`);
  }
  const products = new Map(data.products.map((product) => [product.id, product]));
  const delta = new Map();
  const add = (id, quantity) => {
    assert(products.has(id), 'Stock movement points outside the target tenant');
    assert(Number.isInteger(quantity), 'Non-integral base stock quantity requires review');
    if (products.get(id).itemType !== 'service') delta.set(id, (delta.get(id) || 0) + quantity);
  };
  assert(data.sales.every((sale) => sale.status === 'completed') && data.sale_records.every((sale) => sale.status === 'completed'),
    'Unexpected sale status requires review of stock reversal');
  for (const item of [...data.sale_items, ...data.sale_record_items]) {
    add(item.productId, Math.round(item.quantity * (item.conversionFactor || 1)));
  }
  for (const item of data.sale_return_items) {
    const parent = data.sale_returns.find((row) => row.id === item.returnId);
    assert(['completed', 'stock_adjusted'].includes(parent?.status), 'Unexpected stock return status');
    add(item.productId, -item.quantity);
  }
  const adjustmentLogs = data.audit_logs.filter((log) => log.model === 'Product' && log.changes?.stockMovement);
  for (const log of adjustmentLogs) {
    const before = log.changes?.before?.quantity;
    const after = log.changes?.after?.quantity;
    assert(Number.isFinite(before) && Number.isFinite(after), 'Incomplete stock adjustment');
    add(log.recordId, before - after);
  }
  const affectedIds = new Set(transactionTables.flatMap((table) => data[table].map((row) => row.id)));
  const financialLog = (log) => {
    const details = log.changes?.data || log.details?.data || log.details || {};
    return financialModels.has(log.model) || affectedIds.has(log.recordId)
      || (log.model === 'Product' && !!log.changes?.stockMovement)
      || (log.model === 'Customer' && (Array.isArray(details.items) || details.amount !== undefined))
      || (log.model === 'Account' && (Array.isArray(details.lines) || details.debitAccountId || details.creditAccountId));
  };
  return {
    deleted: Object.fromEntries(transactionTables.filter((table) => data[table].length).map((table) => [table, data[table].length])),
    stock: [...delta].filter(([, amount]) => amount).map(([id, amount]) => {
      const product = products.get(id);
      const quantity = product.quantity + amount;
      assert(quantity >= 0, 'Stock reversal would result in negative inventory');
      return { id, name: product.name, before: product.quantity, after: quantity };
    }),
    adjustmentLogIds: adjustmentLogs.map((log) => log.id),
    auditIds: data.audit_logs.filter(financialLog).map((log) => log.id),
    activityIds: data.tenant_activity_logs.filter(financialLog).map((log) => log.id),
    financialBalances: Object.fromEntries(masters.filter((table) => table !== 'products').map((table) =>
      [table, data[table].map(({ id, name, balance, openingBalance }) => ({ id, name, balance, openingBalance }))])),
  };
}

async function verify(client) {
  const remaining = await counts(client);
  assert(Object.values(remaining).every((count) => count === 0), 'Some transactions remain');
  const balances = {};
  for (const table of masters.filter((table) => table !== 'products')) {
    const rows = await client.$queryRawUnsafe(tableWhere(table), tenantId);
    assert(rows.every((row) => row.balance === 0 && (!('openingBalance' in row) || row.openingBalance === 0)),
      `Nonzero balance remains in ${table}`);
    balances[table] = rows.map(({ name, balance }) => ({ name, balance }));
  }
  return { remaining, balances };
}

try {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } });
  assert.equal(tenant?.name, tenantName, 'Tenant identity mismatch');
  assert.equal(tenant.slug, 'abashaka-phones', 'Tenant slug mismatch');
  if (!apply) {
    console.log(json({ mode: 'dry-run', tenant, plan: plan(await snapshot(prisma)) }));
  } else {
    const backupDir = path.join(tmpdir(), 'jibusales-recovery');
    mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `abba-all-transactions-${Date.now()}.json`);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
      for (const table of [...masters, ...expectedPopulated]) {
        await tx.$queryRawUnsafe(`${tableWhere(table)} FOR UPDATE`, tenantId);
      }
      const data = await snapshot(tx);
      const resetPlan = plan(data);
      const backup = json({ tenant, capturedAt: new Date().toISOString(), plan: resetPlan, tables: data });
      const descriptor = openSync(backupPath, 'wx', 0o600);
      try { writeFileSync(descriptor, backup, 'utf8'); fsyncSync(descriptor); } finally { closeSync(descriptor); }
      assert.equal(readFileSync(backupPath, 'utf8'), backup, 'Backup verification failed');

      // Child-first deletion keeps every operation scoped through this tenant's parent records.
      for (const [table, parent, key] of children) {
        await tx.$executeRawUnsafe(`DELETE FROM public.${quote(table)} c USING public.${quote(parent)} p WHERE p.id = c.${quote(key)} AND p."tenantId" = $1`, tenantId);
      }
      for (const table of ['customer_payments', 'credit_notes', 'sale_returns', 'sale_records', 'sales', 'cash_transactions', 'journal_entries']) {
        const removed = await tx.$executeRawUnsafe(`DELETE FROM public.${quote(table)} WHERE "tenantId" = $1`, tenantId);
        assert.equal(removed, data[table].length, `Unexpected affected rows in ${table}`);
      }
      await tx.auditLog.deleteMany({ where: { tenantId, id: { in: resetPlan.auditIds } } });
      await tx.tenantActivityLog.deleteMany({ where: { tenantId, id: { in: resetPlan.activityIds } } });
      for (const stock of resetPlan.stock) {
        await tx.product.updateMany({ where: { tenantId, id: stock.id }, data: { quantity: stock.after } });
      }
      await tx.customer.updateMany({ where: { tenantId }, data: { balance: 0, openingBalance: 0, openingBalanceDate: null, openingBalanceNote: null, trustScore: 0 } });
      await tx.supplier.updateMany({ where: { tenantId }, data: { balance: 0, openingBalance: 0, openingBalanceDate: null, openingBalanceNote: null } });
      await tx.cashAccount.updateMany({ where: { tenantId }, data: { balance: 0 } });
      await tx.account.updateMany({ where: { tenantId }, data: { balance: 0 } });
      const verified = await verify(tx);
      assert.equal(await tx.auditLog.count({ where: { tenantId, id: { in: resetPlan.adjustmentLogIds } } }), 0);
      await tx.auditLog.create({ data: { tenantId, targetTenantId: tenantId, userId: 'maintenance', userEmail: 'maintenance',
        action: 'reset', model: 'TenantTransactions', recordId: tenantId, severity: 'critical',
        changes: { reason: 'User requested deletion of all ABBA SHAK business transactions, including expenses and report data',
          backupSha256: createHash('sha256').update(backup).digest('hex'), deleted: resetPlan.deleted, stock: resetPlan.stock } } });
      return { tenant, backupPath, deleted: resetPlan.deleted, stock: resetPlan.stock, ...verified };
    }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 15000 });
    writeFileSync(backupPath.replace('.json', '.result.json'), json(result), { flag: 'wx', mode: 0o600 });
    console.log(json({ mode: 'applied', ...result }));
  }
} finally {
  await prisma.$disconnect();
}
