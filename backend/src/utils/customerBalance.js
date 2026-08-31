const toMoney = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

const roundMoney = (value) => Math.round(toMoney(value) * 100) / 100;

const groupSumMap = (groups, field) => new Map(
  groups.map((group) => [group.customerId, toMoney(group._sum?.[field])])
);

export async function getCustomerReceivableBalanceMap(client, scope, customers = []) {
  if (!scope?.tenantId) return new Map();

  const customerList = customers.filter((customer) => customer?.id);
  const customerIds = [...new Set(customerList.map((customer) => customer.id))];
  if (!customerIds.length) return new Map();

  const tenantCustomerWhere = { tenantId: scope.tenantId, customerId: { in: customerIds } };
  const [sales, payments, creditNotes, creditReturns] = await Promise.all([
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
    client.creditNote.groupBy({
      by: ["customerId"],
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      _sum: { amount: true },
    }),
    client.saleReturn.groupBy({
      by: ["customerId"],
      where: { ...tenantCustomerWhere, status: "completed", refundMethod: "credit" },
      _sum: { total: true },
    }),
  ]);

  const salesMap = groupSumMap(sales, "total");
  const paymentsMap = groupSumMap(payments, "amount");
  const creditNotesMap = groupSumMap(creditNotes, "amount");
  const creditReturnsMap = groupSumMap(creditReturns, "total");

  return new Map(customerList.map((customer) => {
    const openingBalance = Math.max(0, toMoney(customer.openingBalance));
    const receivableSales = salesMap.get(customer.id) || 0;
    const customerPayments = paymentsMap.get(customer.id) || 0;
    const creditNoteTotal = creditNotesMap.get(customer.id) || 0;
    const creditReturnTotal = creditReturnsMap.get(customer.id) || 0;
    const balance = roundMoney(openingBalance + receivableSales - customerPayments - creditNoteTotal - creditReturnTotal);
    return [customer.id, {
      customerId: customer.id,
      balance,
      components: {
        openingBalance,
        receivableSales,
        customerPayments,
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
  const [sales, payments, creditNotes, creditReturns] = await Promise.all([
    client.saleRecord.aggregate({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    client.customerPayment.aggregate({
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    client.creditNote.aggregate({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      _sum: { amount: true },
    }),
    client.saleReturn.aggregate({
      where: { ...tenantCustomerWhere, status: "completed", refundMethod: "credit" },
      _sum: { total: true },
    }),
  ]);

  const openingBalance = Math.max(0, toMoney(customer.openingBalance));
  const receivableSales = toMoney(sales._sum.total);
  const customerPayments = toMoney(payments._sum.amount);
  const creditNoteTotal = toMoney(creditNotes._sum.amount);
  const creditReturnTotal = toMoney(creditReturns._sum.total);

  return {
    customerId,
    balance: roundMoney(openingBalance + receivableSales - customerPayments - creditNoteTotal - creditReturnTotal),
    components: {
      openingBalance,
      receivableSales,
      customerPayments,
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
