import test from 'node:test';
import assert from 'node:assert/strict';
import { addAdvisorPeopleContext } from '../src/services/advisorPeopleContext.js';
import { fetchAdvisorResearch, researchTopic } from '../src/services/advisorResearch.js';
const now = new Date('2026-09-13T12:00:00Z');
const context = () => ({ period: { from: '2026-09-01T00:00:00Z', to: now.toISOString() }, sources: [], limitations: [] });
function fixture(permissions) {
  const queries = [];
  const query = (model, result) => async args => { queries.push({ model, ...args }); return result; };
  const db = {
    userBranch: { findMany: async () => [{ branchId: 'branch-a', branch: { name: 'North' } }] },
    customer: { findMany: query('customers', [{ id: 'c1', name: 'Eddy', openingBalance: 450000, phone: 'must-not-leak', bankAccountNumber: 'must-not-leak' }]) },
    saleRecord: { findMany: query('sales', [{ customerId: 'c1', subtotal: 300000, discount: 50000, tax: 0, total: 250000 }]) },
    customerPayment: {
      groupBy: query('payments', [{ customerId: 'c1', _sum: { amount: 200000 }, _count: { _all: 1 } }]),
      findMany: query('repayments', [{ customerId: 'c1', amount: 200000, createdAt: now, phoneNumber: 'must-not-leak', reference: 'must-not-leak' }]),
    },
    customerWithdrawal: { groupBy: query('withdrawals', []) },
    creditNote: { findMany: query('notes', [{ customerId: 'c1', amount: 50000, saleId: null }]) },
    saleReturn: { groupBy: query('returns', []) },
    employee: { groupBy: query('employees', [{ status: 'active', employmentType: 'permanent', _count: { _all: 12 } }]), findMany: query('employeeIds', [{ id: 'e1' }]) },
    payroll: { groupBy: query('payroll', [{ period: '2026-09', status: 'posted', _sum: { grossSalary: 300000, netSalary: 200000, paidAmount: 0 }, _count: { _all: 1 } }]) },
    attendanceRecord: { groupBy: query('attendance', [{ status: 'present', _count: { _all: 10 }, _sum: { duration: 80 } }]) },
  };
  return { db, queries, req: { user: { id: 'staff-a', tenantId: 'tenant-a', role: 'attendant', permissions }, tenantFeatures: new Set(['receivables', 'hr']), query: { tenantId: 'tenant-b', branchId: 'other' } } };
}

test('customer context exposes only name, reconciled balance and permitted repayment amounts/dates', async () => {
  const { db, req, queries } = fixture(['canViewReceivable']);
  const result = await addAdvisorPeopleContext(db, req, context(), 'What is Eddy balance and repayment?');
  assert.equal(result.customers[0].balance, 450000, '450000 opening + 250000 sale - 200000 repayment - 50000 credit note');
  assert.deepEqual(Object.keys(result.customers[0]).sort(), ['balance', 'name', 'repayments']);
  assert.equal(result.customers[0].repayments.total, 200000);
  assert.equal(result.customers[0].repayments.recent[0].amount, 200000);
  assert(!JSON.stringify(result).includes('must-not-leak'));
  for (const row of queries) assert.equal(row.where.tenantId, 'tenant-a');
  const customers = queries.find(row => row.model === 'customers');
  assert.equal(customers.where.branchId, 'branch-a');
  assert.deepEqual(Object.keys(customers.select).sort(), ['id', 'name', 'openingBalance']);
  assert.deepEqual(Object.keys(queries.find(row => row.model === 'repayments').select).sort(), ['amount', 'createdAt', 'customerId']);
});

test('AI access alone grants no customer or HR access, and disabled features remain inaccessible', async () => {
  for (const permissions of [['canUseBusinessAI'], ['*']]) {
    const { db, req, queries } = fixture(permissions);
    if (permissions.includes('*')) req.tenantFeatures = new Set(['dashboard']);
    const result = await addAdvisorPeopleContext(db, req, context(), 'Show customers and payroll');
    assert.equal(result.customers, undefined); assert.equal(result.hr, undefined); assert.equal(queries.length, 0);
  }
});

test('HR permissions are separate: attendance access does not reveal payroll or workforce totals', async () => {
  const { db, req, queries } = fixture(['canViewHRAttendance']);
  const result = await addAdvisorPeopleContext(db, req, context(), 'How can attendance improve?');
  assert.equal(result.hr.attendance[0]._count._all, 10);
  assert.equal(result.hr.payroll, undefined); assert.equal(result.hr.workforce, undefined);
  const query = queries.find(row => row.model === 'attendance');
  assert.equal(query.where.tenantId, 'tenant-a'); assert.deepEqual(query.where.employeeId.in, ['e1']);
  assert.equal(queries.find(row => row.model === 'employeeIds').where.branchId, 'branch-a');
});

test('payroll preserves posted/paid distinctions and uses aggregate data only', async () => {
  const { db, req } = fixture(['canViewHR', 'canViewHRPayroll']);
  const result = await addAdvisorPeopleContext(db, req, context(), 'Review staffing cost');
  assert.equal(result.hr.payroll[0]._sum.paidAmount, 0);
  assert.equal(result.hr.payroll[0]._sum.netSalary, 200000);
  assert(result.limitations.some(line => line.includes('not salary payouts')));
});

test('public research never sends customer names, account details or private amounts to a search service', async () => {
  const question = 'Eddy Secretname phone 0754000000 account 123456789 owes 5100000. Help repayment';
  const result = await fetchAdvisorResearch(question, { searchKey: 'test-key', fetchImpl: async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.search.brave.com');
    for (const privateValue of ['Eddy', 'Secretname', '0754000000', '123456789', '5100000']) assert(!url.toString().includes(privateValue));
    assert.equal(parsed.searchParams.get('q'), researchTopic(question).query);
    assert.equal(options.headers['X-Subscription-Token'], 'test-key');
    return new Response(JSON.stringify({ web: { results: [{ title: 'Receivables guidance', url: 'https://example.org/guidance', description: 'Review repayment schedules.' }, { title: 'Unsafe', url: 'javascript:alert(1)', description: 'Unsafe link' }] } }));
  } });
  assert.equal(result.sources.length, 1); assert.equal(result.kind, 'web-search');
});

test('public reference research works without an extra API key and discloses failures', async () => {
  const result = await fetchAdvisorResearch('Improve marketing', { searchKey: '', fetchImpl: async url => {
    assert.equal(new URL(url).origin, 'https://en.wikipedia.org');
    return new Response(JSON.stringify({ query: { pages: { '1': { title: 'Marketing strategy', fullurl: 'https://en.wikipedia.org/wiki/Marketing_strategy', extract: 'Define the target market and measurable goals.' } } } }));
  } });
  assert.equal(result.kind, 'business-reference'); assert.equal(result.status, 'available');
  const failed = await fetchAdvisorResearch('Improve marketing', { searchKey: '', fetchImpl: async () => { throw new Error('private details'); } });
  assert.equal(failed.status, 'unavailable'); assert.deepEqual(failed.sources, []); assert(!JSON.stringify(failed).includes('private details'));
});
