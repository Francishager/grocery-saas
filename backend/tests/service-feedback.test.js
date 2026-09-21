import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

let links = [];
let feedback = [];
let orders = [];
let cards = [];
let tenantStatus = 'active';
const service = { id: 'service-a', tenantId: 'tenant-a', itemType: 'service', isActive: true, name: 'Hair styling', price: 50000, description: 'Wash and style', category: { name: 'Hair' } };
const fake = {
  $transaction: async callback => callback({ $executeRawUnsafe: async () => 0 }),
  product: { findFirst: async ({ where }) => where.id === service.id && where.tenantId === service.tenantId ? service : null },
  tenant: { findUnique: async () => ({ id: 'tenant-a', name: 'Test Salon', status: tenantStatus, planId: null }) },
  tenantFeature: { findMany: async () => [{ feature: { name: 'service' }, enabled: true }] },
  serviceFeedbackLink: {
    create: async ({ data }) => { links.push(data); return data; },
    findUnique: async ({ where }) => links.find(link => link.tokenHash === where.tokenHash),
  },
  serviceFeedback: { create: async ({ data }) => { feedback.push(data); return { id: 'feedback-a', ...data }; } },
  appointment: { findFirst: async () => null },
  workOrder: {
    findFirst: async () => null,
    create: async ({ data }) => { orders.push(data); return data; },
  },
  serviceJobCard: {
    create: async ({ data }) => { cards.push({ id: 'card-a', ...data }); return cards.at(-1); },
    findFirst: async ({ where }) => cards.find(card => card.id === where.id && card.tenantId === where.tenantId),
    update: async ({ data }) => ({ ...cards[0], ...data }),
  },
};
globalThis.prisma = fake;
const { default: router } = await import('../routes/service.js');

async function invoke(method, path, body = {}, token, tenantId = 'tenant-a') {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { body, params: { token, id: 'card-a' }, user: { tenantId } };
  const result = { status: 200, body: null };
  const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
  await route.stack.at(-1).handle(req, res);
  return result;
}

async function createLink() {
  const result = await invoke('post', '/feedback-link', { productId: service.id });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  links[0].isActive = true;
  return result.body.path.split('/').at(-1);
}

beforeEach(() => { links = []; feedback = []; orders = []; cards = []; tenantStatus = 'active'; });

test('QR link contains an opaque token and only its hash is persisted', async () => {
  const token = await createLink();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(links[0].tokenHash, crypto.createHash('sha256').update(token).digest('hex'));
  assert(!JSON.stringify(links[0]).includes(token));
  const result = await invoke('get', '/public-feedback/:token', {}, token);
  assert.equal(result.status, 200);
  assert.equal(result.body.businessName, 'Test Salon');
  assert.equal(result.body.service.name, service.name);
  for (const method of ['get', 'post']) {
    const route = router.stack.find(layer => layer.route?.path === '/public-feedback/:token' && layer.route.methods[method]).route;
    assert.equal(route.stack.length, 1, 'Public feedback must not require authentication');
  }
});

test('public submission uses the QR tenant and service, ignoring submitted ownership IDs', async () => {
  const token = await createLink();
  const result = await invoke('post', '/public-feedback/:token', { customerName: ' Alice ', rating: 4, comment: 'Great service', tenantId: 'other', productId: 'other' }, token);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(feedback[0].tenantId, 'tenant-a');
  assert.equal(feedback[0].productId, service.id);
  assert.equal(feedback[0].customerName, 'Alice');
});

test('invalid ratings and oversized feedback are rejected without writing', async () => {
  const token = await createLink();
  for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: 5, serviceQuality: 99 }, { rating: 5, comment: 'x'.repeat(4001) }, { rating: 5, customerName: {} }]) {
    const result = await invoke('post', '/public-feedback/:token', { customerName: 'Alice', ...body }, token);
    assert.equal(result.status, 400);
  }
  assert.equal(feedback.length, 0);
});

test('invalid, inactive and expired QR links and suspended businesses are unavailable', async () => {
  assert.equal((await invoke('get', '/public-feedback/:token', {}, 'invalid')).status, 404);
  const token = await createLink();
  links[0].isActive = false;
  assert.equal((await invoke('get', '/public-feedback/:token', {}, token)).status, 404);
  links[0].isActive = true;
  links[0].expiresAt = new Date(0);
  assert.equal((await invoke('get', '/public-feedback/:token', {}, token)).status, 404);
  links[0].expiresAt = null;
  tenantStatus = 'suspended';
  assert.equal((await invoke('post', '/public-feedback/:token', { customerName: 'Alice', rating: 5 }, token)).status, 404);
});

test('cannot generate QR links for another tenant service or unrelated work order', async () => {
  assert.equal((await invoke('post', '/feedback-link', { productId: service.id }, null, 'other-tenant')).status, 400);
  assert.equal((await invoke('post', '/feedback-link', { productId: service.id, workOrderId: 'other-order' })).status, 400);
  assert.equal(links.length, 0);
});

test('work orders and job cards require a saved service and normalize empty optional links', async () => {
  for (const path of ['/work-orders', '/job-cards']) {
    assert.equal((await invoke('post', path, { customerName: 'Alice', productId: 'other-product' })).status, 400);
    const result = await invoke('post', path, { customerName: 'Alice', productId: service.id, technicianId: '', appointmentId: '', workOrderId: '', laborCost: 0, partsCost: 0, estimatedCost: 0 });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.technicianId, null);
    assert.equal(result.body.productId, service.id);
  }
  assert.equal(orders[0].estimatedCost, 0);
  assert.equal(cards[0].laborCost, 0);
  assert.equal(cards[0].appointmentId, null);
});

test('job-card status changes preserve existing service costs', async () => {
  cards.push({ id: 'card-a', tenantId: 'tenant-a', laborCost: 50000, partsCost: 10000 });
  const result = await invoke('put', '/job-cards/:id', { status: 'completed' });
  assert.equal(result.status, 200);
  assert.equal(result.body.totalCost, 60000);
});
