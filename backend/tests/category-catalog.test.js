import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getAllDefaultCategoryDefinitions, getDefaultCategoryDefinitionsForBusinessType, ensureTenantCategoryCatalog } from '../src/utils/categoryDefaults.js';

let rows = [];
let writes = 0;
const db = { category: {
  findMany: async ({ where, select } = {}) => rows.filter(row => (!where?.tenantId || row.tenantId === where.tenantId) &&
    (!where?.categoryType || row.categoryType === where.categoryType))
    .map(row => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row }),
  createMany: async ({ data }) => {
    writes++;
    for (const row of data) {
      if (!rows.some(current => current.tenantId === row.tenantId && current.slug === row.slug)) rows.push({ id: 'cat-' + rows.length, ...row });
    }
  },
  upsert: async ({ where, create }) => {
    let found = rows.find(row => row.tenantId === where.tenantId_slug.tenantId && row.slug === where.tenantId_slug.slug);
    if (!found) { found = { id: 'cat-' + rows.length, ...create }; rows.push(found); }
    return found;
  },
  updateMany: async ({ where, data }) => {
    for (const row of rows) {
      if (row.tenantId === where.tenantId && where.id.in.includes(row.id) &&
        row.categoryType === where.categoryType && !(row.productTypes || []).some(type => type !== 'service')) Object.assign(row, data);
    }
  },
} };
globalThis.categoryCatalogFixture = db;
const require = createRequire(import.meta.url);
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const fixtures = {
  'db.js': dataUrl('export default globalThis.categoryCatalogFixture;'),
  'auth.js': dataUrl(`export const authenticateToken=(req,res,next)=>next();
    export const requirePermission=permission=>(req,res,next)=>req.user.permissions.includes(permission)?next():res.status(403).json({error:'Forbidden'});
    export const requireFeature=()=> (req,res,next)=>next();`),
  'branchAccess.js': dataUrl(`export const tenantIdFromUser=user=>user.tenantId;
    export const resolveBranchScope=()=>{},scopedWhere=()=>{},salesUserWhere=()=>{},handleBranchError=()=>{};`),
  'usageLimits.js': dataUrl('export const checkUsageLimit=()=>{};'),
};
const sourceUrl = new URL('../src/routes/inventory.js', import.meta.url);
const source = (await readFile(sourceUrl, 'utf8')).replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, quote, specifier) => {
  const target = fixtures[specifier.split('/').at(-1)] || (specifier.startsWith('.') ? new URL(specifier, sourceUrl).href :
    specifier.startsWith('node:') ? specifier : pathToFileURL(require.resolve(specifier)).href);
  return prefix + JSON.stringify(target);
});
const router = (await import(dataUrl(source))).default;
async function request(method, { body = {}, query = {}, permissions = [], tenantId = 'tenant-a' } = {}) {
  const route = router.stack.find(layer => layer.route?.path === '/categories' && layer.route.methods[method]).route;
  const req = { body, query, user: { id: 'staff', tenantId, permissions } };
  const result = { status: 200, body: undefined };
  const res = { status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return result;
}
beforeEach(() => { rows = []; writes = 0; });

test('every business type gets a broad, deduplicated, separately typed catalogue', () => {
  const catalogue = getAllDefaultCategoryDefinitions();
  assert.equal(new Set(catalogue.map(row => row.slug)).size, catalogue.length);
  assert(catalogue.filter(row => row.categoryType === 'product').length > 500);
  assert(catalogue.filter(row => row.categoryType === 'service').length > 250);
  for (const businessType of ['retail', 'service', 'pharmacy', 'agriculture', 'unknown']) {
    assert.deepEqual(getDefaultCategoryDefinitionsForBusinessType(businessType), catalogue);
  }
  assert(catalogue.some(row => row.name === 'Software Development' && row.categoryType === 'service'));
  assert(!catalogue.some(row => row.name === 'Software Development' && row.categoryType === 'product'));
  assert(catalogue.some(row => row.name === 'Seeds & Seedlings' && row.categoryType === 'product'));
});

test('backfill adds missing categories without changing existing IDs or other tenants and is repeatable', async () => {
  const custom = { id: 'existing', tenantId: 'tenant-a', name: 'Local Specialty', slug: 'local-specialty', categoryType: 'product' };
  const other = { id: 'other', tenantId: 'tenant-b', name: 'Private', slug: 'private', categoryType: 'service' };
  rows.push(custom, other);
  await ensureTenantCategoryCatalog(db, 'tenant-a');
  const count = rows.length;
  await ensureTenantCategoryCatalog(db, 'tenant-a');
  assert.equal(rows.length, count);
  assert.equal(writes, 1);
  assert.equal(rows.find(row => row.id === 'existing'), custom);
  assert.deepEqual(rows.filter(row => row.tenantId === 'tenant-b'), [other]);
});

test('category listing returns all matching categories and validates the type', async () => {
  const services = await request('get', { query: { type: 'service' } });
  assert.equal(services.status, 200);
  assert(services.body.length > 250);
  assert(services.body.every(row => row.tenantId === 'tenant-a' && row.categoryType === 'service'));
  const products = await request('get', { query: { type: 'product' } });
  assert(products.body.length > 500);
  assert(products.body.every(row => row.categoryType === 'product'));
  assert.equal((await request('get', { query: { type: 'invalid' } })).status, 400);
});

test('legacy service defaults are repaired without relinking items or changing physical-product categories', async () => {
  rows.push(
    { id: 'legacy-service', tenantId: 'tenant-a', name: 'Software Development', slug: 'software-development', categoryType: 'product', productTypes: ['service'] },
    { id: 'mixed', tenantId: 'tenant-a', name: 'Pest Control', slug: 'pest-control', categoryType: 'product', productTypes: ['product'] },
  );
  await ensureTenantCategoryCatalog(db, 'tenant-a');
  assert.equal(rows.find(row => row.id === 'legacy-service').categoryType, 'service');
  assert.equal(rows.filter(row => row.name === 'Software Development').length, 1);
  assert.equal(rows.find(row => row.id === 'mixed').categoryType, 'product');
  assert(rows.some(row => row.name === 'Pest Control' && row.categoryType === 'service'));
  const count = rows.length;
  await ensureTenantCategoryCatalog(db, 'tenant-a');
  assert.equal(rows.length, count);
});

test('service and product category creation use their respective permissions', async () => {
  const body = { name: 'Specialist Training', categoryType: 'service' };
  assert.equal((await request('post', { body, permissions: ['canCreateProduct'] })).status, 403);
  assert.equal((await request('post', { body, permissions: ['canCreateService'] })).status, 201);
  assert.equal((await request('post', { body: { ...body, categoryType: ['service'] }, permissions: ['canCreateService'] })).status, 400);
  assert.equal((await request('post', { body: { ...body, categoryType: 'product' }, permissions: ['canCreateService'] })).status, 403);
  assert.equal((await request('post', { body: { ...body, categoryType: 'product' }, permissions: ['canCreateProduct'] })).status, 201);
  assert.equal(new Set(rows.map(row => row.slug)).size, 2);
});

test('custom categories deduplicate, support international names and preserve distinct punctuation names', async () => {
  const post = (name, tenantId = 'tenant-a') => request('post', { body: { name, categoryType: 'service' }, permissions: ['canCreateService'], tenantId });
  const original = await post('Specialist   Training');
  assert.equal((await post(' specialist training ')).body.category.id, original.body.category.id);
  assert.notEqual((await post('C++')).body.category.id, (await post('C#')).body.category.id);
  assert.equal((await post('日本語研修')).status, 201);
  assert.equal((await post('---')).status, 400);
  assert.notEqual((await post('Specialist Training', 'tenant-b')).body.category.id, original.body.category.id);
});
