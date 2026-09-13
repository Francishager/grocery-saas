import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let queries, balanceScopes, scoreScopes;
const db = {
  customer: {
    findMany: async args => {
      queries.push(args);
      return Array.from({ length: Math.min(args.take, Math.max(0, 12000 - args.skip)) }, (_, index) => ({ id: `customer-${args.skip + index}` }));
    },
    count: async args => { queries.push(args); return 12000; },
  },
  userBranch: { findMany: async () => [{ branchId: 'branch-a', branch: { id: 'branch-a' } }] },
};
globalThis.customerPaginationFixture = {
  db,
  balances: async (_, scope, customers) => {
    balanceScopes.push(scope);
    return customers.map(customer => ({ ...customer, balance: 450000 }));
  },
  scores: async (_, scope, customers) => {
    scoreScopes.push(scope);
    return customers.map(customer => ({ ...customer, trustScore: 80 }));
  },
};

// Import the real router and branch scoping without connecting to a database.
const fixtures = {
  '@prisma/client': dataUrl('export class PrismaClient { constructor() { return globalThis.customerPaginationFixture.db; } }'),
  'auth.js': dataUrl(`export const authenticateToken = (req, res, next) => next();
    export const requirePermission = key => (req, res, next) => req.user?.permissions?.includes(key) ? next() : res.status(403).json({ error: 'Forbidden' });
    export const requireTenant = (req, res, next) => req.user?.tenantId ? next() : res.status(403).json({ error: 'Tenant required' });
    export const canUsePaymentMethodOrAssignedCash = () => false, canUseTransactionAccountForPayment = () => false, loadUserPermissions = () => {};`),
  'usageLimits.js': dataUrl('export const checkUsageLimit = () => {};'),
  'accountingSync.js': dataUrl('export const syncLinkedTransactionAccountBalance = () => {};'),
  'customerCreditScore.js': dataUrl('export const attachRepaymentTrustScores = globalThis.customerPaginationFixture.scores; export const getRepaymentTrustScore = () => {};'),
  'receivableSalesView.js': dataUrl('export const createReceivableSalesView = () => ({});'),
  'customerWithdrawalService.js': dataUrl('export const recordCustomerWithdrawal = () => {};'),
  'customerBalance.js': dataUrl(`export const attachCustomerReceivableBalances = globalThis.customerPaginationFixture.balances;
    export const outstandingCustomerSummary = () => {}, calculateCustomerReceivableBalance = () => {}, reconcileCustomerReceivableBalance = () => {}, effectiveCreditNoteRows = () => {};`),
};
const routeUrl = new URL('../routes/receivables.js', import.meta.url);
const source = (await readFile(routeUrl, 'utf8')).replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, quote, specifier) => {
  const target = fixtures[specifier] || fixtures[specifier.split('/').at(-1)] || (specifier.startsWith('.')
    ? new URL(specifier, routeUrl).href : pathToFileURL(require.resolve(specifier)).href);
  return prefix + JSON.stringify(target);
});
const router = (await import(dataUrl(source))).default;
const route = router.stack.find(layer => layer.route?.path === '/customers' && layer.route.methods.get).route;

beforeEach(() => { queries = []; balanceScopes = []; scoreScopes = []; });
async function request(query = {}, overrides = {}) {
  const req = { query, user: { id: 'owner-a', tenantId: 'tenant-a', role: 'owner', permissions: ['canViewReceivable'], ...overrides } };
  const result = { status: 200 };
  const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return result;
}

test('deployed limit=10000 requests succeed without silently truncating to 500', async () => {
  const result = await request({ limit: '10000' });
  assert.equal(result.status, 200);
  assert.equal(result.body.customers.length, 10000);
  assert.deepEqual(result.body.pagination, { page: 1, limit: 10000, total: 12000, pages: 2 });
  assert.equal(queries[0].take, 10000);
  assert.equal(result.body.customers[0].balance, 450000);
  assert.equal(result.body.customers[0].trustScore, 80);
  assert.equal(balanceScopes[0].tenantId, 'tenant-a');
  assert.equal(scoreScopes[0].tenantId, 'tenant-a');
});

test('normal customer table pagination retains stable ordering and totals', async () => {
  const result = await request({ page: '3', limit: '10' });
  assert.equal(result.status, 200);
  assert.equal(result.body.customers.length, 10);
  assert.equal(queries[0].skip, 20);
  assert.deepEqual(queries[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(result.body.pagination.pages, 1200);
});

test('default page remains 50 and a second large page returns the remainder', async () => {
  assert.equal((await request()).body.customers.length, 50);
  const result = await request({ page: '2', limit: '10000' });
  assert.equal(result.body.customers.length, 2000);
  assert.equal(result.body.customers[0].id, 'customer-10000');
});

test('large requests retain tenant, staff branch, status and search filters', async () => {
  const result = await request({ limit: '10000', search: 'Eddy', status: 'active' }, { role: 'attendant' });
  assert.equal(result.status, 200);
  const where = queries[0].where;
  assert.equal(where.tenantId, 'tenant-a');
  assert.equal(where.branchId, 'branch-a');
  assert.equal(where.status, 'active');
  assert.equal(where.OR[0].name.contains, 'Eddy');
  assert.deepEqual(queries[1].where, where);
});

test('invalid, excessive and overflowing pagination is rejected before customer queries', async () => {
  for (const query of [{ limit: '0' }, { limit: '-1' }, { limit: '1.5' }, { limit: 'abc' }, { limit: '10001' },
    { page: '0' }, { page: '1.5' }, { page: '9007199254740991', limit: '10000' }, { page: '2147483649', limit: '1' }]) {
    assert.equal((await request(query)).status, 400, JSON.stringify(query));
  }
  assert.equal(queries.length, 0);
});

test('customer list still invokes its permission and tenant guards for large requests', async () => {
  assert.equal((await request({ limit: '10000' }, { permissions: [] })).status, 403);
  assert.equal((await request({ limit: '10000' }, { tenantId: null })).status, 403);
  assert.equal(queries.length, 0);
});
