import assert from "node:assert/strict";
import test from "node:test";
import { calculateRepaymentTrustScore } from "../src/utils/customerCreditScore.js";

const daysAgo = (days) => new Date(Date.now() - days * 86400000);
const daysAhead = (days) => new Date(Date.now() + days * 86400000);

function scoreFor({ creditLimit = 1000, dueDate = daysAhead(10), balance = 300, amountPaid = 700, paymentTotal = 700, latePaymentAmount = 0 } = {}) {
  const customer = {
    id: "customer-1",
    balance,
    creditLimit,
    openingBalance: 0,
    status: "active",
    createdAt: daysAgo(240),
  };
  const sales = [{
    total: 1000,
    amountPaid,
    balance,
    status: balance > 0 ? "pending" : "paid",
    createdAt: daysAgo(60),
    dueDate,
  }];

  return calculateRepaymentTrustScore({
    customer,
    sales,
    paymentTotal,
    paymentCount: 2,
    lastPaymentAt: daysAgo(5),
    latePaymentAmount,
  });
}

test("repayment trust is independent of credit-limit utilization", () => {
  assert.equal(scoreFor({ creditLimit: 500 }), scoreFor({ creditLimit: 5000 }));
});

test("a materially overdue outstanding balance lowers repayment trust", () => {
  assert.ok(scoreFor({ dueDate: daysAgo(75) }) < scoreFor({ dueDate: daysAhead(10) }));
});

test("a fully settled invoice paid late still lowers repayment trust", () => {
  const timely = scoreFor({ balance: 0, amountPaid: 1000, paymentTotal: 1000 });
  const settledLate = scoreFor({ balance: 0, amountPaid: 1000, paymentTotal: 1000, latePaymentAmount: 1000 });
  assert.ok(settledLate < timely);
});
