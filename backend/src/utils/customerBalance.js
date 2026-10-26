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

function summarizeSaleAndCustomerPayments(sales = [], payments = [], allocations = [], creditApplications = []) {
  const saleCustomerById = new Map(sales.map((sale) => [sale.id, sale.customerId]));
  const legacyPaymentsBySale = new Map();
  const explicitPaymentsBySale = new Map();
  const unlinkedPaymentsByCustomer = new Map();
  const allocationsBySale = new Map();
  const allocationsByPayment = new Map();
  const customerAccountAllocationsByCustomer = new Map();
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const appliedBySale = new Map();
  const appliedByPayment = new Map();

  for (const application of creditApplications) {
    if (application.saleId) appliedBySale.set(application.saleId,
      roundMoney(toMoney(appliedBySale.get(application.saleId)) + toMoney(application.amount)));
    if (application.sourceType === 'payment') appliedByPayment.set(application.sourceId,
      roundMoney(toMoney(appliedByPayment.get(application.sourceId)) + toMoney(application.amount)));
  }

  for (const payment of payments) {
    const amount = toMoney(payment.amount ?? payment._sum?.amount);
    const explicit = payment.allocationMode === 'explicit';
    if (payment.saleId && saleCustomerById.get(payment.saleId) === payment.customerId) {
      const target = explicit ? explicitPaymentsBySale : legacyPaymentsBySale;
      target.set(payment.saleId, roundMoney(toMoney(target.get(payment.saleId)) + amount));
    } else if (!explicit) {
      unlinkedPaymentsByCustomer.set(payment.customerId,
        roundMoney(toMoney(unlinkedPaymentsByCustomer.get(payment.customerId)) + amount));
    }
  }

  for (const allocation of allocations) {
    allocationsByPayment.set(allocation.paymentId,
      roundMoney(toMoney(allocationsByPayment.get(allocation.paymentId)) + toMoney(allocation.amount ?? allocation._sum?.amount)));
    if (allocation.targetType === 'customer_account') {
      customerAccountAllocationsByCustomer.set(allocation.customerId,
        roundMoney(toMoney(customerAccountAllocationsByCustomer.get(allocation.customerId)) + toMoney(allocation.amount ?? allocation._sum?.amount)));
      continue;
    }
    if (!allocation.saleId) continue;
    allocationsBySale.set(allocation.saleId,
      roundMoney(toMoney(allocationsBySale.get(allocation.saleId)) + toMoney(allocation.amount ?? allocation._sum?.amount)));
  }

  for (const [paymentId, amount] of appliedByPayment) {
    const payment = paymentById.get(paymentId);
    if (!payment) continue;
    if (payment.allocationMode === 'explicit') {
      customerAccountAllocationsByCustomer.set(payment.customerId,
        roundMoney(Math.max(0, toMoney(customerAccountAllocationsByCustomer.get(payment.customerId)) - amount)));
    } else if (!payment.saleId) {
      unlinkedPaymentsByCustomer.set(payment.customerId,
        roundMoney(Math.max(0, toMoney(unlinkedPaymentsByCustomer.get(payment.customerId)) - amount)));
    }
  }

  const salesByCustomer = new Map();
  const salePaymentsByCustomer = new Map();
  const unappliedCustomerReceiptsByCustomer = new Map();
  for (const payment of payments) {
    if (payment.allocationMode !== 'explicit' || payment.saleId) continue;
    const amount = Math.max(0, toMoney(payment.amount) - toMoney(allocationsByPayment.get(payment.id)) - toMoney(appliedByPayment.get(payment.id)));
    if (amount > 0) unappliedCustomerReceiptsByCustomer.set(payment.customerId,
      roundMoney(toMoney(unappliedCustomerReceiptsByCustomer.get(payment.customerId)) + amount));
  }
  const paymentReconciliationIssuesByCustomer = new Map();
  for (const sale of sales) {
    const customerId = sale.customerId;
    const net = receivableSaleNetTotal(sale);
    const recordedPaid = Math.max(0, toMoney(sale.amountPaid));
    const linkedLegacyPaid = Math.max(0, toMoney(legacyPaymentsBySale.get(sale.id)));
    const explicitReceiptTotal = Math.max(0, toMoney(explicitPaymentsBySale.get(sale.id)));
    const allocatedPaid = Math.max(0, toMoney(allocationsBySale.get(sale.id)) + toMoney(appliedBySale.get(sale.id)));
    const explicitMode = sale.legacyPaidAmountAtCutover != null || allocatedPaid > 0 || explicitReceiptTotal > 0;
    const paidOnce = explicitMode
      ? Math.max(0, toMoney(sale.legacyPaidAmountAtCutover) + allocatedPaid)
      : Math.max(recordedPaid, linkedLegacyPaid);
    const unappliedForSale = explicitMode ? Math.max(0, explicitReceiptTotal - allocatedPaid) : 0;

    if (unappliedForSale > 0) {
      unappliedCustomerReceiptsByCustomer.set(customerId,
        roundMoney(toMoney(unappliedCustomerReceiptsByCustomer.get(customerId)) + unappliedForSale));
    }

    if (!explicitMode && Math.abs(recordedPaid - linkedLegacyPaid) > 0.01 && (recordedPaid > 0 || linkedLegacyPaid > 0)) {
      const issues = paymentReconciliationIssuesByCustomer.get(customerId) || [];
      issues.push({
        saleId: sale.id,
        recordedSaleAmountPaid: recordedPaid,
        linkedPaymentTotal: linkedLegacyPaid,
        difference: roundMoney(linkedLegacyPaid - recordedPaid),
        provisionalAmountUsed: paidOnce,
        status: linkedLegacyPaid > 0 ? 'source_mismatch' : 'missing_payment_rows',
        requiresReview: true,
      });
      paymentReconciliationIssuesByCustomer.set(customerId, issues);
    }

    salesByCustomer.set(customerId, roundMoney(toMoney(salesByCustomer.get(customerId)) + net));
    salePaymentsByCustomer.set(customerId,
      roundMoney(toMoney(salePaymentsByCustomer.get(customerId)) + paidOnce));
  }

  return {
    salesByCustomer,
    salePaymentsByCustomer,
    unlinkedPaymentsByCustomer,
    customerAccountAllocationsByCustomer,
    unappliedCustomerReceiptsByCustomer,
    paymentReconciliationIssuesByCustomer,
  };
}

async function getEffectiveCreditNoteTotalMap(client, scope, customerIds = [], creditApplications = []) {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!scope?.tenantId || !ids.length) return new Map();

  const [notes, applications] = await Promise.all([
    client.creditNote.findMany({
      where: { tenantId: scope.tenantId, customerId: { in: ids }, status: { not: "cancelled" } },
      select: {
        id: true, customerId: true, saleId: true, amount: true, createdAt: true,
        sale: { select: { id: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    client.customerCreditApplication.findMany({
      where: { tenantId: scope.tenantId, customerId: { in: ids }, sourceType: 'credit_note' },
      select: { sourceId: true, amount: true },
    }),
  ]);

  const totalsByCustomer = new Map();
  const appliedByNote = new Map();
  applications.forEach((application) => {
    appliedByNote.set(application.sourceId, roundMoney(toMoney(appliedByNote.get(application.sourceId)) + toMoney(application.amount)));
  });
  for (const note of effectiveCreditNoteRows(notes)) {
    const remaining = roundMoney(Math.max(0, note.effectiveAmount - toMoney(appliedByNote.get(note.id))));
    if (remaining <= 0) continue;
    totalsByCustomer.set(note.customerId, roundMoney(toMoney(totalsByCustomer.get(note.customerId)) + remaining));
  }

  return totalsByCustomer;
}

export async function getCustomerReceivableBalanceMap(client, scope, customers = []) {
  if (!scope?.tenantId) return new Map();

  const customerList = customers.filter((customer) => customer?.id);
  const customerIds = [...new Set(customerList.map((customer) => customer.id))];
  if (!customerIds.length) return new Map();

  const tenantCustomerWhere = { tenantId: scope.tenantId, customerId: { in: customerIds } };
  const [sales, payments, allocations, withdrawals, creditNotes, creditReturns, creditApplications, propertySales, propertySalePayments] = await Promise.all([
    client.saleRecord.findMany({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      select: { id: true, customerId: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, legacyPaidAmountAtCutover: true, status: true },
    }),
    client.customerPayment.findMany({
      where: tenantCustomerWhere,
      select: { id: true, customerId: true, saleId: true, allocationMode: true, amount: true },
    }),
    client.customerPaymentAllocation.findMany({
      where: { tenantId: scope.tenantId, customerId: { in: customerIds } },
      select: { id: true, paymentId: true, customerId: true, saleId: true, targetType: true, amount: true },
    }),
    client.customerWithdrawal.groupBy({
      by: ["customerId"],
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    getEffectiveCreditNoteTotalMap(client, scope, customerIds),

    client.saleReturn.findMany({
      where: { ...tenantCustomerWhere, status: "completed", refundMethod: "credit" },
      select: { id: true, customerId: true, total: true },
    }),
    client.customerCreditApplication.findMany({
      where: { tenantId: scope.tenantId, customerId: { in: customerIds } },
      select: { customerId: true, saleId: true, sourceType: true, sourceId: true, amount: true },
    }),
    client.propertySale?.findMany ? client.propertySale.findMany({ where: { tenantId: scope.tenantId, buyerId: { in: customerIds }, status: 'active' }, select: { id: true, buyerId: true, salePrice: true } }) : Promise.resolve([]),
    client.propertySalePayment?.findMany ? client.propertySalePayment.findMany({ where: { tenantId: scope.tenantId, status: 'posted', sale: { buyerId: { in: customerIds }, status: 'active' } }, select: { amount: true, sale: { select: { buyerId: true } } } }) : Promise.resolve([]),
  ]);

  const { salesByCustomer, salePaymentsByCustomer, unlinkedPaymentsByCustomer, customerAccountAllocationsByCustomer, unappliedCustomerReceiptsByCustomer, paymentReconciliationIssuesByCustomer } =
    summarizeSaleAndCustomerPayments(sales, payments, allocations, creditApplications);
  const withdrawalsMap = groupSumMap(withdrawals, "amount");
  const creditNotesMap = creditNotes;
  const appliedByReturn = new Map();
  creditApplications.filter((application) => application.sourceType === 'sale_return').forEach((application) => {
    appliedByReturn.set(application.sourceId, roundMoney(toMoney(appliedByReturn.get(application.sourceId)) + toMoney(application.amount)));
  });
  const creditReturnsMap = new Map();
  creditReturns.forEach((row) => creditReturnsMap.set(row.customerId,
    roundMoney(toMoney(creditReturnsMap.get(row.customerId)) + Math.max(0, toMoney(row.total) - toMoney(appliedByReturn.get(row.id))))));
  const propertySaleReceivables = new Map()
  propertySales.forEach((sale) => propertySaleReceivables.set(sale.buyerId, roundMoney(toMoney(propertySaleReceivables.get(sale.buyerId)) + toMoney(sale.salePrice))))
  const propertySaleReceipts = new Map()
  propertySalePayments.forEach((payment) => propertySaleReceipts.set(payment.sale.buyerId, roundMoney(toMoney(propertySaleReceipts.get(payment.sale.buyerId)) + toMoney(payment.amount))))

  return new Map(customerList.map((customer) => {
    const openingBalance = Math.max(0, toMoney(customer.openingBalance));
    const receivableSales = salesByCustomer.get(customer.id) || 0;
    const salePayments = salePaymentsByCustomer.get(customer.id) || 0;
    const unappliedCustomerReceipts = unappliedCustomerReceiptsByCustomer.get(customer.id) || 0;
    const customerAccountAllocations = customerAccountAllocationsByCustomer.get(customer.id) || 0;
    const customerPayments = roundMoney((unlinkedPaymentsByCustomer.get(customer.id) || 0) + customerAccountAllocations);
    const customerWithdrawals = withdrawalsMap.get(customer.id) || 0;
    const creditNoteTotal = creditNotesMap.get(customer.id) || 0;
    const creditReturnTotal = creditReturnsMap.get(customer.id) || 0;
    const propertyReceivables = propertySaleReceivables.get(customer.id) || 0
    const propertyReceipts = propertySaleReceipts.get(customer.id) || 0
    const balance = roundMoney(openingBalance + receivableSales - salePayments + propertyReceivables - propertyReceipts + customerWithdrawals - customerPayments - creditNoteTotal - creditReturnTotal);
    return [customer.id, {
      customerId: customer.id,
      balance,
      components: {
        openingBalance,
        receivableSales,
        salePayments,
        propertySaleReceivables: propertyReceivables,
        propertySalePayments: propertyReceipts,
        paymentReconciliationIssues: paymentReconciliationIssuesByCustomer.get(customer.id) || [],
        customerPayments,
        customerAccountAllocations,
        unappliedCustomerReceipts,
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
  const [sales, payments, allocations, withdrawals, creditNotes, creditReturns, creditApplications, propertySales, propertySalePayments] = await Promise.all([
    client.saleRecord.findMany({
      where: { ...tenantCustomerWhere, status: { not: "cancelled" } },
      select: { id: true, customerId: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, legacyPaidAmountAtCutover: true, status: true },
    }),
    client.customerPayment.findMany({
      where: tenantCustomerWhere,
      select: { id: true, customerId: true, saleId: true, allocationMode: true, amount: true },
    }),
    client.customerPaymentAllocation.findMany({
      where: { tenantId: scope.tenantId, customerId },
      select: { id: true, paymentId: true, customerId: true, saleId: true, targetType: true, amount: true },
    }),
    client.customerWithdrawal.aggregate({
      where: tenantCustomerWhere,
      _sum: { amount: true },
    }),
    getEffectiveCreditNoteTotalMap(client, scope, [customerId]),

    client.saleReturn.findMany({
      where: { ...tenantCustomerWhere, status: "completed", refundMethod: "credit" },
      select: { id: true, total: true },
    }),
    client.customerCreditApplication.findMany({
      where: { tenantId: scope.tenantId, customerId },
      select: { customerId: true, saleId: true, sourceType: true, sourceId: true, amount: true },
    }),
    client.propertySale?.findMany ? client.propertySale.findMany({ where: { tenantId: scope.tenantId, buyerId: customerId, status: 'active' }, select: { salePrice: true } }) : Promise.resolve([]),
    client.propertySalePayment?.findMany ? client.propertySalePayment.findMany({ where: { tenantId: scope.tenantId, status: 'posted', sale: { buyerId: customerId, status: 'active' } }, select: { amount: true } }) : Promise.resolve([]),
  ]);

  const { salesByCustomer, salePaymentsByCustomer, unlinkedPaymentsByCustomer, customerAccountAllocationsByCustomer, unappliedCustomerReceiptsByCustomer, paymentReconciliationIssuesByCustomer } =
    summarizeSaleAndCustomerPayments(sales, payments, allocations, creditApplications);
  const openingBalance = Math.max(0, toMoney(customer.openingBalance));
  const receivableSales = salesByCustomer.get(customerId) || 0;
  const salePayments = salePaymentsByCustomer.get(customerId) || 0;
  const unappliedCustomerReceipts = unappliedCustomerReceiptsByCustomer.get(customerId) || 0;
  const customerAccountAllocations = customerAccountAllocationsByCustomer.get(customerId) || 0;
  const customerPayments = roundMoney((unlinkedPaymentsByCustomer.get(customerId) || 0) + customerAccountAllocations);
  const customerWithdrawals = toMoney(withdrawals._sum.amount);
  const creditNoteTotal = toMoney(creditNotes.get(customerId));
  const appliedByReturn = creditApplications.filter((application) => application.sourceType === 'sale_return')
    .reduce((sum, application) => sum + toMoney(application.amount), 0);
  const creditReturnTotal = roundMoney(creditReturns.reduce((sum, row) => sum + toMoney(row.total), 0) - appliedByReturn);
  const propertySaleReceivables = roundMoney(propertySales.reduce((sum, sale) => sum + toMoney(sale.salePrice), 0))
  const propertySaleReceipts = roundMoney(propertySalePayments.reduce((sum, payment) => sum + toMoney(payment.amount), 0))

  return {
    customerId,
    balance: roundMoney(openingBalance + receivableSales - salePayments + propertySaleReceivables - propertySaleReceipts + customerWithdrawals - customerPayments - creditNoteTotal - creditReturnTotal),
    components: {
      openingBalance,
      receivableSales,
      salePayments,
      propertySaleReceivables,
      propertySalePayments: propertySaleReceipts,
      paymentReconciliationIssues: paymentReconciliationIssuesByCustomer.get(customerId) || [],
      customerPayments,
      customerAccountAllocations,
      unappliedCustomerReceipts,
      customerWithdrawals,
      creditNotes: creditNoteTotal,
      creditReturns: creditReturnTotal,
    },
  };
}

export async function calculateCustomerReceivableBalanceBefore(client, scope, customerId, cutoff) {
  if (!scope?.tenantId || !customerId || !cutoff) return null
  const createdBefore = { createdAt: { lt: cutoff } }
  const tenantCustomerWhere = { tenantId: scope.tenantId, customerId }
  const [customer, sales, payments, allocations, withdrawals, notes, returns, applications, propertySales, propertySalePayments] = await Promise.all([
    client.customer.findFirst({
      where: { id: customerId, tenantId: scope.tenantId },
      select: { id: true, openingBalance: true, openingBalanceDate: true, createdAt: true },
    }),
    client.saleRecord.findMany({
      where: { ...tenantCustomerWhere, ...createdBefore, status: { not: 'cancelled' } },
      select: { id: true, customerId: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, amountPaid: true, legacyPaidAmountAtCutover: true, status: true },
    }),
    client.customerPayment.findMany({
      where: { ...tenantCustomerWhere, ...createdBefore },
      select: { id: true, customerId: true, saleId: true, allocationMode: true, amount: true },
    }),
    client.customerPaymentAllocation.findMany({
      where: { ...tenantCustomerWhere, ...createdBefore },
      select: { id: true, paymentId: true, customerId: true, saleId: true, targetType: true, amount: true },
    }),
    client.customerWithdrawal.aggregate({
      where: { ...tenantCustomerWhere, ...createdBefore },
      _sum: { amount: true },
    }),
    client.creditNote.findMany({
      where: { ...tenantCustomerWhere, ...createdBefore, status: { not: 'cancelled' } },
      select: {
        id: true, customerId: true, saleId: true, amount: true, createdAt: true,
        sale: { select: { id: true, total: true, subtotal: true, tax: true, discount: true, cashDiscount: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    client.saleReturn.findMany({
      where: { ...tenantCustomerWhere, ...createdBefore, status: 'completed', refundMethod: 'credit' },
      select: { id: true, customerId: true, total: true },
    }),
    client.customerCreditApplication.findMany({
      where: { ...tenantCustomerWhere, ...createdBefore },
      select: { customerId: true, saleId: true, sourceType: true, sourceId: true, amount: true },
    }),
    client.propertySale?.findMany ? client.propertySale.findMany({ where: { tenantId: scope.tenantId, buyerId: customerId, ...createdBefore, status: 'active' }, select: { salePrice: true } }) : Promise.resolve([]),
    client.propertySalePayment?.findMany ? client.propertySalePayment.findMany({ where: { tenantId: scope.tenantId, ...createdBefore, status: 'posted', sale: { buyerId: customerId, status: 'active' } }, select: { amount: true } }) : Promise.resolve([]),
  ])
  if (!customer) return null

  const { salesByCustomer, salePaymentsByCustomer, unlinkedPaymentsByCustomer, customerAccountAllocationsByCustomer } =
    summarizeSaleAndCustomerPayments(sales, payments, allocations, applications)
  const appliedByNote = new Map()
  applications.filter((row) => row.sourceType === 'credit_note').forEach((row) => {
    appliedByNote.set(row.sourceId, roundMoney(toMoney(appliedByNote.get(row.sourceId)) + toMoney(row.amount)))
  })
  const effectiveCreditNotes = effectiveCreditNoteRows(notes).reduce((sum, note) =>
    roundMoney(sum + Math.max(0, note.effectiveAmount - toMoney(appliedByNote.get(note.id)))), 0)
  const appliedByReturn = applications.filter((row) => row.sourceType === 'sale_return')
    .reduce((sum, row) => roundMoney(sum + toMoney(row.amount)), 0)
  const creditReturns = roundMoney(returns.reduce((sum, row) => sum + toMoney(row.total), 0) - appliedByReturn)
  const openingBalanceDate = customer.openingBalanceDate || customer.createdAt
  const openingBalance = openingBalanceDate && new Date(openingBalanceDate) < cutoff ? Math.max(0, toMoney(customer.openingBalance)) : 0
  const customerPayments = roundMoney((unlinkedPaymentsByCustomer.get(customerId) || 0) + (customerAccountAllocationsByCustomer.get(customerId) || 0))
  const propertySaleReceivables = roundMoney(propertySales.reduce((sum, sale) => sum + toMoney(sale.salePrice), 0))
  const propertySalePaymentsTotal = roundMoney(propertySalePayments.reduce((sum, payment) => sum + toMoney(payment.amount), 0))

  return {
    customerId,
    balance: roundMoney(
      openingBalance + (salesByCustomer.get(customerId) || 0) - (salePaymentsByCustomer.get(customerId) || 0) + propertySaleReceivables - propertySalePaymentsTotal +
      toMoney(withdrawals._sum?.amount) - customerPayments - effectiveCreditNotes - creditReturns,
    ),
  }
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
