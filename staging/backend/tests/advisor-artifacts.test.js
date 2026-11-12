import test from 'node:test';
import assert from 'node:assert/strict';
import { availableReportTypes, buildArtifactData, creativeOptions, parseCreativeCopy, reportFromContext, validateArtifactInput } from '../src/services/advisorArtifacts.js';
import { generateAdvisorArtwork, loadAdvisorProductImage } from '../src/services/advisorArtwork.js';
import { requestBusinessAdvice } from '../src/services/businessAdvisor.js';

const req = (permissions = ['*'], features = ['dashboard', 'sales', 'inventory', 'receivables', 'hr', 'reports']) => ({ user: { id: 'owner', tenantId: 'test-tenant', role: 'owner', permissions }, tenantFeatures: new Set(features), query: {} });
const input = extra => validateArtifactInput({ requestId: 'test-1', kind: 'flyer', brief: 'Promote our rice naturally.', artwork: 'none', ...extra });
const copy = { headline: 'Good rice. Great meals.', subheading: 'Rice for everyday cooking', body: 'Visit our store for your next family meal.', cta: 'Visit us today', caption: 'Make something delicious tonight.', hashtags: ['#Rice'], imagePrompt: 'A bowl of rice with vegetables on a dining table' };
const profile = { tenant: { findUnique: async query => { assert.deepEqual(Object.keys(query.select).sort(), ['businessType', 'currency', 'logo', 'name']); return { name: 'Synthetic Rice Shop', businessType: 'Retail', currency: 'UGX', logo: 'https://res.cloudinary.com/demo/image/upload/logo.png' }; } } };
const context = { period: { from: '2026-09-01', to: '2026-09-13' }, scope: { branch: 'All permitted branches' }, sources: ['Recorded sales'], limitations: ['Limited snapshot'], asOf: '2026-09-13' };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);

test('visual requests reject untrusted ownership, data payloads, invalid kinds and invalid lengths', () => {
  assert.equal(input({}).days, 30);
  assert.equal(input({}).layout, 'auto');
  assert.throws(() => input({ layout: '<svg />' }), error => error.statusCode === 400);
  assert.equal(input({ artwork: 'generated' }).artwork, 'auto');
  for (const body of [null, [], { ...input({}), tenantId: 'other' }, { ...input({}), context: {} }, { ...input({}), kind: 'invoice' }, { ...input({}), days: 365 }, { ...input({}), brief: 'x'.repeat(3001) }]) assert.throws(() => validateArtifactInput(body), error => error.statusCode === 400);
  assert.throws(() => parseCreativeCopy('not json'), error => error.statusCode === 502);
  assert.throws(() => parseCreativeCopy(JSON.stringify({ headline: 'Sale', caption: 'Buy' })), error => error.code === 'LOW_QUALITY_CREATIVE');
  assert.equal(parseCreativeCopy('```json\n' + JSON.stringify(copy) + '\n```').headline, copy.headline);
});

test('marketing receives only the business profile and selected product, never private reports, customers or HR', async () => {
  let prompt;
  const db = { ...profile, product: { findFirst: async query => { assert.equal(query.where.tenantId, 'test-tenant'); assert.equal(query.where.id, 'product-1'); return { name: 'Pink rice', price: 4500, baseUnit: 'kg', itemType: 'product', image: 'https://res.cloudinary.com/demo/image/upload/rice.png' }; } } };
  const output = await buildArtifactData(db, req(), input({ productId: 'product-1' }), undefined, {
    advise: async args => { prompt = args; return { reply: JSON.stringify(copy) }; },
    businessContext: () => { throw new Error('Private context must not be requested for marketing'); },
    peopleContext: () => { throw new Error('People must not be requested for marketing'); },
  });
  const facts = JSON.parse(prompt.messages[0].content).facts;
  assert.deepEqual(Object.keys(facts).sort(), ['brand', 'product']); assert.equal(facts.product.price, 4500);
  assert(!JSON.stringify(prompt.messages[0].content).includes('cloudinary')); assert.equal(output.data.brand.currency, 'UGX'); assert.equal(output.data.brand.logo, 'https://res.cloudinary.com/demo/image/upload/logo.png'); assert.equal(output.image, undefined);
  assert.match(prompt.systemPrompt, /professional graphic designer/); assert.match(prompt.systemPrompt, /Follow explicit offers/); assert.equal(output.data.warnings.length, 1);
  assert.equal(prompt.jsonMode, true);
});

test('report access is restricted by both permissions and enabled modules', async () => {
  assert.deepEqual(availableReportTypes(req(['canUseBusinessAI'], ['dashboard'])), []);
  assert.deepEqual(availableReportTypes(req(['canViewHRPayroll', 'canExportReport'], ['dashboard', 'hr', 'reports'])), ['hr']);
  assert.deepEqual(availableReportTypes(req(['canViewHRPayroll'], ['dashboard', 'hr', 'reports'])), []);
  assert.deepEqual(availableReportTypes(req(['canViewHRPayroll'], ['dashboard'])), []);
  await assert.rejects(() => buildArtifactData(profile, req(['canUseBusinessAI']), input({ kind: 'report' }), undefined, { advise: () => { throw new Error('Must not reach provider'); } }), error => error.statusCode === 403);
  await assert.rejects(() => buildArtifactData(profile, req(['canUseBusinessAI']), input({ productId: 'product-1' })), error => error.statusCode === 403);
});

test('staff product search is constrained to assigned branch and tenant', async () => {
  let query;
  const db = { userBranch: { findMany: async () => [{ branchId: 'assigned', branch: { id: 'assigned', name: 'North' } }] }, product: { findMany: async args => { query = args; return []; } } };
  await creativeOptions(db, { ...req(['canViewProduct']), user: { ...req(['canViewProduct']).user, role: 'staff' }, query: { search: 'rice', branchId: 'forged' } });
  assert.equal(query.where.branchId, 'assigned'); assert.equal(query.where.tenantId, 'test-tenant'); assert.equal(query.take, 50);
  assert.deepEqual(Object.keys(query.select).sort(), ['baseUnit', 'id', 'name', 'price']);
});

test('sales reports use recorded net sales and gross profit, never values generated by AI', async () => {
  const sales = { current: { netSales: 13000000, salesCount: 2, averageSale: 6500000 }, previous: { netSales: 5000000 }, grossProfit: 1250000, topProducts: [{ product: 'Rice', quantity: 150, baseUnit: 'kg', netSales: 5100000 }] };
  const output = await buildArtifactData(profile, req(), input({ kind: 'report', reportType: 'sales' }), undefined, { businessContext: async () => ({ ...context, sales }), advise: async () => ({ reply: JSON.stringify({ ...copy, metrics: [{ value: 999 }] }) }) });
  assert.equal(output.data.report.metrics[0].value, 13000000); assert.equal(output.data.report.metrics[3].value, 1250000);
  assert.equal(output.data.report.tables[0].rows[0].netSales, 5100000); assert.equal(output.data.report.limitations[0], 'Limited snapshot');
  assert.equal(output.image, undefined);
});

test('customer reports distinguish debts from customer funds and label all-time repayments explicitly', () => {
  const report = reportFromContext({ ...context, customers: [{ name: 'Customer A', balance: 450000, repayments: { total: 200000 } }, { name: 'Customer B', balance: -50000, repayments: { total: 50000 } }] }, 'receivables');
  assert.equal(report.metrics[1].value, 450000); assert.equal(report.metrics[2].value, 50000); assert.equal(report.metrics[3].value, 250000);
  assert.match(report.metrics[3].label, /All-time/); assert.deepEqual(Object.keys(report.tables[0].rows[0]), ['name', 'balance', 'repaid']);
});

test('HR reporting excludes draft and approved payroll from paid/outstanding salary totals', () => {
  const row = (status, netSalary, paidAmount) => ({ status, period: '2026-09', _sum: { grossSalary: 300000, netSalary, paidAmount } });
  const report = reportFromContext({ ...context, hr: { payroll: [row('draft', 200000, 0), row('approved', 200000, 0), row('posted', 200000, 0), row('partially_paid', 200000, 50000), row('paid', 200000, 200000)] } }, 'hr');
  assert.equal(report.metrics[0].value, 250000); assert.equal(report.metrics[1].value, 350000);
});

test('creative visuals never generate generic illustrations and still keep real product photos', async () => {
  let generated = false;
  const db = { ...profile, product: { findFirst: async () => ({ name: 'Pink rice', price: 4500, baseUnit: 'kg', itemType: 'product', image: 'https://res.cloudinary.com/demo/image/upload/rice.png' }) } };
  const output = await buildArtifactData(db, req(), input({ artwork: 'generated', productId: 'product-1', brief: 'Give customers a 10% discount on pink rice this Friday.' }), undefined, {
    advise: async args => { assert.match(args.systemPrompt, /Follow explicit offers/); assert.match(args.messages[0].content, /10% discount/); return { reply: JSON.stringify({ ...copy, caption: 'Enjoy 10% off pink rice this Friday.' }) }; },
    loadImage: async () => ({ image: png, imageMime: 'image/png', imageSource: 'product' }),
    generateImage: async () => { generated = true; throw new Error('Should not generate'); },
  });
  assert.equal(generated, false); assert.equal(output.imageMime, 'image/png'); assert.equal(output.data.imageSource, 'product'); assert.match(output.data.copy.caption, /10% off/);
  assert.equal(output.data.copy.offer, '10% discount');
});

test('creative quality gate revises once and preserves user layout and exact offer', async () => {
  let attempts = 0;
  const output = await buildArtifactData(profile, req(), input({ layout: 'editorial', brief: 'Save 15% on rice this Friday.' }), undefined, {
    advise: async args => {
      attempts++;
      if (attempts === 1) return { reply: JSON.stringify({ ...copy, offer: 'Save 50%' }) };
      assert.match(args.systemPrompt, /Revise before delivery/);
      return { reply: JSON.stringify({ ...copy, offer: 'Save 15%', layout: 'offer' }) };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(output.data.layout, 'editorial');
  assert.equal(output.data.copy.offer, 'Save 15%');
  assert.equal(output.data.version, 2);
});

test('quality failures never save truncated offers or retry indefinitely', async () => {
  let attempts = 0;
  await assert.rejects(() => buildArtifactData(profile, req(), input({}), undefined, {
    advise: async () => { attempts++; return { reply: JSON.stringify({ ...copy, body: 'x'.repeat(321) }) }; },
  }), error => error.code === 'LOW_QUALITY_CREATIVE');
  assert.equal(attempts, 2);
  assert.throws(() => parseCreativeCopy(JSON.stringify({ ...copy, headline: '**Placeholder headline**' })), error => error.code === 'LOW_QUALITY_CREATIVE');
  assert.equal(parseCreativeCopy(JSON.stringify({ ...copy, headline: 'Rice', cta: '' }), { kind: 'report' }).headline, 'Rice');
});

test('generated artwork validates raster format, bounds and redacts provider failures', async () => {
  let sent;
  const output = await generateAdvisorArtwork('Rice bowl', { apiKey: 'test-key', fetchImpl: async (url, options) => { sent = { url, options }; return new Response(JSON.stringify({ artifacts: [{ base64: png.toString('base64') }] })); } });
  assert.equal(output.imageMime, 'image/png'); assert.equal(output.imageSource, 'generated'); assert.equal(JSON.parse(sent.options.body).samples, 1);
  await assert.rejects(() => generateAdvisorArtwork('test', { apiKey: 'test-key', fetchImpl: async () => new Response('secret provider data', { status: 403 }) }), error => !error.message.includes('secret') && error.statusCode === 503);
  await assert.rejects(() => generateAdvisorArtwork('test', { apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ artifacts: [{ base64: Buffer.from('<script>alert(1)</script>').toString('base64') }] })) }), error => error.statusCode === 502);
  await assert.rejects(() => generateAdvisorArtwork('test', { apiKey: 'test-key', fetchImpl: async () => new Response('{}', { headers: { 'content-length': '999999999' } }) }));
});

test('stored product photos cannot request arbitrary hosts, insecure URLs, credentials or redirects', async () => {
  let calls = 0;
  const fetchImpl = async (_, options) => { calls++; assert.equal(options.redirect, 'error'); return new Response(png); };
  for (const url of ['http://res.cloudinary.com/x', 'https://127.0.0.1/x', 'https://res.cloudinary.com.evil.test/x', 'https://secret@res.cloudinary.com/x', 'https://res.cloudinary.com:444/x', 'file:///secret']) await assert.rejects(() => loadAdvisorProductImage(url, { fetchImpl }));
  assert.equal(calls, 0);
  assert.equal((await loadAdvisorProductImage('https://res.cloudinary.com/demo/image/upload/rice.png', { fetchImpl })).imageMime, 'image/png');
  assert.equal(calls, 1);
});

test('creative requests use provider JSON mode while normal replies keep Markdown mode', async () => {
  for (const jsonMode of [true, false]) {
    await requestBusinessAdvice({ apiKey: 'synthetic-key', jsonMode, context: {}, messages: [{ role: 'user', content: 'Synthetic test' }], fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.response_format, jsonMode ? { type: 'json_object' } : undefined);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(copy) }, finish_reason: 'stop' }] }));
    } });
  }
});
