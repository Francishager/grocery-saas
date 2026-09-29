const toMoney = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

const roundMoney = (value) => Math.round(toMoney(value) * 100) / 100;

const hasNumericValue = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

function saleLineNetSubtotal(sale) {
  return (sale?.items || []).reduce((sum, item) => {
    const quantity = toMoney(item?.quantity);
    const price = toMoney(item?.price);
    if (quantity > 0 && price > 0) return roundMoney(sum + price * quantity - toMoney(item?.discount) - toMoney(item?.cashDiscount));
    return roundMoney(sum + toMoney(item?.total));
  }, 0);
}

export function receivableSaleNetTotal(sale) {
  const storedTotal = toMoney(sale?.total);
  const hasAccountingParts = [sale?.subtotal, sale?.discount, sale?.cashDiscount, sale?.tax].some(hasNumericValue);
  const subtotal = hasNumericValue(sale?.subtotal) ? toMoney(sale.subtotal) : saleLineNetSubtotal(sale);
  const computedNetTotal = roundMoney(Math.max(0, subtotal - toMoney(sale?.discount) - toMoney(sale?.cashDiscount) + toMoney(sale?.tax)));
  if (hasAccountingParts && subtotal > 0) return computedNetTotal;
  return storedTotal > 0 ? storedTotal : computedNetTotal;
}

export function receivableSaleOutstandingBeforeCreditNotes(sale) {
  if (!sale || sale.status === "cancelled") return 0;
  return roundMoney(Math.max(0, receivableSaleNetTotal(sale) - toMoney(sale?.amountPaid)));
}

export function effectiveCreditNoteRows(notes = []) {
  const creditedBySale = new Map();
  return (Array.isArray(notes) ? notes : []).map((note) => {
    const recordedAmount = toMoney(note?.amount);
    let effectiveAmount = recordedAmount;
    let saleCreditLimit = null;
    if (note?.saleId) {
      // Payments remain customer funds after a return; only the sale's net value caps credit notes.
      saleCreditLimit = !note.sale || note.sale.status === "cancelled" ? 0 : receivableSaleNetTotal(note.sale);
      const alreadyCredited = toMoney(creditedBySale.get(note.saleId));
      const remainingSaleCredit = roundMoney(Math.max(0, saleCreditLimit - alreadyCredited));
      effectiveAmount = Math.min(recordedAmount, remainingSaleCredit);
      creditedBySale.set(note.saleId, roundMoney(alreadyCredited + effectiveAmount));
    }
    return {
      ...note,
      recordedAmount,
      effectiveAmount: roundMoney(Math.max(0, effectiveAmount)),
      saleCreditLimit,
      saleNetTotal: note?.sale ? receivableSaleNetTotal(note.sale) : null,
    };
  });
}
const groupSumMap = (groups, field) => new Map(
  groups.map((group) => [group.customerId, toMoney(group._sum?.[field])])
);

function summarizeSaleAndCustomerPayments(sales = [], payments = []) {
  const saleCustomerById = new Map(sales.map((sale) => [sale.id, sale.customerId]));
  const linkedPaymentsBySale = new Map();
  const unlinkedPaymentsByCustomer = new Map();

  for (const payment of payments) {
    const amount = toMoney(payment.amount ?? payment._sum?.amount);
    if (payment.saleId && saleCustomerById.get(payment.saleId) === payment.customerId) {
      linkedPaymentsBySale.set(payment.saleId, roundMoney(toMoney(linkedPaymentsBySale.get(payment.saleId)) + amount));
    } else {
      unlinkedPaymentsByCustomer.set(payment.customerId,
        roundMoney(toMoney(unlinkedPaymentsByCustomer.get(payment.customerId)) + amount));
    }
  }

  const salesByCustomer = new Map();
  const salePaymentsByCustomer = new Map();
  for (const sale of sales) {
    const customerId = sale.customerId;
    const net = receivableSaleNetTotal(sale);
    const recordedPaid = Math.max(0, toMoney(sale.amountPaid));
    const linkedPaid = Math.max(0, toMoney(linkedPaymentsBySale.get(sale.id)));
    // amountPaid is cumulative; sale-linked payment rows can contain those same receipts.
    const paidOnce = Math.max(recordedPaid, linkedPaid);

    salesByCustomer.set(customerId, roundMoney(toMoney(salesByCustomer.get(customerId)) + net));
    salePaymentsByCustomer.set(customerId,
      roundMoney(toMoney(salePaymentsByCustomer.get(customerId)) + paidOnce));
  }

  return { salesByCustomer, salePaymentsByCustomer, unlinkedPaymentsByCustomer };
}

async function getEffectiveCreditNoteTotalMap(client, scope, customerIds = []) {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!scope?.tenantId || !ids.length) return new Map();

  const notes = await client.creditNote.findMany({
    where: { tenantId: scope.tenantId, customerId: { in: ids }, status: { not: "cancelled" } },
    select: {
      customerId: true,
      saleId: true,
      amount: true,
      createdAt: true,
      sale: { select: { id: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalsByCustomer = new Map();
  for (const note of effectiveCreditNoteRows(notes)) {
    if (note.effectiveAmount <= 0) continue;
    totalsByCustomer.set(note.customerId, roundMoney(toMoney(totalsByCustomer.get(note.customerId)) + note.effectiveAmount));
  }

  return totalsByCustomer;
}

export async function getCustomerReceivableBalanceMap(client, scope, customers = []) {
  if (!scope?.tenantId) return new Map();

  const customerList = customers.filter((customer) => customer?.id);
  const customerIds = [...new Set(customerList.map((customer) => customer.id))];
  if (!customerIds.length) return new Map();

  const tenantCustomerWhere = { tenantId: scope.tenantId, customerId: { in: customerIds } };
  const [sales, payments, withdrawals, creditNotes, creditReturns] = await Promise.all([
    client.saleRecord.findMany({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      select: { id: true, customerId: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, status: true },
    }),
    client.customerPayment.groupBy({
      by: ["customerId", "saleId"],
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    client.customerWithdrawal.groupBy({
      by: ["customerId"],
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    getEffectiveCreditNoteTotalMap(client, scope, customerIds),

    client.saleReturn.groupBy({
      by: ["customerId"],
      where: { ...tenantCustomerWhere, status: "completed", refundMethod: "credit" },
      _sum: { total: true },
    }),
  ]);

  const { salesByCustomer, salePaymentsByCustomer, unlinkedPaymentsByCustomer } =
    summarizeSaleAndCustomerPayments(sales, payments);
  const withdrawalsMap = groupSumMap(withdrawals, "amount");
  const creditNotesMap = creditNotes;
  const creditReturnsMap = groupSumMap(creditReturns, "total");

  return new Map(customerList.map((customer) => {
    const openingBalance = Math.max(0, toMoney(customer.openingBalance));
    const receivableSales = salesByCustomer.get(customer.id) || 0;
    const salePayments = salePaymentsByCustomer.get(customer.id) || 0;
    const customerPayments = unlinkedPaymentsByCustomer.get(customer.id) || 0;
    const customerWithdrawals = withdrawalsMap.get(customer.id) || 0;
    const creditNoteTotal = creditNotesMap.get(customer.id) || 0;
    const creditReturnTotal = creditReturnsMap.get(customer.id) || 0;
    const balance = roundMoney(openingBalance + receivableSales - salePayments + customerWithdrawals - customerPayments - creditNoteTotal - creditReturnTotal);
    return [customer.id, {
      customerId: customer.id,
      balance,
      components: {
        openingBalance,
        receivableSales,
        salePayments,
        customerPayments,
        customerWithdrawals,
        creditNotes: creditNoteTotal,
        creditReturns: creditReturnTotal,
      },
    }];
  }));
}

export async function attachCustomerReceivableBalances(client, scope, customers = []) {
  const balanceMap = await getCustomerReceivableBalanceMap(client, scope, customers);
  return customers.map((customer) => {
    const reconciled = balanceMap.get(customer.id);
    return reconciled ? { ...customer, balance: reconciled.balance, balanceComponents: reconciled.components } : customer;
  });
}

export async function calculateCustomerReceivableBalance(client, scope, customerId) {
  if (!scope?.tenantId || !customerId) return null;

  const customer = await client.customer.findFirst({
    where: { id: customerId, tenantId: scope.tenantId },
    select: { id: true, openingBalance: true },
  });
  if (!customer) return null;

  const tenantCustomerWhere = { tenantId: scope.tenantId, customerId };
  const [sales, payments, withdrawals, creditNotes, creditReturns] = await Promise.all([
    client.saleRecord.findMany({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      select: { id: true, customerId: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, status: true },
    }),
    client.customerPayment.groupBy({
      by: ["customerId", "saleId"],
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    client.customerWithdrawal.aggregate({
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    getEffectiveCreditNoteTotalMap(client, scope, [customerId]),

    client.saleReturn.aggregate({
      where: { ...tenantCustomerWhere, status: "completed", refundMethod: "credit" },
      _sum: { total: true },
    }),
  ]);

  const { salesByCustomer, salePaymentsByCustomer, unlinkedPaymentsByCustomer } =
    summarizeSaleAndCustomerPayments(sales, payments);
  const openingBalance = Math.max(0, toMoney(customer.openingBalance));
  const receivableSales = salesByCustomer.get(customerId) || 0;
  const salePayments = salePaymentsByCustomer.get(customerId) || 0;
  const customerPayments = unlinkedPaymentsByCustomer.get(customerId) || 0;
  const customerWithdrawals = toMoney(withdrawals._sum.amount);
  const creditNoteTotal = toMoney(creditNotes.get(customerId));
  const creditReturnTotal = toMoney(creditReturns._sum.total);

  return {
    customerId,
    balance: roundMoney(openingBalance + receivableSales - salePayments + customerWithdrawals - customerPayments - creditNoteTotal - creditReturnTotal),
    components: {
      openingBalance,
      receivableSales,
      salePayments,
      customerPayments,
      customerWithdrawals,
      creditNotes: creditNoteTotal,
      creditReturns: creditReturnTotal,
    },
  };
}

export async function reconcileCustomerReceivableBalance(client, scope, customerId) {
  const result = await calculateCustomerReceivableBalance(client, scope, customerId);
  if (!result) return null;

  const customer = await client.customer.update({
    where: { id: customerId },
    data: { balance: result.balance },
  });

  return { customer, ...result };
}

export async function outstandingCustomerSummary(client, scope) {
  const customers = await client.customer.findMany({
    where: { tenantId: scope.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
    select: { id: true, openingBalance: true },
  });
  const balances = await getCustomerReceivableBalanceMap(client, scope, customers);
  const outstanding = [...balances.values()].filter((row) => row.balance > 0);
  return { _sum: { balance: roundMoney(outstanding.reduce((sum, row) => sum + row.balance, 0)) }, _count: outstanding.length };
}
