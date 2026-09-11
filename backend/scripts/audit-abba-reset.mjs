import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ quiet: true });
const prisma = new PrismaClient();
const tenantId = 'cmttvb1zz02816peswb6cf02j';
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
try {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } });
  if (tenant?.name !== 'ABBA SHAK ENTERPRISES LIMITED') throw new Error('Tenant identity mismatch');
  const columns = await prisma.$queryRaw`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
  const tenantTables = columns.filter((column) => column.column_name === 'tenantId').map((column) => column.table_name);
  const counts = await prisma.$queryRawUnsafe(tenantTables.map((table) => `SELECT '${table}' AS "table", COUNT(*)::int AS count FROM public.${quote(table)} WHERE "tenantId" = $1`).join(' UNION ALL '), tenantId);
  const foreignKeys = await prisma.$queryRaw`SELECT tc.table_name AS child, kcu.column_name AS column, ccu.table_name AS parent, ccu.column_name AS target, rc.delete_rule AS on_delete FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' ORDER BY child`;
  const details = {};
  const inspect = ['sales', 'sale_records', 'customer_payments', 'credit_notes', 'sale_returns', 'expenses', 'cash_accounts', 'cash_transactions', 'accounts', 'journal_entries', 'customers', 'suppliers', 'products', 'tenant_metrics', 'stock_adjustments'];
  for (const table of inspect.filter((table) => counts.some((row) => row.table === table && row.count))) {
    details[table] = await prisma.$queryRawUnsafe(`SELECT * FROM public.${quote(table)} WHERE "tenantId" = $1`, tenantId);
  }
  const children = {};
  for (const [table, parent, key] of [['sale_items', 'sales', 'saleId'], ['sale_record_items', 'sale_records', 'saleId'], ['sale_return_items', 'sale_returns', 'returnId'], ['journal_lines', 'journal_entries', 'entryId']]) {
    children[table] = await prisma.$queryRawUnsafe(`SELECT c.* FROM public.${quote(table)} c JOIN public.${quote(parent)} p ON p.id = c.${quote(key)} WHERE p."tenantId" = $1`, tenantId);
  }
  const auditGroups = await prisma.$queryRaw`SELECT model, action, COUNT(*)::int FROM audit_logs WHERE "tenantId" = ${tenantId} GROUP BY model, action`;
  const logGroups = await prisma.$queryRaw`SELECT model, action, COUNT(*)::int FROM tenant_activity_logs WHERE "tenantId" = ${tenantId} GROUP BY model, action`;
  const movements = await prisma.auditLog.findMany({ where: { tenantId, model: 'Product', action: 'update' }, select: { id: true, changes: true } });
  const products = details.products?.map(({ id, name, quantity, itemType }) => ({ id, name, quantity, itemType }));
  console.log(JSON.stringify({ tenant, counts: counts.filter((row) => row.count), products, children, auditGroups, logGroups, movements,
    foreignKeys: foreignKeys.filter((key) => ['sales', 'sale_records', 'sale_returns', 'journal_entries', 'customer_payments', 'cash_transactions', 'credit_notes'].includes(key.parent)),
    otherTables: [...new Set(columns.map((column) => column.table_name))].filter((table) => !tenantTables.includes(table)),
  }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
} finally {
  await prisma.$disconnect();
}
