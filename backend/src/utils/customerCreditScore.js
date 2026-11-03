import { scopedWhere } from "./branchAccess.js";

const toMoney = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

const daysBetween = (later, earlier) => {
  if (!earlier) return null;
  const date = new Date(earlier);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((later.getTime() - date.getTime()) / 86400000));
};

const monthsBetween = (later, earlier) => {
  const days = daysBetween(later, earlier);
  return days == null ? 0 : days / 30.4375;
};

export const calculateRepaymentTrustScore = ({
  customer = {},
  sales = [],
  rentalObligations = [],
  paymentTotal = 0,
  paymentCount = 0,
  lastPaymentAt = null,
  latePaymentAmount = 0,
} = {}) => {
  const activeSales = [...sales, ...rentalObligations].filter((sale) => sale?.status !== "cancelled");
  const openingBalance = Math.max(0, toMoney(customer.openingBalance));
  let totalCreditExposure = openingBalance;
  let paidFromSaleRecords = 0;
  let saleOutstanding = 0;
  let overdueOutstanding = 0;
  let settledSaleCount = 0;
  let maxDaysOverdue = 0;
  const today = new Date();
  const creditDates = [];

  if (openingBalance > 0) {
    creditDates.push(customer.openingBalanceDate || customer.createdAt);
  }

  for (const sale of activeSales) {
    const total = Math.max(0, toMoney(sale.total));
    const balance = Math.max(0, Math.min(total, toMoney(sale.balance)));
    const amountPaid = Math.max(0, Math.min(total, toMoney(sale.amountPaid)));

    totalCreditExposure += total;
    paidFromSaleRecords += amountPaid;
    saleOutstanding += balance;
    if (sale.createdAt) creditDates.push(sale.createdAt);

    if (total > 0 && balance <= 0) settledSaleCount += 1;
    if (balance > 0 && sale.dueDate && new Date(sale.dueDate) < today) {
      overdueOutstanding += balance;
      maxDaysOverdue = Math.max(maxDaysOverdue, daysBetween(today, sale.dueDate) || 0);
    }
  }

  if (totalCreditExposure <= 0) return 0;

  const recordedPaymentTotal = Math.max(0, toMoney(paymentTotal));
  const totalPaid = Math.min(totalCreditExposure, Math.max(recordedPaymentTotal, paidFromSaleRecords));
  if (totalPaid <= 0 && paymentCount <= 0) return 0;

  const customerOutstanding = Math.max(0, toMoney(customer.balance));
  const outstanding = Math.min(totalCreditExposure, Math.max(customerOutstanding, saleOutstanding));
  const repaymentRate = totalPaid / totalCreditExposure;
  const settlementRate = activeSales.length > 0 ? settledSaleCount / activeSales.length : repaymentRate >= 1 ? 1 : 0;
  const overdueRate = outstanding > 0 ? Math.min(1, overdueOutstanding / outstanding) : 0;
  const severeDelinquencyFactor =
    maxDaysOverdue >= 90 ? 1 :
    maxDaysOverdue >= 60 ? 0.75 :
    maxDaysOverdue >= 30 ? 0.5 :
    maxDaysOverdue > 0 ? 0.25 :
    0;

  const firstCreditDate = creditDates
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0] || customer.createdAt;
  const relationshipMonths = monthsBetween(today, firstCreditDate);
  const lastPaymentDays = daysBetween(today, lastPaymentAt);

  const paymentHistoryScore = Math.max(
    0,
    (repaymentRate * 24.5) + (settlementRate * 10.5) - Math.min(25, overdueRate * 25 + severeDelinquencyFactor * 10 + (Math.min(1, Math.max(0, toMoney(latePaymentAmount)) / Math.max(1, totalPaid)) * 8))
  );
  const historyScore = Math.min(10, relationshipMonths / 12 * 10) + Math.min(5, settledSaleCount * 1.25);
  const recentBehaviorBase =
    lastPaymentDays == null ? 2 :
    lastPaymentDays <= 30 ? 10 :
    lastPaymentDays <= 90 ? 7 :
    lastPaymentDays <= 180 ? 4 :
    2;
  const recentBehaviorScore = Math.max(0, recentBehaviorBase - (maxDaysOverdue > 0 ? 4 : 0));
  // Trust measures repayment behavior and history; current limit use is shown separately.
  const behavioralScore = paymentHistoryScore + historyScore + recentBehaviorScore;
  return clampScore((behavioralScore / 60) * 100);
};

export async function getRepaymentTrustScores(client, scope, customers = []) {
  const customerList = customers.filter((customer) => customer?.id);
  const customerIds = [...new Set(customerList.map((customer) => customer.id))];
  if (!customerIds.length) return new Map();

  const sales = await client.saleRecord.findMany({
    where: scopedWhere(scope, {
      customerId: { in: customerIds },
      status: { not: "cancelled" },
    }),
    select: {
      id: true,
      customerId: true,
      total: true,
      amountPaid: true,
      balance: true,
      createdAt: true,
      dueDate: true,
      status: true,
    },
  });

  const additionalObligationsByCustomer = new Map()
  const extraPaymentMetricsByCustomer = new Map()
  const addObligation = (customerId, obligation) => {
    if (!customerId) return
    const list = additionalObligationsByCustomer.get(customerId) || []
    list.push(obligation)
    additionalObligationsByCustomer.set(customerId, list)
  }
  const addPaymentMetric = (customerId, amount, date) => {
    if (!customerId) return
    const current = extraPaymentMetricsByCustomer.get(customerId) || { total: 0, count: 0, lastPaymentAt: null }
    current.total += toMoney(amount)
    current.count += 1
    if (date && (!current.lastPaymentAt || new Date(date) > new Date(current.lastPaymentAt))) current.lastPaymentAt = date
    extraPaymentMetricsByCustomer.set(customerId, current)
  }
  const latePaymentsByCustomer = new Map()
  const addLatePayment = (customerId, amount) => latePaymentsByCustomer.set(customerId, toMoney(latePaymentsByCustomer.get(customerId)) + toMoney(amount))

  if (scope.includeRentals && client.rental?.findMany) {
    const rentalRows = await client.rental.findMany({
      where: scopedWhere(scope, { customerId: { in: customerIds }, status: { not: 'cancelled' } }),
      select: { customerId: true, totalAmount: true, amountPaid: true, balance: true, hireDate: true, expectedReturnDate: true, status: true },
    })
    for (const rental of rentalRows) addObligation(rental.customerId, {
      total: rental.totalAmount, amountPaid: rental.amountPaid, balance: rental.balance,
      createdAt: rental.hireDate, dueDate: rental.expectedReturnDate, status: rental.status,
    })
    if (client.rentalPayment?.findMany) {
      const rentalPayments = await client.rentalPayment.findMany({
        where: { tenantId: scope.tenantId, status: 'posted', kind: 'rental_payment', rental: { customerId: { in: customerIds }, ...(scope.branchId ? { branchId: scope.branchId } : {}) } },
        select: { amount: true, paymentDate: true, rental: { select: { customerId: true } } },
      })
      for (const payment of rentalPayments) addPaymentMetric(payment.rental?.customerId, payment.amount, payment.paymentDate)
    }
  }

  if (scope.includePropertyManagement && client.rentCharge?.findMany) {
    const charges = await client.rentCharge.findMany({
      where: {
        tenantId: scope.tenantId,
        tenancy: { customerId: { in: customerIds }, ...(scope.branchId ? { unit: { property: { branchId: scope.branchId } } } : {}) },
      },
      select: {
        amount: true, amountPaid: true, dueDate: true, createdAt: true, status: true,
        tenancy: { select: { customerId: true } },
        allocations: { where: { payment: { status: 'posted' } }, select: { amount: true, payment: { select: { paymentDate: true } } } },
      },
    })
    for (const charge of charges) {
      const balance = Math.max(0, toMoney(charge.amount) - toMoney(charge.amountPaid))
      addObligation(charge.tenancy?.customerId, { total: charge.amount, amountPaid: charge.amountPaid, balance, createdAt: charge.createdAt, dueDate: charge.dueDate, status: balance <= 0.01 ? 'paid' : 'unpaid' })
      for (const allocation of charge.allocations || []) {
        if (charge.dueDate && allocation.payment?.paymentDate && new Date(allocation.payment.paymentDate) > new Date(charge.dueDate)) addLatePayment(charge.tenancy?.customerId, allocation.amount)
      }
    }
    if (client.propertyRentPayment?.findMany) {
      const rentPayments = await client.propertyRentPayment.findMany({
        where: { tenantId: scope.tenantId, status: 'posted', paymentType: { in: ['rent', 'rent_plan'] }, tenancy: { customerId: { in: customerIds }, ...(scope.branchId ? { unit: { property: { branchId: scope.branchId } } } : {}) } },
        select: { amount: true, paymentDate: true, tenancy: { select: { customerId: true } } },
      })
      for (const payment of rentPayments) addPaymentMetric(payment.tenancy?.customerId, payment.amount, payment.paymentDate)
    }
  }

  const paymentGroups = await client.customerPayment.groupBy({
    by: ["customerId"],
    where: scopedWhere(scope, { customerId: { in: customerIds } }),
    _sum: { amount: true },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const salesByCustomer = new Map();
  const salesById = new Map();
  for (const sale of sales) {
    const list = salesByCustomer.get(sale.customerId) || [];
    list.push(sale);
    salesByCustomer.set(sale.customerId, list);
    salesById.set(sale.id, sale);
  }

  const saleIds = [...salesById.keys()];
  const allocations = saleIds.length ? await client.customerPaymentAllocation.findMany({
    where: { tenantId: scope.tenantId, saleId: { in: saleIds }, targetType: "sale" },
    select: { saleId: true, amount: true, payment: { select: { createdAt: true } } },
  }) : [];
  for (const allocation of allocations) {
    const sale = salesById.get(allocation.saleId);
    const dueDate = sale?.dueDate ? new Date(sale.dueDate) : null;
    const paidAt = allocation.payment?.createdAt ? new Date(allocation.payment.createdAt) : null;
    if (!sale || !dueDate || !paidAt || Number.isNaN(dueDate.getTime()) || Number.isNaN(paidAt.getTime())) continue;
    const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    const paidDay = Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), paidAt.getUTCDate());
    if (paidDay <= dueDay) continue;
    addLatePayment(sale.customerId, Math.max(0, toMoney(allocation.amount)))
  }

  const paymentMetricsByCustomer = new Map(
    paymentGroups.map((group) => [
      group.customerId,
      {
        total: toMoney(group._sum?.amount),
        count: Number(group._count?._all || 0),
        lastPaymentAt: group._max?.createdAt || null,
      },
    ])
  );

  return new Map(
    customerList.map((customer) => {
      const paymentMetrics = paymentMetricsByCustomer.get(customer.id) || {};
      const extraPaymentMetrics = extraPaymentMetricsByCustomer.get(customer.id) || {};
      return [
        customer.id,
        calculateRepaymentTrustScore({
          customer,
          sales: salesByCustomer.get(customer.id) || [],
          rentalObligations: additionalObligationsByCustomer.get(customer.id) || [],
          paymentTotal: Math.max(toMoney(paymentMetrics.total), toMoney(extraPaymentMetrics.total)),
          paymentCount: Number(paymentMetrics.count || 0) + Number(extraPaymentMetrics.count || 0),
          lastPaymentAt: [paymentMetrics.lastPaymentAt, extraPaymentMetrics.lastPaymentAt].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null,
          latePaymentAmount: latePaymentsByCustomer.get(customer.id) || 0,
        }),
      ];
    })
  );
}

export async function attachRepaymentTrustScores(client, scope, customers = []) {
  const scores = await getRepaymentTrustScores(client, scope, customers);
  return customers.map((customer) => ({
    ...customer,
    trustScore: scores.get(customer.id) ?? 0,
  }));
}

export async function getRepaymentTrustScore(client, scope, customer, modules = {}) {
  if (!customer?.id) return 0;
  const scores = await getRepaymentTrustScores(client, { ...scope, ...modules }, [customer]);
  return scores.get(customer.id) ?? 0;
}
