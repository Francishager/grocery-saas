import { effectiveCreditNoteRows, receivableSaleNetTotal } from './customerBalance.js';

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const stockReasons = new Set(['sales_return', 'cancellation']);
const saleFields = { id: true, tenantId: true, customerId: true, total: true, subtotal: true,
  tax: true, discount: true, cashDiscount: true, amountPaid: true, balance: true,
  status: true, paymentStatus: true, paymentMethod: true, createdAt: true, dueDate: true };
const itemFields = { id: true, productId: true, quantity: true, price: true, total: true,
  cost: true, conversionFactor: true, discount: true, cashDiscount: true };
const noteSelection = { where: { status: { not: 'cancelled' } },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  select: { id: true, noteNo: true, saleId: true, tenantId: true, customerId: true,
    amount: true, reason: true, status: true, createdAt: true } };

export function netReceivableSale(sale, stockReturns = []) {
  if (['cancelled', 'refunded'].includes(sale.status)) return null;
  const net = receivableSaleNetTotal(sale);
  const notes = (sale.creditNotes || []).filter((note) => note.status !== 'cancelled'
    && note.tenantId === sale.tenantId && note.customerId === sale.customerId);
  const credited = money(effectiveCreditNoteRows(notes.map((note) => ({ ...note, sale })))
    .reduce((sum, note) => sum + note.effectiveAmount, 0));
  if (notes.some((note) => note.reason === 'cancellation') || (credited > 0 && credited >= net)) return null;
  const total = money(Math.max(0, net - credited));
  const ratio = net > 0 ? total / net : 1;
  const tax = money(Number(sale.tax || 0) * ratio);
  const discount = money(Number(sale.discount || 0) * ratio);
  const cashDiscount = money(Number(sale.cashDiscount || 0) * ratio);
  const returnNos = new Set(notes.filter((note) => stockReasons.has(note.reason)).map((note) => `RET-${note.noteNo}`));
  const returned = new Map();
  for (const record of stockReturns) {
    if (record.tenantId !== sale.tenantId || !returnNos.has(record.returnNo)
      || record.status !== 'stock_adjusted' || record.refundMethod !== 'credit_note_stock') continue;
    for (const item of record.items) returned.set(item.productId,
      Number(returned.get(item.productId) || 0) + Number(item.quantity || 0));
  }
  let items = (sale.items || []).map((item) => {
    const factor = Number(item.conversionFactor) > 0 ? Number(item.conversionFactor) : 1;
    const originalQuantity = Number(item.quantity || 0);
    const baseReturned = Math.min(originalQuantity * factor, Number(returned.get(item.productId) || 0));
    returned.set(item.productId, Number(returned.get(item.productId) || 0) - baseReturned);
    const quantity = Math.max(0, originalQuantity - baseReturned / factor);
    return { ...item, quantity, total: originalQuantity ? Number(item.total || 0) * quantity / originalQuantity : 0 };
  }).filter((item) => item.quantity > 0);
  const itemTotal = items.reduce((sum, item) => sum + item.total, 0);
  if (credited > 0 && itemTotal > 0) {
    let remainingRevenue = money(total - tax);
    items = items.map((item, index) => {
      const lineTotal = index === items.length - 1 ? remainingRevenue : money((total - tax) * item.total / itemTotal);
      remainingRevenue = money(remainingRevenue - lineTotal);
      return { ...item, total: lineTotal };
    });
  }
  const balance = money(Math.max(0, total - Number(sale.amountPaid || 0)));
  return { ...sale, originalTotal: net, creditNoteAmount: credited, total,
    subtotal: money(total - tax + discount + cashDiscount), tax, discount, cashDiscount,
    balance, paymentStatus: balance <= 0 ? 'paid' : Number(sale.amountPaid) > 0 || credited > 0 ? 'partial' : sale.paymentStatus,
    items };
}

function aggregateRows(rows, args) {
  const result = {};
  for (const operation of ['_sum', '_avg']) {
    if (!args[operation]) continue;
    result[operation] = Object.fromEntries(Object.keys(args[operation]).map((key) => {
      const sum = money(rows.reduce((total, row) => total + Number(row[key] || 0), 0));
      return [key, rows.length ? operation === '_avg' ? sum / rows.length : sum : null];
    }));
  }
  if (args._count) result._count = args._count === true ? rows.length
    : Object.fromEntries(Object.keys(args._count).map((key) => [key, key === '_all' ? rows.length : rows.filter((row) => row[key] != null).length]));
  return result;
}

function groupRows(rows, args) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(args.by.map((field) => row[field]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((group) => ({
    ...Object.fromEntries(args.by.map((field) => [field, group[0][field]])), ...aggregateRows(group, args),
  }));
}

// A read-only current-sales view. Ledgers/statements use the original documents and note reversals.
export function createReceivableSalesView(client) {
  async function load(args = {}) {
    const { skip, take, select, include, _sum, _avg, _count, by, ...query } = args;
    const requestedItems = select?.items || include?.items;
    const items = requestedItems?.select ? { ...requestedItems, select: { ...requestedItems.select, ...itemFields } }
      : requestedItems || true;
    const rows = await client.saleRecord.findMany({ ...query,
      where: { AND: [query.where || {}, { status: { notIn: ['cancelled', 'refunded'] } }] },
      ...(select ? { select: { ...select, ...saleFields, items, creditNotes: noteSelection } }
        : { include: { ...include, items, creditNotes: noteSelection } }),
    });
    const returnScopes = new Map();
    for (const sale of rows) {
      const noteNos = (sale.creditNotes || []).filter((note) => stockReasons.has(note.reason)).map((note) => `RET-${note.noteNo}`);
      if (noteNos.length) returnScopes.set(sale.tenantId, [...(returnScopes.get(sale.tenantId) || []), ...noteNos]);
    }
    const stockReturns = returnScopes.size ? await client.saleReturn.findMany({
      where: { OR: [...returnScopes].map(([tenantId, returnNos]) => ({ tenantId, returnNo: { in: returnNos } })),
        status: 'stock_adjusted', refundMethod: 'credit_note_stock' },
      select: { tenantId: true, returnNo: true, status: true, refundMethod: true,
        items: { select: { productId: true, quantity: true } } },
    }) : [];
    return rows.map((row) => netReceivableSale(row, stockReturns)).filter(Boolean);
  }
  return {
    async findMany(args = {}) {
      const rows = await load(args);
      const skip = Math.max(0, Number(args.skip || 0));
      return rows.slice(skip, args.take == null ? undefined : skip + Number(args.take));
    },
    async count(args = {}) { return (await load(args)).length; },
    async aggregate(args = {}) { return aggregateRows(await load(args), args); },
    async groupBy(args) { return groupRows(await load(args), args); },
    async itemGroupBy(args) {
      const sales = await load({ where: args.where?.sale });
      return groupRows(sales.flatMap((sale) => sale.items), args);
    },
  };
}
