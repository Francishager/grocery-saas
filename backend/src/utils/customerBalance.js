const toMoney = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

const roundMoney = (value) => Math.round(toMoney(value) * 100) / 100;

const groupSumMap = (groups, field) => new Map(
  groups.map((group) => [group.customerId, toMoney(group._sum?.[field])])
);

async function getEffectiveCreditNoteTotalMap(client, scope, customerIds = []) {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!scope?.tenantId || !ids.length) return new Map();

  const notes = await client.creditNote.findMany({
    where: { tenantId: scope.tenantId, customerId: { in: ids }, status: { not: "cancelled" } },
    select: {
      customerId: true,
      saleId: true,
      amount: true,
      sale: { select: { id: true, total: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalsByCustomer = new Map();
  const totalsBySale = new Map();

  for (const note of notes) {
    const amount = toMoney(note.amount);
    if (note.saleId) {
      if (!note.sale || note.sale.status === "cancelled") continue;
      const current = totalsBySale.get(note.saleId) || { customerId: note.customerId, saleTotal: toMoney(note.sale.total), amount: 0 };
      current.amount = roundMoney(current.amount + amount);
      totalsBySale.set(note.saleId, current);
      continue;
    }

    totalsByCustomer.set(note.customerId, roundMoney(toMoney(totalsByCustomer.get(note.customerId)) + amount));
  }

  for (const saleGroup of totalsBySale.values()) {
    const effectiveAmount = Math.min(toMoney(saleGroup.saleTotal), toMoney(saleGroup.amount));
    totalsByCustomer.set(saleGroup.customerId, roundMoney(toMoney(totalsByCustomer.get(saleGroup.customerId)) + effectiveAmount));
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
    client.saleRecord.groupBy({
      by: ["customerId"],
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    client.customerPayment.groupBy({
      by: ["customerId"],
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

  const salesMap = groupSumMap(sales, "total");
  const paymentsMap = groupSumMap(payments, "amount");
  const withdrawalsMap = groupSumMap(withdrawals, "amount");
  const creditNotesMap = creditNotes;
  const creditReturnsMap = groupSumMap(creditReturns, "total");

  return new Map(customerList.map((customer) => {
    const openingBalance = Math.max(0, toMoney(customer.openingBalance));
    const receivableSales = salesMap.get(customer.id) || 0;
    const customerPayments = paymentsMap.get(customer.id) || 0;
    const customerWithdrawals = withdrawalsMap.get(customer.id) || 0;
    const creditNoteTotal = creditNotesMap.get(customer.id) || 0;
    const creditReturnTotal = creditReturnsMap.get(customer.id) || 0;
    const balance = roundMoney(openingBalance + receivableSales + customerWithdrawals - customerPayments - creditNoteTotal - creditReturnTotal);
    return [customer.id, {
      customerId: customer.id,
      balance,
      components: {
        openingBalance,
        receivableSales,
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
    client.saleRecord.aggregate({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    client.customerPayment.aggregate({
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

  const openingBalance = Math.max(0, toMoney(customer.openingBalance));
  const receivableSales = toMoney(sales._sum.total);
  const customerPayments = toMoney(payments._sum.amount);
  const customerWithdrawals = toMoney(withdrawals._sum.amount);
  const creditNoteTotal = toMoney(creditNotes.get(customerId));
  const creditReturnTotal = toMoney(creditReturns._sum.total);

  return {
    customerId,
    balance: roundMoney(openingBalance + receivableSales + customerWithdrawals - customerPayments - creditNoteTotal - creditReturnTotal),
    components: {
      openingBalance,
      receivableSales,
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
