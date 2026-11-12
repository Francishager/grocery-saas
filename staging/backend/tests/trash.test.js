import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Exercise the real services/routes with an isolated transactional store, never a tenant database.
let state, failAudit, loseClaim;
const clone = value => structuredClone(value);
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (key === 'AND') return value.every(condition => matches(row, condition));
    if (key === 'tenantId_model_recordId') return matches(row, value);
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([op, target]) => {
        if (op === 'in') return target.includes(actual);
        if (op === 'notIn') return !target.includes(actual);
        if (op === 'not') return actual !== target;
        if (op === 'gt') return actual > target;
        if (op === 'lte') return actual <= target;
        if (op === 'contains') return String(actual).toLowerCase().includes(target.toLowerCase());
        if (op === 'mode') return true;
        return matches(actual || {}, { [op]: target });
      });
    }
    return actual === value;
  });
}
const selected = (row, select) => !row ? null : clone(select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row);
const db = {};
for (const model of ['trashEntry', 'product', 'user', 'cashAccount', 'employee', 'attendanceRecord', 'department', 'position', 'unit', 'team', 'shiftTemplate', 'shiftAssignment', 'leaveType', 'userBranch', 'tenant', 'auditLog']) {
  db[model] = {
    async findFirst({ where, select } = {}) { return selected(state[model].find(row => matches(row, where)), select); },
    async findUnique(args) { return this.findFirst(args); },
    async findMany({ where, select, orderBy, skip = 0, take = Infinity } = {}) {
      let rows = state[model].filter(row => matches(row, where));
      if (orderBy) for (const order of (Array.isArray(orderBy) ? orderBy : [orderBy]).toReversed()) {
        const [key, direction] = Object.entries(order)[0];
        rows = rows.toSorted((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1));
      }
      return rows.slice(skip, skip + take).map(row => selected(row, select));
    },
    async count({ where } = {}) { return state[model].filter(row => matches(row, where)).length; },
    async update({ where, data }) { const row = state[model].find(row => matches(row, where)); assert.ok(row); Object.assign(row, clone(data)); return clone(row); },
    async updateMany({ where, data }) {
      if (loseClaim && model === 'trashEntry' && data.status === 'processing') return { count: 0 };
      const rows = state[model].filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, clone(data))); return { count: rows.length };
    },
    async create({ data }) {
      if (failAudit && model === 'auditLog') throw Error('Audit unavailable');
      const row = { id: `${model}-${state[model].length}`, ...clone(data) }; state[model].push(row); return clone(row);
    },
    async upsert({ where, create, update }) { return state[model].some(row => matches(row, where)) ? this.update({ where, data: update }) : this.create({ data: create }); },
    async delete() { assert.fail('Trash must never erase a source record'); },
    async deleteMany() { assert.fail('Trash must never erase linked history'); },
  };
}
db.$transaction = async (callback, options) => {
  assert.equal(options.isolationLevel, 'Serializable');
  const before = clone(state);
  try { return await callback(db); } catch (error) { state = before; throw error; }
};
globalThis.trashTestDb = db;
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
let source = await readFile(new URL('../src/utils/usageLimits.js', import.meta.url), 'utf8');
globalThis.trashTestLimits = await load(source.replace("import prisma from '../db.js'", 'const prisma = globalThis.trashTestDb;'));
source = await readFile(new URL('../src/services/trashService.js', import.meta.url), 'utf8');
const service = await load(source.replace("import prisma from '../db.js';", 'const prisma = globalThis.trashTestDb;')
  .replace("import { checkUsageLimit } from '../utils/usageLimits.js';", 'const {checkUsageLimit} = globalThis.trashTestLimits;'));
globalThis.trashTestService = service;
const { moveToTrash, resolveTrash, trashScope, expireTrash, trashedRecordIds, assertOutsideTrash, allowedTrashPermissions } = service;
const require = createRequire(import.meta.url);
source = await readFile(new URL('../src/routes/trash.js', import.meta.url), 'utf8');
const { default: router } = await load(source.replace("'express'", JSON.stringify(pathToFileURL(require.resolve('express')).href))
  .replace("import prisma from '../db.js';", 'const prisma = globalThis.trashTestDb;')
  .replace(/import \{ authenticateToken \} from [^;]+;/, 'const authenticateToken = (req,res,next) => next();')
  .replace(/import \{ TRASH_MODELS, trashScope, expireTrash, resolveTrash \} from [^;]+;/, 'const {TRASH_MODELS, trashScope, expireTrash, resolveTrash} = globalThis.trashTestService;'));
const actor = { id: 'owner', tenantId: 'tenant-a', role: 'owner', name: 'Owner', permissions: ['*'] };
async function request(path = '/', method = 'get', options = {}) {
  const req = { user: actor, query: {}, body: {}, params: {}, ...options };
  const res = { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, set(key, value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
  for (const layer of router.stack.filter(layer => !layer.route)) {
    let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) return res;
  }
  await router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle(req, res);
  return res;
}
function product(id = 'product-a', extra = {}) { const row = { id, tenantId: 'tenant-a', name: 'Rice', itemType: 'product', isActive: true, branchId: null, quantity: 30, balance: 500, ...extra }; state.product.push(row); return row; }
async function deleted(id = 'product-a', extra = {}) { product(id, extra); await moveToTrash('product', { id, tenantId: extra.tenantId || 'tenant-a' }, actor); return state.trashEntry.at(-1); }
test.beforeEach(() => {
  state = Object.fromEntries(Object.keys(db).filter(key => key !== '$transaction').map(model => [model, []]));
  state.tenant.push({ id: 'tenant-a', plan: { maxProducts: 1000, maxUsers: 20 } });
  failAudit = false; loseClaim = false;
});

test('deletion retains source and records a 30-day window without private fields', async () => {
  const entry = await deleted();
  assert.equal(state.product[0].isActive, false);
  assert.deepEqual(entry.restoreFields, { isActive: true });
  assert.deepEqual(entry.deletedFields, { isActive: false });
  assert.equal(entry.expiresAt - entry.deletedAt, 30 * 86400000);
  assert.equal(state.auditLog[0].action, 'move_to_trash');
});
test('duplicate deletion cannot extend recovery', async () => {
  const entry = clone(await deleted());
  await assert.rejects(moveToTrash('product', { id: 'product-a', tenantId: 'tenant-a' }, actor), { status: 409 });
  assert.deepEqual(state.trashEntry[0], entry);
});
test('cross-tenant delete and owner/self deletion are rejected', async () => {
  product();
  await assert.rejects(moveToTrash('product', { id: 'product-a', tenantId: 'tenant-b' }, actor), { status: 404 });
  state.user.push({ id: 'owner', tenantId: 'tenant-a', role: 'owner', isActive: true }, { id: 'staff', tenantId: 'tenant-a', role: 'staff', isActive: true });
  for (const id of ['owner', 'staff']) await assert.rejects(moveToTrash('user', { id, tenantId: 'tenant-a' }, { ...actor, id }), { status: 403 });
});
test('restore preserves current quantities, balances, and unrelated fields', async () => {
  const entry = await deleted();
  state.product[0].quantity = 44; state.product[0].balance = 700; state.product[0].name = 'Rice updated';
  await resolveTrash(await trashScope(actor), entry.id, 'restore', actor);
  assert.deepEqual(state.product[0], { id: 'product-a', tenantId: 'tenant-a', name: 'Rice updated', itemType: 'product', isActive: true, branchId: null, quantity: 44, balance: 700 });
  assert.equal(state.trashEntry[0].status, 'restored');
  assert.equal(state.auditLog.at(-1).action, 'restore_from_trash');
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 404 });
});
test('delete from Trash ends recovery but keeps financial history and source intact', async () => {
  const entry = await deleted(); const original = clone(state.product[0]);
  await resolveTrash(await trashScope(actor), entry.id, 'delete', actor);
  assert.deepEqual(state.product[0], original); assert.equal(state.trashEntry[0].status, 'removed');
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 404 });
});
test('expiry is enforced by the action endpoint even without a scheduled cleanup', async () => {
  const entry = await deleted(); entry.expiresAt = new Date(Date.now() - 1);
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 404 });
  await expireTrash(); assert.equal(state.trashEntry[0].status, 'expired'); assert.equal(state.product[0].isActive, false);
});
test('no delete permission and platform accounts cannot access Trash', async () => {
  await assert.rejects(trashScope({ ...actor, role: 'staff', permissions: ['canViewProduct'] }), { status: 403 });
  await assert.rejects(trashScope({ ...actor, isPlatformUser: true }), { status: 403 });
  await assert.rejects(trashScope({ ...actor, tenantId: null }), { status: 403 });
  assert.deepEqual(allowedTrashPermissions({ permissions: ['canManageHRAttendance'] }), ['canDeleteHRAttendance']);
});
test('a module delete permission cannot restore a different module or tenant', async () => {
  const entry = await deleted();
  for (const user of [{ ...actor, tenantId: 'tenant-b' }, { ...actor, role: 'staff', permissions: ['canDeleteStaff'] }]) {
    const scope = await trashScope(user);
    await assert.rejects(resolveTrash(scope, entry.id, 'restore', user), { status: 404 });
  }
});
test('services and rentals retain distinct delete permissions', async () => {
  assert.equal((await deleted('service', { itemType: 'service' })).permission, 'canDeleteService');
  assert.equal((await deleted('rental', { itemType: 'rental' })).permission, 'canDeleteRental');
});
test('branch scope includes only assigned branches and shared records', async () => {
  state.userBranch.push({ userId: 'staff', branchId: 'branch-a', branch: { tenantId: 'tenant-a' } });
  await deleted('one', { branchId: 'branch-a' }); await deleted('two', { branchId: 'branch-b' }); await deleted('shared');
  const user = { ...actor, id: 'staff', role: 'staff', permissions: ['canDeleteProduct'] };
  const result = await request('/', 'get', { user });
  assert.equal(result.statusCode, 200); assert.equal(result.body.total, 2);
  const other = state.trashEntry.find(row => row.recordId === 'two');
  assert.equal((await request('/:id/restore', 'post', { user, params: { id: other.id } })).statusCode, 404);
});
test('changed deletion state or branch is not silently overwritten', async () => {
  const entry = await deleted(); state.product[0].branchId = 'elsewhere';
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 409 });
  assert.equal(state.trashEntry[0].status, 'active');
  state.product[0].branchId = null; state.product[0].isActive = true;
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 409 });
});
test('invalid restoration fields cannot overwrite money or permissions', async () => {
  const entry = await deleted(); entry.restoreFields.balance = 0;
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 409 });
  assert.equal(state.product[0].balance, 500);
});
test('restore respects subscription capacity inside the same transaction', async () => {
  const entry = await deleted(); product('active'); state.tenant[0].plan.maxProducts = 1;
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { statusCode: 403 });
  assert.equal(state.product[0].isActive, false); assert.equal(state.trashEntry[0].status, 'active');
});
test('audit failure rolls back both deletion and restoration', async () => {
  product(); failAudit = true;
  await assert.rejects(moveToTrash('product', { id: 'product-a', tenantId: 'tenant-a' }, actor));
  assert.equal(state.product[0].isActive, true); assert.equal(state.trashEntry.length, 0);
  failAudit = false; await moveToTrash('product', { id: 'product-a', tenantId: 'tenant-a' }, actor);
  failAudit = true;
  await assert.rejects(resolveTrash(await trashScope(actor), state.trashEntry[0].id, 'restore', actor));
  assert.equal(state.product[0].isActive, false); assert.equal(state.trashEntry[0].status, 'active');
});
test('a lost concurrent claim cannot change the source', async () => {
  const entry = await deleted(); loseClaim = true;
  await assert.rejects(resolveTrash(await trashScope(actor), entry.id, 'restore', actor), { status: 409 });
  assert.equal(state.product[0].isActive, false);
});
test('removed/expired records stay hidden and cannot be reactivated through edit forms', async () => {
  const entry = await deleted();
  for (const status of ['active', 'removed', 'expired']) {
    entry.status = status;
    assert.deepEqual(await trashedRecordIds('product', 'tenant-a'), ['product-a']);
    await assert.rejects(assertOutsideTrash('product', 'tenant-a', 'product-a'), { status: 409 });
  }
  entry.status = 'restored'; assert.deepEqual(await trashedRecordIds('product', 'tenant-a'), []);
  await assertOutsideTrash('product', 'tenant-a', 'product-a');
});
test('listing is paginated, searchable and never exposes restoration snapshots', async () => {
  for (let i = 0; i < 25; i++) await deleted(`p-${i}`, { name: `Rice ${i}` });
  const result = await request('/', 'get', { query: { page: '2', limit: '20' } });
  assert.equal(result.body.items.length, 5); assert.equal(result.body.total, 25); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(Object.hasOwn(result.body.items[0], 'restoreFields'), false);
  const searched = await request('/', 'get', { query: { search: 'rice 24' } });
  assert.equal(searched.body.total, 1);
  for (const page of ['Infinity', '-1', '1.5', '1000001']) assert.equal((await request('/', 'get', { query: { page } })).statusCode, 400);
});
test('bulk restoration spans pages and retains conflicts for review', async () => {
  for (let i = 0; i < 105; i++) await deleted(`p-${i}`);
  state.product[0].isActive = true;
  const first = await request('/bulk', 'post', { body: { action: 'restore' } });
  assert.equal(first.body.hasMore, true); assert.equal(first.body.succeeded, 99); assert.equal(first.body.failed.length, 1);
  await deleted('new-arrival'); state.trashEntry.at(-1).deletedAt = new Date(new Date(first.body.before).getTime() + 1);
  const second = await request('/bulk', 'post', { body: { action: 'restore', cursor: first.body.cursor, before: first.body.before } });
  assert.equal(second.body.hasMore, false); assert.equal(second.body.succeeded, 5);
  assert.equal(state.trashEntry.filter(row => row.status === 'active').length, 2);
});
test('bulk deletion obeys per-module permissions and rejects unsupported actions', async () => {
  await deleted(); await deleted('svc', { itemType: 'service' });
  const user = { ...actor, role: 'staff', permissions: ['canDeleteProduct'] };
  const result = await request('/bulk', 'post', { user, body: { action: 'delete' } });
  assert.equal(result.body.succeeded, 1); assert.equal(state.trashEntry[1].status, 'active');
  assert.equal((await request('/bulk', 'post', { body: { action: 'purge-history' } })).statusCode, 400);
  assert.equal((await request('/bulk', 'post', { body: { action: 'restore', before: 'invalid' } })).statusCode, 400);
});
test('employee restoration recovers prior status and termination date without recreating payroll', async () => {
  state.employee.push({ id: 'emp', tenantId: 'tenant-a', firstName: 'Alex', lastName: 'K', status: 'on_leave', terminationDate: null, branchId: null, basicSalary: 300000 });
  await moveToTrash('employee', { id: 'emp', tenantId: 'tenant-a' }, actor);
  assert.equal(state.employee[0].status, 'inactive');
  await resolveTrash(await trashScope(actor), state.trashEntry[0].id, 'restore', actor);
  assert.equal(state.employee[0].status, 'on_leave'); assert.equal(state.employee[0].terminationDate, null); assert.equal(state.employee[0].basicSalary, 300000);
});
test('deployment migration is additive and source delete flows create Trash entries', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20260928100000_tenant_trash/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS/); assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  for (const path of ['../src/routes/inventory.js', '../src/routes/staff.js', '../routes/expenses.js', '../routes/hr.js']) {
    assert.match(await readFile(new URL(path, import.meta.url), 'utf8'), /moveToTrash\(/);
  }
  assert.match(await readFile(new URL('../start.sh', import.meta.url), 'utf8'), /ensure-trash-schema/);
});
