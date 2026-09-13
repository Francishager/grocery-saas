import { resolveBranchScope, scopedWhere } from '../utils/branchAccess.js';
import { attachCustomerReceivableBalances } from '../utils/customerBalance.js';
import { permissionAllowedForTenant } from '../utils/permissions.js';

const money = value => Math.round(Number(value || 0) * 100) / 100;
const label = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 160);
export async function addAdvisorPeopleContext(db, req, context, question) {
  const scope = await resolveBranchScope(db, { ...req, query: {} }, { allowOwnerAll: true });
  const allowed = key => (req.user.permissions?.includes('*') || req.user.permissions?.includes(key)) && permissionAllowedForTenant(key, req.tenantFeatures);
  if (allowed('canViewReceivable')) {
    const words = question.match(/[\p{L}]{3,}/gu)?.slice(0, 30) || [];
    const nameFilter = words.length ? { OR: words.map(word => ({ name: { contains: word, mode: 'insensitive' } })) } : {};
    const select = { id: true, name: true, openingBalance: true };
    let customers = words.length ? await db.customer.findMany({ where: scopedWhere(scope, nameFilter), select, take: 100, orderBy: { name: 'asc' } }) : [];
    const matched = customers.length > 0;
    if (!matched) customers = await db.customer.findMany({ where: scopedWhere(scope), select, take: 100, orderBy: { name: 'asc' } });
    const balanced = await attachCustomerReceivableBalances(db, scope, customers);
    const ids = customers.map(customer => customer.id);
    const repaymentWhere = scopedWhere(scope, { customerId: { in: ids } });
    const totals = ids.length ? await db.customerPayment.groupBy({ by: ['customerId'], where: repaymentWhere, _sum: { amount: true }, _count: { _all: true } }) : [];
    // Fetch only repayment amounts/dates. Contacts, payment references and account numbers never enter context.
    const recent = ids.length ? await db.customerPayment.findMany({ where: repaymentWhere, select: { customerId: true, amount: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 }) : [];
    context.customers = balanced.map(customer => {
      const total = totals.find(row => row.customerId === customer.id);
      return { name: label(customer.name), balance: money(customer.balance), repayments: {
        total: money(total?._sum.amount), count: total?._count._all || 0,
        recent: recent.filter(payment => payment.customerId === customer.id).slice(0, 12).map(payment => ({ amount: money(payment.amount), date: payment.createdAt })) } };
    });
    context.sources.push('Customer names, reconciled balances and repayments');
    context.limitations.push(`Customer context covers up to 100 ${matched ? 'name-matched' : 'alphabetically first'} customers; repayment detail is capped at 12 per customer from the latest 500 payments. Ask for a specific name for focused details. Totals cover all repayments in the permitted branch scope.`);
  }
  const hr = {};
  if (allowed('canViewHR')) {
    hr.workforce = await db.employee.groupBy({ by: ['status', 'employmentType'], where: scopedWhere(scope), _count: { _all: true } });
    context.sources.push('HR workforce totals');
  }
  if (allowed('canViewHRPayroll')) {
    hr.payroll = await db.payroll.groupBy({ by: ['period', 'status'], where: scopedWhere(scope, { period: { gte: context.period.from.slice(0, 7), lte: context.period.to.slice(0, 7) } }),
      _sum: { grossSalary: true, netSalary: true, paidAmount: true, totalDeductions: true }, _count: { _all: true } });
    context.sources.push('HR payroll totals by period and status');
    context.limitations.push('Draft and approved payroll are not salary payouts. Only paidAmount represents paid salaries; gross salary is not cash paid.');
  }
  if (allowed('canViewHRAttendance')) {
    const employees = await db.employee.findMany({ where: scopedWhere(scope), select: { id: true } });
    hr.attendance = await db.attendanceRecord.groupBy({ by: ['status'], where: { tenantId: scope.tenantId, employeeId: { in: employees.map(employee => employee.id) },
      isActive: true, attendanceDate: { gte: new Date(context.period.from), lte: new Date(context.period.to) } },
      _count: { _all: true }, _sum: { duration: true, lateMinutes: true, overtimeMinutes: true } });
    context.sources.push('HR attendance totals');
  }
  if (Object.keys(hr).length) context.hr = hr;
  context.limitations.push('Customer contacts, addresses, identifiers, bank/payment account details and employee personal records are excluded. HR advice uses only permitted aggregate data; confirm legal or tax matters with qualified local advisers.');
  return context;
}
