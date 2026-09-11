import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const queries = [];
globalThis.salaryCalculatorTestDb = {
  employee: { findFirst: async ({ where }) => {
    queries.push(where);
    return where.tenantId === 'business-a' && where.id === 'employee-a'
      ? { id: 'employee-a', firstName: 'Test', basicSalary: 500000, taxId: null } : null;
  } },
};
// Load the real service/route with database and middleware adapters. Never connect to a real database.
let source = await readFile(new URL('../src/services/payrollService.js', import.meta.url), 'utf8');
source = source.replace('import prisma from "../db.js";', 'const prisma = globalThis.salaryCalculatorTestDb;')
  .replace('import hrAccountingService from "./hrAccountingService.js";', 'const hrAccountingService = {};')
  .replaceAll('"../utils/ugandaPayrollCalculator.js"', JSON.stringify(new URL('../src/utils/ugandaPayrollCalculator.js', import.meta.url).href))
  .replaceAll('"../utils/ugandaSalaryPreview.js"', JSON.stringify(new URL('../src/utils/ugandaSalaryPreview.js', import.meta.url).href));
const { default: service } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
globalThis.salaryCalculatorTestService = service;
let routeSource = await readFile(new URL('../src/routes/hrPayrollRoutes.js', import.meta.url), 'utf8');
routeSource = routeSource.replace('"express"', JSON.stringify(pathToFileURL(require.resolve('express')).href))
  .replace('import payrollService from "../services/payrollService.js";', 'const payrollService = globalThis.salaryCalculatorTestService;')
  .replace('import prisma from "../db.js";', 'const prisma = {};')
  .replace(/import \{ linkedCashAccountId \} from [^;]+;/, 'const linkedCashAccountId = () => null;')
  .replace(/import \{ authenticateToken[^;]+;/, `const pass = (req, res, next) => next();
    const authenticateToken = pass, requireTenant = pass, loadUserPermissions = pass;
    const requireAnyPermission = () => pass, canUseTransactionAccountForPayment = () => true;`);
const { default: router } = await import(`data:text/javascript;base64,${Buffer.from(routeSource).toString('base64')}`);
const calculateHandler = router.stack.find((layer) => layer.route?.path === '/calculate').route.stack.at(-1).handle;

test('calculator service works without an employee or any database query', async () => {
  queries.length = 0;
  const result = await service.calculateSalaryPreview({ tenantId: 'business-a', period: '2026-09', basicSalary: 500000 });
  assert.equal(result.calculation.netSalary, 436750);
  assert.equal(queries.length, 0);
});

test('calculator service fetches salary only from the authenticated business', async () => {
  const result = await service.calculateSalaryPreview({ tenantId: 'business-a', employeeId: 'employee-a', period: '2026-09' });
  assert.equal(result.calculation.grossSalary, 500000);
  assert.deepEqual(queries.at(-1), { id: 'employee-a', tenantId: 'business-a' });
  const denied = await service.calculateSalaryPreview({ tenantId: 'business-b', employeeId: 'employee-a', period: '2026-09' });
  assert.equal(denied.success, false);
  assert.equal(denied.error, 'Employee not found');
});

test('calculator API rejects a forged tenant identifier in the request body', async () => {
  let status = 200, payload;
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await calculateHandler({ user: { tenantId: 'business-b' }, body: { tenantId: 'business-a', employeeId: 'employee-a', period: '2026-09' } }, res);
  assert.equal(status, 400);
  assert.equal(payload.error, 'Employee not found');
  assert.equal(queries.at(-1).tenantId, 'business-b');
});

test('invalid calculator inputs return a client error before querying employees', async () => {
  queries.length = 0;
  let status = 200, payload;
  const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await calculateHandler({ user: { tenantId: 'business-a' }, body: { employeeId: 'employee-a', period: '2026-13', basicSalary: -100 } }, res);
  assert.equal(status, 400);
  assert.match(payload.error, /valid month/);
  assert.equal(queries.length, 0);
});
