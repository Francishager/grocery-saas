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

const walletWithdrawal = {
  id: 'wallet-withdrawal-1',
  customerId: customer.id,
  walletId: 'wallet-1',
  amount: 12,
  paymentMethod: 'cash',
  reference: 'WD-WALLET-1',
  createdAt: new Date('2026-09-03T10:00:00Z'),
  customer: { id: customer.id, name: customer.name },
};
let customerPayments = [];
let creditApplications = [];
let customerOverrides = {};
let walletForBalance = null;
let walletGroups = [];

const emptyModel = () => ({
  findMany: async () => [],
  findFirst: async () => null,
  groupBy: async () => [],
  aggregate: async () => ({ _sum: { amount: 0 } }),
});

const prisma = {
  customer: {
    ...emptyModel(),
    findMany: async () => [{ ...customer, ...customerOverrides }],
    findFirst: async () => ({ ...customer, ...customerOverrides }),
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
  customerPayment: { ...emptyModel(), findMany: async () => customerPayments },
  customerPaymentAllocation: emptyModel(),
  customerWithdrawal: {
    ...emptyModel(),
    findMany: async ({ where = {} } = {}) => (
      where.walletId === null ? [] : [walletWithdrawal]
    ),
  },
  creditNote: emptyModel(),
  saleReturn: emptyModel(),
  customerCreditApplication: { ...emptyModel(), findMany: async () => creditApplications },
  customerWallet: { ...emptyModel(), findFirst: async () => walletForBalance },
  customerWalletTransaction: { ...emptyModel(), groupBy: async () => walletGroups },
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
const { invalidateFeatureCache } = await import('../middleware/featureCheck.js');

function getRoute(path) {
  const matches = reports.stack.filter((layer) => layer.route?.path === path && layer.route.methods.get);
  assert.equal(matches.length, 1, `${path} must be registered once`);
  return matches[0].route.stack.at(-1).handle;
}

async function invoke(path, user, query = { customerId: customer.id }) {
  let status = 200;
  let body;
  await getRoute(path)({ user, query }, {
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

test('customer receivables report includes the full branch balance for each staff member', async () => {
  const results = [];
  for (const id of ['staff-a', 'staff-b']) {
    const response = await invoke('/customers/receivables', {
      id,
      tenantId: customer.tenantId,
      role: 'attendant',
    }, {});

    assert.equal(response.status, 200);
    results.push(response.body.summary.totalReceivable);
  }

  assert.deepEqual(results, [105, 105]);
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

test('customer statement includes sales and payment counts', async () => {
  customerPayments = [{
    id: 'payment-1',
    customerId: customer.id,
    amount: 7,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    allocations: [],
  }];

  try {
    const response = await invoke('/customers/statement', {
      id: 'staff-a',
      tenantId: customer.tenantId,
      role: 'attendant',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.summary.salesCount, 1);
    assert.equal(response.body.summary.paymentCount, 1);
  } finally {
    customerPayments = [];
  }
});

test('customer statement closing transaction includes wallet credit applied to a sale', async () => {
  const originalSales = [...sales];
  const saleDate = new Date('2026-09-04T10:00:00Z');
  sales.splice(0, sales.length, {
    id: 'wallet-sale',
    customerId: customer.id,
    userId: 'staff-a',
    receiptNo: 'INV-WALLET',
    total: 2350000,
    subtotal: 2350000,
    tax: 0,
    discount: 0,
    cashDiscount: 0,
    amountPaid: 1500000,
    balance: 850000,
    paymentStatus: 'partial',
    status: 'completed',
    createdAt: saleDate,
    items: [],
  });
  customerOverrides = {
    openingBalance: -1500000,
    openingBalanceType: 'credit',
    wallet: { migratedLegacyAmount: 1500000, createdAt: new Date('2026-09-01T10:00:00Z') },
  };
  walletForBalance = { id: 'wallet-1', customerId: customer.id, migratedLegacyAmount: 1500000 };
  walletGroups = [
    { direction: 'in', _sum: { amount: 1500000 } },
    { direction: 'out', _sum: { amount: 1500000 } },
  ];
  creditApplications = [{
    id: 'wallet-application-1',
    customerId: customer.id,
    saleId: 'wallet-sale',
    sourceType: 'wallet',
    sourceId: 'wallet-1',
    amount: 1500000,
    createdAt: saleDate,
    customer: { name: customer.name },
    sale: { id: 'wallet-sale', receiptNo: 'INV-WALLET' },
  }];

  try {
    const response = await invoke('/customers/statement', {
      id: 'owner',
      tenantId: customer.tenantId,
      role: 'owner',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.summary.currentBalance, 850000);
    assert.equal(response.body.transactions.at(-1).balance, 850000);
    assert.equal(response.body.transactions.at(-1).type, 'Customer Credit Applied');
    assert.equal(response.body.transactions.at(-1).credit, 1500000);

    creditApplications = [];
    const recoveredResponse = await invoke('/customers/statement', {
      id: 'owner',
      tenantId: customer.tenantId,
      role: 'owner',
    });
    assert.equal(recoveredResponse.status, 200);
    assert.equal(recoveredResponse.body.summary.currentBalance, 850000);
    assert.equal(recoveredResponse.body.transactions.at(-1).balance, 850000);
    assert.equal(recoveredResponse.body.transactions.at(-1).type, 'Sale Payment');
    assert.equal(recoveredResponse.body.transactions.at(-1).credit, 1500000);
  } finally {
    sales.splice(0, sales.length, ...originalSales);
    customerOverrides = {};
    walletForBalance = null;
    walletGroups = [];
    creditApplications = [];
  }
});

test('customer receivables report succeeds for tenants with rentals enabled', async () => {
  const originalTenantFeatureFindMany = prisma.tenantFeature.findMany;
  prisma.tenantFeature.findMany = async () => [{ enabled: true, feature: { name: 'rentals', isActive: true } }];
  prisma.rental = { findMany: async () => [] };
  invalidateFeatureCache(customer.tenantId);

  try {
    const response = await invoke('/customers/receivables', {
      id: 'owner',
      tenantId: customer.tenantId,
      role: 'owner',
    }, {});

    assert.equal(response.status, 200);
    assert.equal(response.body.summary.totalReceivable, 105);
  } finally {
    prisma.tenantFeature.findMany = originalTenantFeatureFindMany;
    delete prisma.rental;
    invalidateFeatureCache(customer.tenantId);
  }
});

test('customer statement shows wallet withdrawals without changing the receivable balance', async () => {
  const user = {
    id: 'staff-a',
    tenantId: customer.tenantId,
    role: 'attendant',
  };

  for (const query of [{ customerId: customer.id }, {}]) {
    const response = await invoke('/customers/statement', user, query);

    assert.equal(response.status, 200);
    const transaction = response.body.transactions.find((row) => row.id === `withdrawal-${walletWithdrawal.id}`);
    assert.ok(transaction);
    assert.equal(transaction.type, 'Wallet Withdrawal');
    assert.equal(transaction.walletDebit, 12);
    assert.equal(transaction.debit, 0);
    assert.equal(response.body.summary.totalWalletWithdrawals, 12);
    assert.equal(response.body.summary.currentBalance, 105);
  }
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
