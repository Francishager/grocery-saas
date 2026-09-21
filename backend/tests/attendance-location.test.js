import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { businessAttendanceLocation, validCoordinates } from '../src/utils/attendanceLocation.js';

const require = createRequire(import.meta.url);
const packageUrl = (name) => JSON.stringify(pathToFileURL(require.resolve(name)).href);
const utilsUrl = JSON.stringify(new URL('../src/utils/attendanceLocation.js', import.meta.url).href);
const business = { address: 'Kampala store', attendanceLatitude: 0.3476, attendanceLongitude: 32.5825, attendanceRadiusMeters: 200 };
let tenant, permission, lastRecordQuery, savedSettings;
let record;
const employees = [{ id: 'employee-a', tenantId: 'tenant-a', userId: 'login-a', firstName: 'Alex' }];
const db = {
  tenant: {
    findUnique: async () => tenant,
    update: async ({ data }) => { savedSettings = data; return { ...tenant, ...data }; },
  },
  employee: {
    findFirst: async ({ where }) => employees.find((employee) => employee.tenantId === where.tenantId
      && (!where.id || employee.id === where.id) && (!where.userId || employee.userId === where.userId)) || null,
    findMany: async ({ where }) => employees.filter((employee) => employee.tenantId === where.tenantId
      && (!where.id || employee.id === where.id) && (where.userId !== null || employee.userId === null)),
  },
  attendanceRecord: {
    findFirst: async (query) => { lastRecordQuery = query; return record; },
    create: async ({ data }) => { record = { ...data, id: 'record-a' }; return record; },
    update: async ({ data }) => { record = { ...record, ...data }; return record; },
  },
  attendanceConfiguration: { findFirst: async () => null },
};
globalThis.attendanceTest = { db, permissions: { hasPermission: async (_tenant, _user, code) => permission.includes(code) } };
let source = await readFile(new URL('../src/services/attendanceService.js', import.meta.url), 'utf8');
source = source.replace("import prisma from '../db.js';", 'const prisma = globalThis.attendanceTest.db;')
  .replace("'../utils/attendanceLocation.js'", utilsUrl);
const load = async (text) => import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
const { default: service } = await load(source);
service.createAudit = async () => {};
globalThis.attendanceTest.service = service;

source = await readFile(new URL('../src/routes/attendanceRoutes.js', import.meta.url), 'utf8');
source = source.replace("'express'", packageUrl('express'))
  .replace("import prisma from '../db.js';", 'const prisma = globalThis.attendanceTest.db;')
  .replace(/import \{ requireAuth, requireTenant \} from [^;]+;/, 'const requireAuth = (req,res,next) => next(); const requireTenant = requireAuth;')
  .replace("import attendanceService from '../services/attendanceService.js';", 'const attendanceService = globalThis.attendanceTest.service;')
  .replace("import attendanceConfigService from '../services/attendanceConfigService.js';", 'const attendanceConfigService = {};')
  .replace("import hrPermissionService from '../services/hrPermissionService.js';", 'const hrPermissionService = globalThis.attendanceTest.permissions;')
  .replace("'../utils/attendanceLocation.js'", utilsUrl);
const { default: router } = await load(source);

source = await readFile(new URL('../src/routes/settings.js', import.meta.url), 'utf8');
source = source.replace('"express"', packageUrl('express'))
  .replace('"@prisma/client"', packageUrl('@prisma/client'))
  .replace('"multer"', packageUrl('multer'))
  .replace('"cloudinary"', packageUrl('cloudinary'))
  .replace('import prisma from "../db.js";', 'const prisma = globalThis.attendanceTest.db;')
  .replace(/import \{ authenticateToken, requirePermission \} from [^;]+;/, 'const authenticateToken = (req,res,next) => next(); const requirePermission = () => authenticateToken;')
  .replace(/import \{ tenantIdFromUser \} from [^;]+;/, 'const tenantIdFromUser = user => user.tenantId;')
  .replace('"../utils/attendanceLocation.js"', utilsUrl)
  .replace('"../utils/workingHours.js"', JSON.stringify(new URL('../src/utils/workingHours.js', import.meta.url).href));
const { default: settingsRouter } = await load(source);

async function request(target, path, method = 'get', values = {}) {
  const req = { user: { id: 'login-a', tenantId: 'tenant-a' }, tenant: { id: 'tenant-a' }, query: {}, body: {}, ...values };
  const res = { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, set(key,value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
  const route = target.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return res;
}

test.beforeEach(() => {
  tenant = { ...business };
  permission = ['ATTENDANCE_RECORD_OWN'];
  record = null;
  savedSettings = undefined;
  lastRecordQuery = undefined;
});

test('GPS values must be real numbers, and an address alone is not configured', () => {
  for (const value of [null, undefined, '', '0', NaN, Infinity]) {
    assert.equal(validCoordinates({ latitude: value, longitude: value }), false);
  }
  assert.equal(validCoordinates({ latitude: 0, longitude: 0 }), true);
  assert.equal(validCoordinates({ latitude: 91, longitude: 0 }), false);
  assert.equal(businessAttendanceLocation({ address: 'Store' }).configured, false);
  assert.equal(businessAttendanceLocation(business).configured, true);
});

test('saving other settings preserves empty GPS values instead of inventing 0,0', async () => {
  const res = await request(settingsRouter, '/', 'put', { body: { address: 'Store', attendanceLatitude: null, attendanceLongitude: null } });
  assert.equal(res.statusCode, 200);
  assert.equal(savedSettings.attendanceLatitude, null);
  assert.equal(savedSettings.attendanceLongitude, null);
});

test('saved GPS round-trips to attendance; partial or blank coordinates are rejected', async () => {
  const res = await request(settingsRouter, '/', 'put', { body: business });
  assert.equal(res.statusCode, 200);
  assert.equal(savedSettings.attendanceLatitude, business.attendanceLatitude);
  const location = await request(router, '/attendance/geofence');
  assert.equal(location.body.configured, true);
  assert.equal(location.body.data.latitude, business.attendanceLatitude);
  for (const body of [{ attendanceLatitude: '', attendanceLongitude: '' }, { attendanceLatitude: 1 }]) {
    assert.equal((await request(settingsRouter, '/', 'put', { body })).statusCode, 400);
  }
});

test('geofence retains the business address when GPS has not been captured', async () => {
  tenant.attendanceLatitude = null;
  const res = await request(router, '/attendance/geofence');
  assert.equal(res.body.configured, false);
  assert.equal(res.body.data.address, business.address);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('employee options identify the logged-in employee and limit self-only users', async () => {
  const res = await request(router, '/attendance/employee-options');
  assert.equal(res.body.ownEmployeeId, 'employee-a');
  assert.equal(res.body.canRecordAnyone, false);
  assert.deepEqual(res.body.data.map((employee) => employee.id), ['employee-a']);
});

test('an existing check-in is restored without employee-management permissions', async () => {
  record = { checkInTime: new Date(), checkOutTime: null };
  const res = await request(router, '/attendance/current-status', 'get', { query: { employeeId: 'employee-a' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.checkInTime, record.checkInTime);
  assert.equal(lastRecordQuery.where.tenantId, 'tenant-a');
  assert.equal(lastRecordQuery.where.employeeId, 'employee-a');
  assert.deepEqual(lastRecordQuery.select, { checkInTime: true, checkOutTime: true });
});

test('self-only status cannot read another employee; users without permission are rejected', async () => {
  assert.equal((await request(router, '/attendance/current-status', 'get', { query: { employeeId: 'someone-else' } })).statusCode, 403);
  assert.equal(lastRecordQuery, undefined);
  permission = [];
  assert.equal((await request(router, '/attendance/current-status')).statusCode, 403);
});

test('record-anyone status still rejects cross-tenant employees and missing selection', async () => {
  permission = ['ATTENDANCE_RECORD'];
  assert.equal((await request(router, '/attendance/current-status', 'get', { query: { employeeId: 'other-tenant-employee' } })).statusCode, 400);
  assert.equal((await request(router, '/attendance/current-status')).statusCode, 400);
  assert.equal(lastRecordQuery, undefined);
});

test('server accepts on-site attendance and rejects remote or missing device location', async () => {
  const coordinates = { latitude: business.attendanceLatitude, longitude: business.attendanceLongitude };
  await assert.rejects(service.checkIn('tenant-a', 'employee-a', 'MANUAL', null, 'login-a', { latitude: null, longitude: null }), /Device location/);
  await assert.rejects(service.checkIn('tenant-a', 'employee-a', 'MANUAL', null, 'login-a', { latitude: 1, longitude: 33 }), /metres from/);
  const entry = await service.checkIn('tenant-a', 'employee-a', 'MANUAL', 'forged address', 'login-a', coordinates);
  assert.equal(entry.location, business.address);
  assert.ok(entry.checkInTime);
  const exit = await service.checkOut('tenant-a', 'employee-a', 'forged address', 'login-a', coordinates);
  assert.equal(exit.location, business.address);
  assert.ok(exit.checkOutTime);
});

