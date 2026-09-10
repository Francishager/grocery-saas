import { receivableSaleNetTotal } from './customerBalance.js';

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// Only repair a provable gross-versus-net overcredit. Other differences need review.
export function planDiscountCreditRepair(customer, notes, calculatedBalance) {
  const groups = new Map();
  const review = [];
  const noteChanges = [];
  const saleChanges = [];
  for (const note of notes) {
    if (note.status === 'cancelled' || !note.saleId) continue;
    if (!groups.has(note.saleId)) groups.set(note.saleId, []);
    groups.get(note.saleId).push(note);
  }
  for (const [saleId, rows] of groups) {
    const sale = rows[0].sale;
    if (!sale) {
      review.push({ saleId, reason: 'Original sale is missing' });
      continue;
    }
    const discount = money(Number(sale.discount) + Number(sale.cashDiscount));
    if (discount <= 0) continue;
    const net = receivableSaleNetTotal(sale);
    const credited = money(rows.reduce((sum, row) => sum + Number(row.amount), 0));
    const excess = money(credited - net);
    if (excess <= 0) continue;
    const validOwner = sale.tenantId === customer.tenantId && sale.customerId === customer.id
      && rows.every((row) => row.tenantId === customer.tenantId && row.customerId === customer.id);
    if (!validOwner || sale.status !== 'completed' || Number(sale.amountPaid) !== 0
      || money(sale.total) !== net || excess > discount
      || rows.some((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0)) {
      review.push({ saleId, reason: 'Overcredit requires review of ownership, payments, sale status or totals', excess });
      continue;
    }
    let remaining = net;
    const ordered = [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      || a.id.localeCompare(b.id));
    for (const row of ordered) {
      const amount = money(Math.min(Number(row.amount), remaining));
      remaining = money(remaining - amount);
      if (amount !== money(row.amount)) {
        noteChanges.push({ id: row.id, noteNo: row.noteNo, before: money(row.amount), after: amount });
      }
    }
    saleChanges.push({ id: saleId, receiptNo: sale.receiptNo,
      before: { balance: money(sale.balance), paymentStatus: sale.paymentStatus },
      after: { balance: 0, paymentStatus: 'paid' } });
  }
  const correction = money(noteChanges.reduce((sum, row) => sum + row.before - row.after, 0));
  const before = money(customer.balance);
  const after = money(calculatedBalance);
  const difference = money(after - before);
  if (difference !== 0 && (!noteChanges.length || difference !== correction)) {
    review.push({ reason: 'Customer balance difference does not match the discount overcredit', difference, correction });
  }
  return { tenantId: customer.tenantId, customerId: customer.id, customerName: customer.name,
    status: review.length ? 'review' : noteChanges.length ? 'repair' : 'unchanged',
    before, after, correction, noteChanges, saleChanges, review };
}

export async function applyDiscountCreditRepair(client, plan) {
  if (plan.status !== 'repair') return false;
  // The caller supplies a serializable transaction; every write also checks its previous value.
  for (const note of plan.noteChanges) {
    const result = await client.creditNote.updateMany({
      where: { id: note.id, tenantId: plan.tenantId, customerId: plan.customerId,
        status: { not: 'cancelled' }, amount: note.before },
      data: { amount: note.after },
    });
    if (result.count !== 1) throw new Error('Credit note changed during reconciliation; retry the dry run');
  }
  for (const sale of plan.saleChanges) {
    const result = await client.saleRecord.updateMany({
      where: { id: sale.id, tenantId: plan.tenantId, customerId: plan.customerId,
        balance: sale.before.balance, paymentStatus: sale.before.paymentStatus },
      data: sale.after,
    });
    if (result.count !== 1) throw new Error('Sale changed during reconciliation; retry the dry run');
  }
  const result = await client.customer.updateMany({
    where: { id: plan.customerId, tenantId: plan.tenantId, balance: plan.before },
    data: { balance: plan.after },
  });
  if (result.count !== 1) throw new Error('Customer changed during reconciliation; retry the dry run');
  await client.auditLog.create({ data: {
    tenantId: plan.tenantId, userId: 'system:discount-credit-repair', userEmail: 'system',
    action: 'reconcile_discount_credit', model: 'Customer', recordId: plan.customerId,
    changes: plan,
  } });
  return true;
}
