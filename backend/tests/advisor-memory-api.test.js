import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import * as advice from '../src/services/businessAdvisor.js';
import { beginAdvisorTurn, failAdvisorTurn, loadAdvisorMemory } from '../src/services/advisorMemory.js';
const require = createRequire(import.meta.url);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let rows, req, providerCalls, failProvider, counter = 0;
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
  if (key === 'OR') return value.some(part => matches(row, part));
  if (key === 'turns') return rows.advisorTurn.some(turn => turn.conversationId === row.id && matches(turn, value.some));
  if (key === 'conversationId_requestId') return row.conversationId === value.conversationId && row.requestId === value.requestId;
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([operator, other]) => operator === 'mode' ||
    (operator === 'not' ? row[key] !== other : operator === 'lt' ? row[key] < other : operator === 'gt' ? row[key] > other : operator === 'in' ? other.includes(row[key]) : operator === 'contains' ? String(row[key] || '').toLowerCase().includes(other.toLowerCase()) : false));
  return row[key] === value;
});
const db = {};
for (const name of ['advisorCollection', 'advisorConversation', 'advisorTurn']) {
  const decorate = row => row ? structuredClone({ ...row, ...(name === 'advisorConversation' ? {
    collection: rows.advisorCollection.find(collection => collection.id === row.collectionId) || null,
    turns: rows.advisorTurn.filter(turn => turn.conversationId === row.id && turn.status === 'complete').slice(-2).reverse(),
  } : {}) }) : null;
  const update = (row, data) => { for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value; return decorate(row); };
  db[name] = {
    findFirst: async ({ where }) => decorate(rows[name].find(row => matches(row, where))),
    findUnique: async ({ where }) => decorate(rows[name].find(row => matches(row, where))),
    findMany: async ({ where, orderBy, skip = 0, take }) => {
      const result = rows[name].filter(row => matches(row, where));
      const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      result.sort((a, b) => { for (const fields of order) for (const [key, direction] of Object.entries(fields)) { if (a[key] === b[key]) continue; return (a[key] > b[key] ? 1 : -1) * (direction === 'desc' ? -1 : 1); } return 0; });
      return result.slice(skip, take === undefined ? undefined : skip + take).map(decorate);
    },
    create: async ({ data }) => {
      const row = { id: `${name}-${++counter}`, createdAt: new Date(), updatedAt: new Date(), memory: '', memoryThrough: 0, nextSequence: 1, busyUntil: null, activeRequestId: null, ...data };
      rows[name].push(row); return decorate(row);
    },
    update: async ({ where, data }) => update(rows[name].find(row => matches(row, where)), data),
    updateMany: async ({ where, data }) => { const selected = rows[name].filter(row => matches(row, where)); selected.forEach(row => update(row, data)); return { count: selected.length }; },
    deleteMany: async ({ where }) => {
      const removed = rows[name].filter(row => matches(row, where)); rows[name] = rows[name].filter(row => !matches(row, where));
      if (name === 'advisorConversation') rows.advisorTurn = rows.advisorTurn.filter(turn => !removed.some(row => row.id === turn.conversationId));
      if (name === 'advisorCollection') { rows.advisorConversation.forEach(chat => { if (removed.some(row => row.id === chat.collectionId)) chat.collectionId = null; }); rows.advisorCollection.forEach(collection => { if (removed.some(row => row.id === collection.parentId)) collection.parentId = null; }); }
      return { count: removed.length };
    },
  };
}
db.$transaction = action => action(db);
globalThis.advisorApiFixture = { db, advice: { ...advice,
  requestBusinessAdvice: async args => { providerCalls.push(args); if (failProvider) throw advice.advisorError(503, 'Try again.', 'AI_UNAVAILABLE'); return { reply: '**Saved advice**', truncated: false }; },
  compactAdvisorMemory: async (memory, turns) => `${memory} Remembered: ${turns.map(turn => turn.input).join(', ')}`,
} };
process.env.NVIDIA_API_KEY = 'isolated-test-key';
const fixtures = {
  'db.js': dataUrl('export default globalThis.advisorApiFixture.db;'),
  'auth.js': dataUrl(`export const authenticateToken=(req,res,next)=>req.user?next():res.status(401).json({}); export const blockPlatformAdmin=(req,res,next)=>req.user.role==='saas_admin'?res.status(403).json({}):next(); export const requireTenant=(req,res,next)=>req.user.tenantId?next():res.status(403).json({}); export const requirePermission=key=>(req,res,next)=>req.user.permissions.includes(key)?next():res.status(403).json({});`),
  'featureCheck.js': dataUrl(`export const requireFeature=key=>(req,res,next)=>req.tenantFeatures.has(key)?next():res.status(403).json({});`),
  'businessAdvisor.js': dataUrl('export const {createAdvisorLimiter,requestBusinessAdvice,validateAdvisorRequest,advisorError,compactAdvisorMemory}=globalThis.advisorApiFixture.advice;'),
  'businessAdvisorContext.js': dataUrl(`export const buildBusinessAdvisorContext=async()=>({business:{name:'Test'},period:{from:'2026-09-01',to:'2026-09-13'},scope:{branch:'All'},sources:[],limitations:[]});`),
  'advisorPeopleContext.js': dataUrl('export const addAdvisorPeopleContext=async(db,req,context)=>context;'),
  'advisorResearch.js': dataUrl('export const fetchAdvisorResearch=async()=>({status:"available",sources:[]});'),
};
const routeUrl = new URL('../src/routes/businessAdvisor.js', import.meta.url);
const source = (await readFile(routeUrl, 'utf8')).replace(/(from\s+)(["'])([^"']+)\2/g, (_, prefix, quote, specifier) => prefix + JSON.stringify(fixtures[specifier.split('/').at(-1)] || (specifier.startsWith('.') ? new URL(specifier, routeUrl).href : pathToFileURL(require.resolve(specifier)).href)));
const router = (await import(dataUrl(source))).default;
beforeEach(() => {
  rows = { advisorCollection: [], advisorConversation: [], advisorTurn: [] }; providerCalls = []; failProvider = false;
  req = { user: { id: `owner-${++counter}`, tenantId: 'tenant-a', role: 'owner', permissions: ['canUseBusinessAI'] }, tenantFeatures: new Set(['dashboard']), query: {} };
});
async function call(method, path, { body = {}, params = {}, query = {}, user = req.user, tenantFeatures = req.tenantFeatures } = {}) {
  const result = { status: 200 };
  const res = Object.assign(new EventEmitter(), { set() { return this; }, status(code) { result.status = code; return this; }, json(body) { result.body = body; this.writableEnded = true; return this; } });
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]);
  assert(route, `${method} ${path} is registered`);
  const stack = [...router.stack.filter(layer => !layer.route), ...route.route.stack];
  for (const layer of stack) { let next = false; await layer.handle({ user, tenantFeatures, body, params, query }, res, () => { next = true; }); if (!next) break; }
  return result;
}
async function createChat(extra = {}) { const result = await call('post', '/conversations', { body: { title: 'Business growth', ...extra } }); assert.equal(result.status, 201); return result.body.conversation; }
const send = (chat, message = 'Help grow sales', requestId = 'request-1') => call('post', '/chat', { body: { conversationId: chat.id, requestId, message, research: false } });

test('folders, projects and chats persist and are private to the authenticated tenant AND user', async () => {
  const folder = (await call('post', '/collections', { body: { name: 'Plans', kind: 'folder' } })).body.collection;
  const project = (await call('post', '/collections', { body: { name: 'Growth', kind: 'project', parentId: folder.id, instructions: 'Improve retention' } })).body.collection;
  const chat = await createChat({ collectionId: project.id });
  assert.equal((await send(chat)).status, 200);
  const reopened = await call('get', '/conversations/:id', { params: { id: chat.id } });
  assert.equal(reopened.body.turns[0].output, '**Saved advice**');
  assert.equal(providerCalls[0].context.project.instructions, 'Improve retention');
  for (const user of [{ ...req.user, tenantId: 'tenant-b' }, { ...req.user, id: 'other-staff' }]) {
    assert.equal((await call('get', '/conversations/:id', { params: { id: chat.id }, user })).status, 404);
    assert.equal((await call('get', '/conversations', { user })).body.conversations.length, 0);
    assert.equal((await call('post', '/conversations', { body: { collectionId: project.id }, user })).status, 404);
    assert.equal((await call('delete', '/conversations/:id', { params: { id: chat.id }, user })).status, 404);
  }
});

test('completed request retries return the same stored reply without extra messages or provider calls', async () => {
  const chat = await createChat();
  const first = await send(chat); const retry = await send(chat);
  assert.equal(first.status, 200); assert.equal(retry.status, 200);
  assert.equal(first.body.turn.id, retry.body.turn.id); assert.equal(rows.advisorTurn.length, 1); assert.equal(providerCalls.length, 1);
  assert.equal((await send(chat, 'Different input', 'request-1')).status, 409);
});

test('failed replies remain retryable under the same request ID without duplication', async () => {
  const chat = await createChat(); failProvider = true;
  assert.equal((await send(chat)).status, 503); assert.equal(rows.advisorTurn[0].status, 'failed');
  assert.equal(rows.advisorConversation[0].busyUntil, null);
  failProvider = false; assert.equal((await send(chat)).status, 200);
  assert.equal(rows.advisorTurn.length, 1); assert.equal(rows.advisorTurn[0].status, 'complete');
});

test('database lease rejects concurrent turns and releases after a failed turn', async () => {
  const chat = await createChat(); const stored = rows.advisorConversation[0];
  const first = await beginAdvisorTurn(db, req, chat.id, stored.scopeKey, 'first', 'Hello');
  await assert.rejects(() => beginAdvisorTurn(db, req, chat.id, stored.scopeKey, 'second', 'Hello again'), error => error.code === 'CHAT_BUSY');
  await failAdvisorTurn(db, req, first.turn);
  assert.equal((await beginAdvisorTurn(db, req, chat.id, stored.scopeKey, 'first', 'Hello')).turn.id, first.turn.id);
});

test('changed permissions lock old chat contents and conceal their titles', async () => {
  const chat = await createChat({ title: 'Customer Eddy balance 450000' });
  req.user.permissions.push('canViewHR');
  assert.equal((await call('get', '/conversations/:id', { params: { id: chat.id } })).status, 403);
  const listed = (await call('get', '/conversations')).body.conversations[0];
  assert.equal(listed.locked, true); assert(!listed.title.includes('Eddy'));
});

test('long chats summarize older turns into database memory while preserving their full history', async () => {
  const chat = await createChat(); const stored = rows.advisorConversation[0];
  for (let i = 1; i <= 13; i++) rows.advisorTurn.push({ id: `old-${i}`, requestId: `old-${i}`, conversationId: chat.id, sequence: i, input: `Goal ${i}`, output: 'Earlier response', status: 'complete', createdAt: new Date() });
  stored.nextSequence = 14;
  const result = await send(chat);
  assert.equal(result.status, 200); assert.equal(stored.memoryThrough, 5); assert.match(stored.memory, /Goal 1/);
  assert.equal(rows.advisorTurn.length, 14); assert.equal(providerCalls[0].messages.length, 17);
  assert.match(providerCalls[0].context.conversationMemory, /Goal 5/);
});

test('previous-conversation recall falls back to recent chats and excludes other users/scopes', async () => {
  const previous = await createChat({ title: 'Old strategy' }); await send(previous);
  const current = await createChat({ title: 'New question' });
  const row = rows.advisorConversation.find(row => row.id === current.id);
  rows.advisorConversation.push({ ...row, id: 'other-user', userId: 'other', title: 'Secret payroll' });
  const history = await loadAdvisorMemory(db, req, row, 'Hello again', true);
  assert.equal(history.related.length, 1); assert.equal(history.related[0].title, 'Old strategy');
  assert.equal((await loadAdvisorMemory(db, req, row, 'Hello', false)).related.length, 0);
});

test('rename, moving and deletion preserve ownership; deleting a project keeps its chats', async () => {
  const project = (await call('post', '/collections', { body: { name: 'Growth', kind: 'project' } })).body.collection;
  const chat = await createChat(); await send(chat);
  assert.equal((await call('patch', '/conversations/:id', { params: { id: chat.id }, body: { title: 'Renamed', collectionId: project.id } })).status, 200);
  assert.equal(rows.advisorConversation[0].collectionId, project.id);
  assert.equal((await call('delete', '/collections/:id', { params: { id: project.id } })).status, 200);
  assert.equal(rows.advisorConversation[0].collectionId, null); assert.equal(rows.advisorTurn.length, 1);
  assert.equal((await call('delete', '/conversations/:id', { params: { id: chat.id } })).status, 200);
  assert.equal(rows.advisorTurn.length, 0);
});

test('advisor routes enforce module access and reject client-supplied context or ownership', async () => {
  for (const [method, path] of [['get', '/conversations'], ['post', '/collections'], ['post', '/chat']]) {
    assert.equal((await call(method, path, { user: { ...req.user, permissions: [] } })).status, 403);
    assert.equal((await call(method, path, { tenantFeatures: new Set() })).status, 403);
  }
  assert.equal((await call('post', '/conversations', { body: { tenantId: 'other', title: 'forged' } })).status, 400);
  const chat = await createChat();
  assert.equal((await call('post', '/chat', { body: { conversationId: chat.id, requestId: 'x', message: 'Hi', context: { payroll: 1 } } })).status, 400);
  assert.equal(rows.advisorTurn.length, 0);
});
