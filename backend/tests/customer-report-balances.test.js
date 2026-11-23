import test from 'node:test';
import assert from 'node:assert/strict';

const customer = {
  id: 'customer-1',
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  name: 'Customer One',
  balance: 999,
  openingBalance: 20,
  creditLimit: 500,
  status: 'active',
  createdAt: new Date('2025-01-01T10:00:00Z'),
};

const sales = [
  {
    id: 'sale-a',
    customerId: customer.id,
    userId: 'staff-a',
    receiptNo: 'INV-A',
    total: 60,
    subtotal: 60,
    tax: 0,
    discount: 0,
    cashDiscount: 0,
    amountPaid: 10,
    balance: 50,
    paymentStatus: 'partial',
    status: 'completed',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    items: [],
  },
  {
    id: 'sale-b',
    customerId: customer.id,
    userId: 'staff-b',
    receiptNo: 'INV-B',
    total: 40,
    subtotal: 40,
    tax: 0,
    discount: 0,
    cashDiscount: 0,
    amountPaid: 5,
    balance: 35,
    paymentStatus: 'partial',
    status: 'completed',
    createdAt: new Date('2026-09-02T10:00:00Z'),
    items: [],
  },
];

const emptyModel = () => ({
  findMany: async () => [],
  findFirst: async () => null,
  groupBy: async () => [],
  aggregate: async () => ({ _sum: { amount: 0 } }),
});

const prisma = {
  customer: {
    ...emptyModel(),
    findMany: async () => [{ ...customer }],
    findFirst: async () => ({ ...customer }),
  },
  saleRecord: {
    ...emptyModel(),
    findMany: async ({ where = {} } = {}) => {
      const filters = Array.isArray(where.AND) ? where.AND : [where];
      let rows = sales;
      const userFilter = filters.find((filter) => filter.userId);
      const dueDateFilter = filters.find((filter) => filter.dueDate?.lt);
      const balanceFilter = filters.find((filter) => filter.balance?.gt);
      if (userFilter) rows = rows.filter((sale) => sale.userId === userFilter.userId);
      if (dueDateFilter) rows = rows.filter((sale) => sale.dueDate && sale.dueDate < dueDateFilter.dueDate.lt);
      if (balanceFilter) rows = rows.filter((sale) => sale.balance > balanceFilter.balance.gt);
      return rows;
    },
  },
  customerPayment: emptyModel(),
  customerPaymentAllocation: emptyModel(),
  customerWithdrawal: emptyModel(),
  creditNote: emptyModel(),
  saleReturn: emptyModel(),
  customerCreditApplication: emptyModel(),
  customerWallet: emptyModel(),
  customerWalletTransaction: emptyModel(),
  tenant: { findUnique: async () => ({ planId: null }) },
  tenantFeature: { findMany: async () => [] },
  branch: { findFirst: async () => null, findMany: async () => [] },
  userBranch: {
    findMany: async () => [{ branchId: customer.branchId, branch: { id: customer.branchId, name: 'Branch A' } }],
  },
  userPermission: { findUnique: async () => ({}) },
};

globalThis.prisma = prisma;
const { default: reports } = await import('../src/routes/reports.js');

function getRoute(path) {
  const matches = reports.stack.filter((layer) => layer.route?.path === path && layer.route.methods.get);
  assert.equal(matches.length, 1, `${path} must be registered once`);
  return matches[0].route.stack.at(-1).handle;
}

async function invoke(path, user) {
  let status = 200;
  let body;
  await getRoute(path)({ user, query: { customerId: customer.id } }, {
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  });
  return { status, body };
}

test('customer list reports use the canonical balance instead of the saved balance field', async () => {
  let status = 200;
  let body;
  await getRoute('/customers/list')(
    { user: { id: 'owner', tenantId: customer.tenantId, role: 'owner' }, query: {} },
    {
      status(code) { status = code; return this; },
      json(value) { body = value; return this; },
    },
  );

  assert.equal(status, 200);
  assert.equal(body.data[0].balance, 105);
  assert.equal(body.summary.totalBalance, 105);
});

test('statement and ledger closing balances stay the same for staff in the same branch', async () => {
  const staffResults = [];
  for (const id of ['staff-a', 'staff-b']) {
    const user = { id, tenantId: customer.tenantId, role: 'attendant' };
    const statement = await invoke('/customers/statement', user);
    const ledger = await invoke('/customers/ledger', user);

    assert.equal(statement.status, 200);
    assert.equal(ledger.status, 200);
    staffResults.push({
      statement: statement.body.summary.currentBalance,
      ledger: ledger.body.closingBalance,
    });
  }

  assert.deepEqual(staffResults, [
    { statement: 105, ledger: 105 },
    { statement: 105, ledger: 105 },
  ]);
});

test('overdue opening balance uses the canonical balance instead of stale saved balance', async () => {
  let status = 200;
  let body;
  await getRoute('/receivables/overdue')(
    { user: { id: 'owner', tenantId: customer.tenantId, role: 'owner' }, query: {} },
    {
      status(code) { status = code; return this; },
      json(value) { body = value; return this; },
    },
  );

  assert.equal(status, 200);
  assert.equal(body.data[0].source, 'Opening Balance');
  assert.equal(body.data[0].balance, 20);
  assert.equal(body.summary.totalOverdue, 20);
});
