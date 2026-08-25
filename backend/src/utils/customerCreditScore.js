import { scopedWhere } from "./branchAccess.js";

const toMoney = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

export const calculateRepaymentTrustScore = ({ customer = {}, sales = [], paymentTotal = 0 } = {}) => {
  const activeSales = sales.filter((sale) => sale?.status !== "cancelled");
  const openingBalance = Math.max(0, toMoney(customer.openingBalance));
  let totalCreditExposure = openingBalance;
  let paidFromSaleRecords = 0;
  let saleOutstanding = 0;
  let overdueOutstanding = 0;
  let settledSaleCount = 0;
  const today = new Date();

  for (const sale of activeSales) {
    const total = Math.max(0, toMoney(sale.total));
    const balance = Math.max(0, Math.min(total, toMoney(sale.balance)));
    const amountPaid = Math.max(0, Math.min(total, toMoney(sale.amountPaid)));

    totalCreditExposure += total;
    paidFromSaleRecords += amountPaid;
    saleOutstanding += balance;

    if (total > 0 && balance <= 0) settledSaleCount += 1;
    if (balance > 0 && sale.dueDate && new Date(sale.dueDate) < today) {
      overdueOutstanding += balance;
    }
  }

  if (totalCreditExposure <= 0) return 0;

  const recordedPaymentTotal = Math.max(0, toMoney(paymentTotal));
  const totalPaid = Math.min(totalCreditExposure, Math.max(recordedPaymentTotal, paidFromSaleRecords));
  const customerOutstanding = Math.max(0, toMoney(customer.balance));
  const outstanding = Math.min(totalCreditExposure, Math.max(customerOutstanding, saleOutstanding));
  const repaymentRate = totalPaid / totalCreditExposure;
  const outstandingRate = outstanding / totalCreditExposure;
  const overdueRate = Math.min(1, overdueOutstanding / totalCreditExposure);
  const settlementBonus = activeSales.length > 0 ? (settledSaleCount / activeSales.length) * 5 : 0;

  return clampScore((repaymentRate * 100) - (outstandingRate * 10) - (overdueRate * 40) + settlementBonus);
};

export async function getRepaymentTrustScores(client, scope, customers = []) {
  const customerList = customers.filter((customer) => customer?.id);
  const customerIds = [...new Set(customerList.map((customer) => customer.id))];
  if (!customerIds.length) return new Map();

  const [sales, paymentGroups] = await Promise.all([
    client.saleRecord.findMany({
      where: scopedWhere(scope, {
        customerId: { in: customerIds },
        status: { not: "cancelled" },
      }),
      select: {
        customerId: true,
        total: true,
        amountPaid: true,
        balance: true,
        dueDate: true,
        status: true,
      },
    }),
    client.customerPayment.groupBy({
      by: ["customerId"],
      where: scopedWhere(scope, { customerId: { in: customerIds } }),
      _sum: { amount: true },
    }),
  ]);

  const salesByCustomer = new Map();
  for (const sale of sales) {
    const list = salesByCustomer.get(sale.customerId) || [];
    list.push(sale);
    salesByCustomer.set(sale.customerId, list);
  }

  const paymentsByCustomer = new Map(
    paymentGroups.map((group) => [group.customerId, toMoney(group._sum?.amount)])
  );

  return new Map(
    customerList.map((customer) => [
      customer.id,
      calculateRepaymentTrustScore({
        customer,
        sales: salesByCustomer.get(customer.id) || [],
        paymentTotal: paymentsByCustomer.get(customer.id) || 0,
      }),
    ])
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
