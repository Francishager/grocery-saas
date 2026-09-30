import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const issue = {
  saleId: 'sale-a', customerId: 'customer-a', branchId: 'branch-a', customerName: 'A Customer',
  receiptNo: 'INV-1', createdAt: new Date('2026-09-01T00:00:00Z'), total: 100, balance: 60,
  recordedSaleAmountPaid: 40, linkedPaymentTotal: 25,
};
let calls;
const testSale = { id: issue.saleId, tenantId: 'tenant-a', customerId: issue.customerId, status: 'completed', amountPaid: 40, total: 100, balance: 60, legacyPaidAmountAtCutover: null, legacySaleAmountPaidAtCutover: null, legacyLinkedPaymentsAtCutover: null };
const testPayments = [{ id: 'payment-a', amount: 25 }];
const db = {
  $queryRawUnsafe: async (query) => query.includes('COUNT(*)') ? [{ count: 1 }] : [issue],
  $transaction: async (callback) => callback(db),
  $queryRaw: async () => [],
  customerReceivableReconciliationReview: {
    findMany: async () => [],
    create: async ({ data }) => { calls.review = data; return { ...data, id: 'review-a', reviewer: { id: data.reviewerId, fname: 'Reviewer' } }; },
  },
  saleRecord: {
    findFirst: async () => ({ ...testSale }),
    update: async ({ data }) => { calls.saleUpdate++; calls.saleData = data; return { ...testSale, ...data }; },
  },
  customerPayment: {
    aggregate: async () => ({ _sum: { amount: testPayments.reduce((sum, item) => sum + item.amount, 0) } }),
    findMany: async () => testPayments.map((payment) => ({ ...payment })),
    update: async ({ where, data }) => { calls.paymentUpdates.push({ where, data }); },
  },
  customerPaymentAllocation: {
    findMany: async () => [],
    aggregate: async () => ({ _sum: { amount: 0 } }),
    create: async ({ data }) => { calls.allocations.push(data); },
  },
};
globalThis.receivableReconciliationFixture = { db };

const fixtures = {
  'node:crypto': dataUrl('export const randomUUID = () => "test-uuid";'),
  '@prisma/client': dataUrl('export class PrismaClient { constructor() { return globalThis.receivableReconciliationFixture.db; } }'),
  'auth.js': dataUrl(`export const authenticateToken = (req, res, next) => next();
    export const requirePermission = key => (req, res, next) => req.user?.permissions?.includes(key) ? next() : res.status(403).json({ error: 'Forbidden' });
    export const requireTenant = (req, res, next) => req.user?.tenantId ? next() : res.status(403).json({ error: 'Tenant required' });
    export const canUsePaymentMethodOrAssignedCash = () => false, canUseTransactionAccountForPayment = () => false, loadUserPermissions = () => {};`),
  'usageLimits.js': dataUrl('export const checkUsageLimit = () => {};'),
  'accountingSync.js': dataUrl('export const syncLinkedTransactionAccountBalance = () => {};'),
  'customerCreditScore.js': dataUrl('export const attachRepaymentTrustScores = async (_, __, customers) => customers; export const getRepaymentTrustScore = () => {};'),
  'receivableSalesView.js': dataUrl('export const createReceivableSalesView = () => ({});'),
  'customerWithdrawalService.js': dataUrl('export const recordCustomerWithdrawal = () => {};'),
  'customerIdentity.js': dataUrl('export const customerIdentityConflictMessage = () => "Conflict"; export const findCustomerIdentityConflict = () => null;'),
  'customerBalance.js': dataUrl(`export const attachCustomerReceivableBalances = async (_, __, customers) => customers;
    export const outstandingCustomerSummary = () => {}, calculateCustomerReceivableBalance = () => ({ balance: globalThis.receivableReconciliationFixture.balance }), reconcileCustomerReceivableBalance = async () => {}, effectiveCreditNoteRows = () => [];`),
  'saleTaxAllocation.js': dataUrl('export const allocateSaleTaxToItems = () => [];'),
};
const routeUrl = new URL('../routes/receivables.js', import.meta.url);
const source = (await readFile(routeUrl, 'utf8')).replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, quote, specifier) => {
  const target = fixtures[specifier] || fixtures[specifier.split('/').at(-1)] || (specifier.startsWith('.')
    ? new URL(specifier, routeUrl).href : pathToFileURL(require.resolve(specifier)).href);
  return prefix + JSON.stringify(target);
});
const router = (await import(dataUrl(source))).default;
const getRoute = router.stack.find((layer) => layer.route?.path === '/reconciliation/payment-allocations' && layer.route.methods.get).route;
const reviewRoute = router.stack.find((layer) => layer.route?.path === '/reconciliation/payment-allocations/:saleId/reviews' && layer.route.methods.post).route;
const correctionRoute = router.stack.find((layer) => layer.route?.path === '/reconciliation/payment-allocations/:saleId/reconcile-to-receipts' && layer.route.methods.post).route;

beforeEach(() => {
  calls = { saleUpdate: 0, review: null, paymentUpdates: [], allocations: [], balance: 60 };
  globalThis.receivableReconciliationFixture.balance = 60;
  Object.assign(testSale, { amountPaid: 40, legacyPaidAmountAtCutover: null, legacySaleAmountPaidAtCutover: null, legacyLinkedPaymentsAtCutover: null });
  testPayments.splice(0, testPayments.length, { id: 'payment-a', amount: 25 });
});

async function request(route, { query = {}, body = {}, permissions = [], params = {} } = {}) {
  const req = {
    query, body, params,
    user: { id: 'reviewer-a', tenantId: 'tenant-a', role: 'owner', permissions },
  };
  const result = { status: 200 };
  const res = {
    status(code) { result.status = code; return this; },
    json(value) { result.body = value; return this; },
  };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return result;
}

test('reconciliation list requires its dedicated view permission', async () => {
  const response = await request(getRoute);
  assert.equal(response.status, 403);
});

test('reconciliation list returns source differences and a stale-safe fingerprint', async () => {
  const response = await request(getRoute, { permissions: ['canViewReceivableReconciliation'] });
  assert.equal(response.status, 200);
  assert.equal(response.body.rows[0].difference, -15);
  assert.equal(response.body.rows[0].provisionalPaidAmount, 40);
  assert.equal(response.body.rows[0].sourceFingerprint, 'sale-a:40.00:25.00');
});

test('authorized reviews are fingerprint-checked and append an audit note without changing financial records', async () => {
  const permission = ['canReviewReceivableReconciliation'];
  const common = { params: { saleId: issue.saleId }, permissions: permission };
  const stale = await request(reviewRoute, { ...common, body: { decision: 'requires_adjustment', note: 'Review evidence', sourceFingerprint: 'old' } });
  assert.equal(stale.status, 409);
  assert.equal(calls.review, null);

  const response = await request(reviewRoute, {
    ...common,
    body: { decision: 'requires_adjustment', note: 'Verified bank receipt; adjustment required.', sourceFingerprint: 'sale-a:40.00:25.00' },
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.financialRecordsChanged, false);
  assert.equal(calls.review.reviewerId, 'reviewer-a');
  assert.equal(calls.review.provisionalPaidAmount, 40);
  assert.equal(calls.saleUpdate, 0);
});

test('receipt correction is permission checked and requires explicit evidence confirmation', async () => {
  const common = { params: { saleId: issue.saleId }, permissions: ['canApplyReceivableReconciliation'] };
  const forbidden = await request(correctionRoute, { ...common, permissions: [] });
  assert.equal(forbidden.status, 403);
  const reviewOnly = await request(correctionRoute, { ...common, permissions: ['canReviewReceivableReconciliation'] });
  assert.equal(reviewOnly.status, 403);
  const unconfirmed = await request(correctionRoute, { ...common, body: { note: 'Bank evidence reviewed', sourceFingerprint: 'sale-a:40.00:25.00' } });
  assert.equal(unconfirmed.status, 400);
  assert.equal(calls.saleUpdate, 0);
});

test('receipt correction converts verified legacy rows to allocations without changing customer balance', async () => {
  Object.assign(testSale, { amountPaid: 25 });
  testPayments.splice(0, testPayments.length, { id: 'payment-a', amount: 40 });
  const response = await request(correctionRoute, {
    params: { saleId: issue.saleId },
    permissions: ['canApplyReceivableReconciliation'],
    body: { confirmReceipts: true, note: 'Matched to till close and bank evidence.', sourceFingerprint: 'sale-a:25.00:40.00' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.customerBalanceChanged, false);
  assert.equal(response.body.cashOrGeneralLedgerChanged, false);
  assert.equal(calls.allocations.length, 1);
  assert.equal(calls.allocations[0].amount, '40.00');
  assert.deepEqual(calls.saleData, { legacyPaidAmountAtCutover: 0, amountPaid: 40, balance: 45, paymentStatus: 'partial' });
  assert.equal(calls.review.decision, 'receipts_confirmed_and_sale_projection_reconciled');
});

test('receipt correction refuses a lower receipt total instead of adjusting receivables silently', async () => {
  const response = await request(correctionRoute, {
    params: { saleId: issue.saleId },
    permissions: ['canApplyReceivableReconciliation'],
    body: { confirmReceipts: true, note: 'Checked bank evidence.', sourceFingerprint: 'sale-a:40.00:25.00' },
  });
  assert.equal(response.status, 409);
  assert.equal(calls.saleUpdate, 0);
  assert.equal(calls.allocations.length, 0);
});
