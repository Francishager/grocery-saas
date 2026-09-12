import test, { beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { Prisma } = require('@prisma/client');
const secret = process.env.JWT_SECRET || 'your-secret-key';
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const schedule = (start = '08:00', end = '18:00') => ({ enabled: true,
  days: Array.from({ length: 7 }, (_, day) => ({ day, enabled: day !== 0, allDay: false, start, end })) });
let tenant, staff, updates, permission;
const db = {
  user: {
    findUnique: async () => ({ ...staff, tenant }),
    findFirst: async ({ where }) => where.tenantId === tenant.id && where.id === staff.id ? staff : null,
    update: async ({ data }) => { updates.push(data); Object.assign(staff, data); return staff; },
  },
  tenant: {
    findUnique: async () => tenant,
    update: async ({ where, data }) => { assert.equal(where.id, tenant.id); updates.push(data); return Object.assign(tenant, data); },
  },
  userPermission: { findUnique: async () => permission },
  $transaction: async (action) => action(db),
};
globalThis.workingHoursTestDb = db;

// Run the real route handlers and authentication guard without any database or external-service access.
const fixtures = {
  'db.js': dataUrl('export default globalThis.workingHoursTestDb;'),
  'featureCheck.js': dataUrl('export const getTenantFeatures = async () => new Set(); export const hasFeatureAccess = () => true;'),
  'permissions.js': dataUrl(`export const ROLE_DEFAULTS = {}, ALL_PERMISSION_KEYS = [], PERMISSION_CATEGORIES = [], PERMISSION_METADATA = {};
    export const resolveEffectivePermissions = (user, row) => user.role === 'owner' ? ['*'] : Object.keys(row || {}).filter(key => row[key] === true);
    export const normalizePermissionRecord = value => value; export const permissionAllowedForTenant = () => true;`),
  'branchAccess.js': dataUrl('export const tenantIdFromUser = user => user.tenantId;'),
  'usageLimits.js': dataUrl('export const checkUsageLimit = async () => ({ allowed: true });'),
  'mailer.js': dataUrl('export const sendMail = async () => {};'),
  cloudinary: dataUrl('export default { v2: { config() {} } };'),
};
async function isolatedModule(relative) {
  const url = new URL(relative, import.meta.url);
  let source = await readFile(url, 'utf8');
  source = source.replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, quote, specifier) => {
    const name = specifier.split('/').at(-1);
    const target = fixtures[specifier] || fixtures[name] || (specifier.startsWith('.')
      ? new URL(specifier, url).href : pathToFileURL(require.resolve(specifier)).href);
    return prefix + JSON.stringify(target);
  });
  return import(dataUrl(source));
}
const auth = await isolatedModule('../middleware/auth.js');
globalThis.workingHoursTestAuth = auth;
fixtures['auth.js'] = dataUrl(`export const { authenticateToken, requirePermission, tenantAccountAccessPayload } = globalThis.workingHoursTestAuth;`);
const authRouter = (await isolatedModule('../src/routes/auth.js')).default;
const staffRouter = (await isolatedModule('../src/routes/staff.js')).default;
const settingsRouter = (await isolatedModule('../src/routes/settings.js')).default;
const handler = (router, method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const login = handler(authRouter, 'post', '/login');
const refresh = handler(authRouter, 'post', '/refresh');
const updateStaff = handler(staffRouter, 'patch', '/:id');
const updateSettings = handler(settingsRouter, 'put', '/');

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-14T06:00:00Z') });
  tenant = { id: 'business-a', status: 'active', timezone: 'Africa/Kampala', workingHours: schedule() };
  staff = { id: 'staff-a', tenantId: tenant.id, role: 'attendant', isActive: true, workingHours: null,
    email: 'staff@example.test', password: require('bcryptjs').hashSync('test-password', 4) };
  updates = [];
  permission = { canViewReceivable: true };
});
afterEach(() => mock.timers.reset());
async function call(action, request = {}) {
  const result = { status: 200, body: undefined, next: false };
  const res = { status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await action(request, res, () => { result.next = true; });
  return result;
}
const owner = () => ({ id: 'owner-a', role: 'owner', tenantId: tenant.id, permissions: ['*'] });
const loginRequest = () => ({ body: { email: staff.email, password: 'test-password' } });
const tokenRequest = (claims = {}) => ({ headers: { authorization: `Bearer ${jwt.sign({ id: staff.id, tenantId: tenant.id, role: staff.role, ...claims }, secret)}` } });

test('login allows an in-hours staff member and exposes the enforced schedule', async () => {
  const result = await call(login, loginRequest());
  assert.equal(result.status, 200);
  assert(result.body.tokens.accessToken);
  assert.equal(result.body.user.workingHoursAccess.allowed, true);
  assert.equal(result.body.user.workingHoursAccess.timezone, 'Africa/Kampala');
});

test('login and refresh refuse access at closing time and never issue tokens', async () => {
  const refreshToken = jwt.sign({ id: staff.id, type: 'refresh' }, secret, { expiresIn: '7d' });
  mock.timers.setTime(new Date('2026-09-14T15:00:00Z').getTime());
  for (const [action, request] of [[login, loginRequest()], [refresh, { body: { refreshToken } }]]) {
    const result = await call(action, request);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'OUTSIDE_WORKING_HOURS');
    assert.match(result.body.message, /working hours/);
    assert.equal(result.body.tokens, undefined);
  }
  assert.equal(updates.length, 0);
});

test('an already-issued token cannot make requests after closing or bypass current database roles', async () => {
  const request = tokenRequest({ role: 'owner' });
  assert.equal((await call(auth.authenticateToken, request)).next, true);
  assert.equal(request.user.role, 'attendant');
  mock.timers.setTime(new Date('2026-09-14T15:00:00Z').getTime());
  const result = await call(auth.authenticateToken, request);
  assert.equal(result.status, 403);
  assert.equal(result.next, false);
  assert.equal(result.body.code, 'OUTSIDE_WORKING_HOURS');
});

test('new schedule changes take effect on the next request; custom shifts override business hours', async () => {
  const request = tokenRequest();
  assert.equal((await call(auth.authenticateToken, request)).next, true);
  tenant.workingHours = schedule('10:00', '18:00');
  assert.equal((await call(auth.authenticateToken, request)).status, 403);
  staff.workingHours = schedule('07:00', '10:00');
  assert.equal((await call(auth.authenticateToken, request)).next, true);
  staff.workingHours = null;
  assert.equal((await call(auth.authenticateToken, request)).status, 403);
});

test('owners retain access, but suspension and inactive-user checks still apply', async () => {
  staff.role = 'owner';
  mock.timers.setTime(new Date('2026-09-14T20:00:00Z').getTime());
  assert.equal((await call(login, loginRequest())).status, 200);
  tenant.status = 'suspended';
  assert.equal((await call(login, loginRequest())).body.code, 'TENANT_SUSPENDED');
  staff.isActive = false;
  assert.equal((await call(auth.authenticateToken, tokenRequest())).status, 401);
});

test('owner saves custom hours and can remove the override to inherit business hours', async () => {
  let result = await call(updateStaff, { user: owner(), params: { id: staff.id }, body: { workingHours: schedule('12:00', '20:00') } });
  assert.equal(result.status, 200);
  assert.equal(result.body.staff.workingHours.days[1].start, '12:00');
  result = await call(updateStaff, { user: owner(), params: { id: staff.id }, body: { workingHours: null } });
  assert.equal(result.status, 200);
  assert.equal(updates.at(-1).workingHours, Prisma.DbNull);
});

test('staff cannot change their own hours, promote themselves to owner, or edit another tenant', async () => {
  for (const body of [{ workingHours: null }, { role: 'owner' }]) {
    const result = await call(updateStaff, { user: { ...staff, permissions: ['canEditStaff'] }, params: { id: staff.id }, body });
    assert.equal(result.status, 403);
  }
  const result = await call(updateStaff, { user: { ...owner(), tenantId: 'business-b' }, params: { id: staff.id }, body: { workingHours: schedule() } });
  assert.equal(result.status, 404);
  assert.equal(updates.length, 0);
});

test('invalid custom schedules return a useful validation error without writing', async () => {
  const result = await call(updateStaff, { user: owner(), params: { id: staff.id }, body: { workingHours: schedule('09:00', '09:00') } });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /different opening and closing/);
  assert.equal(updates.length, 0);
});

test('business settings save working hours and reject unauthorized schedule/timezone changes', async () => {
  const result = await call(updateSettings, { user: owner(), body: { workingHours: schedule(), timezone: 'Africa/Nairobi' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.tenant.workingHours.enabled, true);
  updates.length = 0;
  for (const body of [{ workingHours: null }, { timezone: 'America/New_York' }]) {
    const denied = await call(updateSettings, { user: { ...staff, permissions: ['canEditSettings'] }, body });
    assert.equal(denied.status, 403);
  }
  assert.equal(updates.length, 0);
  assert.equal((await call(updateSettings, { user: owner(), body: { timezone: 'Unknown/City' } })).status, 400);
});

test('staff update route retains canEditStaff permission enforcement', async () => {
  const check = staffRouter.stack.find(layer => layer.route?.methods.patch && layer.route.path === '/:id').route.stack[1].handle;
  const denied = await call(check, { user: { ...staff, permissions: [] } });
  assert.equal(denied.status, 403);
  assert.equal(denied.next, false);
});
