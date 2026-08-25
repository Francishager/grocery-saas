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

const utilizationScore = (utilization) => {
  if (utilization <= 0) return 30;
  if (utilization <= 0.3) return 30;
  if (utilization <= 0.5) return 24;
  if (utilization <= 0.75) return 18;
  if (utilization <= 1) return 10;
  return 0;
};

export const calculateRepaymentTrustScore = ({
  customer = {},
  sales = [],
  paymentTotal = 0,
  paymentCount = 0,
  lastPaymentAt = null,
} = {}) => {
  const activeSales = sales.filter((sale) => sale?.status !== "cancelled");
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
  const overdueRate = Math.min(1, overdueOutstanding / totalCreditExposure);
  const severeDelinquencyFactor =
    maxDaysOverdue >= 90 ? 1 :
    maxDaysOverdue >= 60 ? 0.75 :
    maxDaysOverdue >= 30 ? 0.5 :
    maxDaysOverdue > 0 ? 0.25 :
    0;

  const creditLimit = Math.max(0, toMoney(customer.creditLimit));
  const utilization = creditLimit > 0 ? outstanding / creditLimit : outstanding / totalCreditExposure;
  const firstCreditDate = creditDates
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0] || customer.createdAt;
  const relationshipMonths = monthsBetween(today, firstCreditDate);
  const lastPaymentDays = daysBetween(today, lastPaymentAt);

  const paymentHistoryScore = Math.max(
    0,
    (repaymentRate * 24.5) + (settlementRate * 10.5) - Math.min(25, overdueRate * 25 + severeDelinquencyFactor * 10)
  );
  const amountsOwedScore = utilizationScore(utilization);
  const historyScore = Math.min(10, relationshipMonths / 12 * 10) + Math.min(5, settledSaleCount * 1.25);
  const recentBehaviorBase =
    lastPaymentDays == null ? 2 :
    lastPaymentDays <= 30 ? 10 :
    lastPaymentDays <= 90 ? 7 :
    lastPaymentDays <= 180 ? 4 :
    2;
  const recentBehaviorScore = Math.max(0, recentBehaviorBase - (maxDaysOverdue > 0 ? 4 : 0));
  const statusScore = customer.status === "active" ? 10 : customer.status === "inactive" ? 5 : 0;

  return clampScore(paymentHistoryScore + amountsOwedScore + historyScore + recentBehaviorScore + statusScore);
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
      customerId: true,
      total: true,
      amountPaid: true,
      balance: true,
      createdAt: true,
      dueDate: true,
      status: true,
    },
  });

  const paymentGroups = await client.customerPayment.groupBy({
    by: ["customerId"],
    where: scopedWhere(scope, { customerId: { in: customerIds } }),
    _sum: { amount: true },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const salesByCustomer = new Map();
  for (const sale of sales) {
    const list = salesByCustomer.get(sale.customerId) || [];
    list.push(sale);
    salesByCustomer.set(sale.customerId, list);
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
      return [
        customer.id,
        calculateRepaymentTrustScore({
          customer,
          sales: salesByCustomer.get(customer.id) || [],
          paymentTotal: paymentMetrics.total || 0,
          paymentCount: paymentMetrics.count || 0,
          lastPaymentAt: paymentMetrics.lastPaymentAt || null,
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

export async function getRepaymentTrustScore(client, scope, customer) {
  if (!customer?.id) return 0;
  const scores = await getRepaymentTrustScores(client, scope, [customer]);
  return scores.get(customer.id) ?? 0;
}
