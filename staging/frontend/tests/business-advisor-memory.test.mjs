import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('advisor saves, organizes, reopens and safely renders chats on desktop, tablet and phone', { timeout: 360000 }, async () => {
  const adapters = {
    '@/lib/api': `export const apiFetch=(url,options={})=>fetch(url,{...options,headers:{'Content-Type':'application/json'}});`,
    '@/contexts/JWTAuthContext': `export const useJWTAuth=()=>({user:{id:'owner',tenantId:'tenant-a',permissions:['canUseBusinessAI']},hasPermission:()=>true});`,
    '@/db/hooks': `export const useOnlineStatus=()=>true;`,
  };
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Page from './src/pages/BusinessAdvisorPage';createRoot(document.getElementById('root')).render(<BrowserRouter><Page/></BrowserRouter>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' }, plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
  } }] });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath()) ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const screenshots = path.join(tmpdir(), 'jibusales-advisor-memory-tests'); mkdirSync(screenshots, { recursive: true });
  const assets = path.join(root, 'dist/assets');
  const css = readFileSync(path.join(assets, readdirSync(assets).find(name => name.startsWith('index-') && name.endsWith('.css'))), 'utf8');
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const page = await browser.newPage({ viewport }); page.setDefaultTimeout(12000);
      const errors = [], collections = [], chats = [], turns = [], requests = [], artifacts = [];
      let failOnce = true;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost:4179/**', async route => {
        const req = route.request(), url = new URL(req.url()), method = req.method();
        const body = method === 'GET' ? {} : req.postDataJSON() || {};
        const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname === '/img/jibusales_logo.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(path.join(root, 'public/img/jibusales_logo.png')) });
        if (!url.pathname.startsWith('/api/ai/')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' });
        const endpoint = url.pathname.slice('/api/ai'.length);
        requests.push({ endpoint, method, body });
        if (endpoint === '/status') return json({ configured: true });
        if (endpoint === '/creative-options') return json({ products: [{ id: 'rice', name: 'Pink rice for everyday cooking', price: 4500 }], reportTypes: ['sales', 'inventory', 'receivables', 'hr'] });
        if (/\/turns\/[^/]+\/feedback$/.test(endpoint)) {
          const turn = turns.find(row => row.id === endpoint.split('/')[4]); turn.feedback = body.feedback; return json({ feedback: body.feedback });
        }
        if (/^\/conversations\/[^/]+\/artifacts$/.test(endpoint)) {
          const conversationId = endpoint.split('/')[2];
          if (method === 'GET') return json({ artifacts: artifacts.filter(row => row.conversationId === conversationId), hasMore: false });
          const artifact = { id: `visual-${artifacts.length + 1}`, conversationId, title: body.kind === 'report' ? 'Customer balances' : 'Good rice. Great meals.', kind: body.kind, status: 'complete', createdAt: '2026-09-13', imageMime: body.kind === 'report' ? null : 'image/jpeg', data: {
            brand: { name: 'SYNTHETIC FAMILY RICE STORE', currency: 'UGX' }, copy: { headline: 'Good rice. Great meals.', subheading: 'Rice for everyday cooking', body: 'From a quick lunch to a family feast, make something delicious with our pink rice.', cta: 'Visit our store today', caption: 'What is cooking tonight? Pick up rice for your next family meal.', hashtags: ['#Rice', '#FamilyMeals'] },
            product: body.kind === 'report' ? null : { name: 'Pink rice for everyday cooking', price: 4500, unit: 'kg' }, format: body.format, palette: body.palette, platform: body.platform, brief: body.brief, artwork: body.artwork, imageSource: body.kind === 'report' ? null : 'external', warnings: ['Review before sharing. Nothing is published automatically.'],
            externalPhoto: body.kind === 'report' ? undefined : { title: 'Rice photo', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rice.jpg', creator: 'Test photographer', license: 'CC0 1.0' },
            report: body.kind !== 'report' ? null : { title: 'Customer balances', period: { from: '2026-09-01', to: '2026-09-13' }, scope: { branch: 'All permitted branches' }, asOf: '2026-09-13', sources: ['Customer balances and repayments'], limitations: ['A snapshot of 65 synthetic customers. No phone or bank numbers.'], metrics: [{ label: 'Outstanding in snapshot', value: 9876543210.45, format: 'currency' }, { label: 'Customers', value: 65, format: 'number' }], charts: [{ title: 'Outstanding balances', format: 'currency', rows: [{ label: 'Customer with a particularly long business name', value: 9876543210.45 }, { label: 'Customer funds', value: -250000 }] }], tables: [{ title: 'Customer balances and repayments', columns: [{ key: 'name', label: 'Customer' }, { key: 'balance', label: 'Balance', format: 'currency' }, { key: 'repaid', label: 'All-time repayments', format: 'currency' }], rows: Array.from({ length: 65 }, (_, i) => ({ name: `Customer ${i + 1} Family Trading Company With A Long Name`, balance: 9876543210.45 - i, repaid: 450000 + i })) }] },
          } };
          artifacts.push(artifact); return json({ artifact }, 201);
        }
        if (/^\/artifacts\//.test(endpoint)) {
          const index = artifacts.findIndex(row => row.id === endpoint.split('/')[2]);
          if (endpoint.endsWith('/image')) return route.fulfill({ contentType: 'image/jpeg', body: readFileSync(path.join(root, 'public/img/Keep-nventory-accurate.jpg')) });
          if (method === 'PATCH') { Object.assign(artifacts[index].data.copy, body); if (artifacts[index].kind !== 'report') artifacts[index].title = body.headline; return json({ artifact: artifacts[index] }); }
          if (method === 'DELETE') { artifacts.splice(index, 1); return json({ success: true }); }
        }
        if (endpoint === '/collections') {
          if (method === 'POST') { const collection = { ...body, id: `collection-${collections.length + 1}` }; collections.push(collection); return json({ collection }, 201); }
          return json({ collections });
        }
        if (endpoint.startsWith('/collections/')) {
          const index = collections.findIndex(row => row.id === endpoint.split('/').at(-1));
          if (method === 'PATCH') Object.assign(collections[index], body);
          if (method === 'DELETE') { const [removed] = collections.splice(index, 1); chats.forEach(chat => { if (chat.collectionId === removed.id) chat.collectionId = null; }); }
          return json({ success: true });
        }
        if (endpoint === '/conversations') {
          if (method === 'POST') { const conversation = { ...body, id: `chat-${chats.length + 1}`, updatedAt: new Date().toISOString() }; chats.push(conversation); return json({ conversation }, 201); }
          return json({ conversations: chats.filter(chat => (!url.searchParams.get('collectionId') || chat.collectionId === url.searchParams.get('collectionId')) && chat.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase())), hasMore: false });
        }
        if (endpoint.startsWith('/conversations/')) {
          const id = endpoint.split('/').at(-1), index = chats.findIndex(chat => chat.id === id);
          if (method === 'PATCH') { Object.assign(chats[index], body); return json({ success: true }); }
          if (method === 'DELETE') { chats.splice(index, 1); return json({ success: true }); }
          return json({ conversation: chats[index], turns: turns.filter(turn => turn.conversationId === id), hasMore: false });
        }
        if (endpoint === '/chat') {
          let turn = turns.find(turn => turn.requestId === body.requestId);
          if (!turn) { turn = { id: body.requestId, requestId: body.requestId, conversationId: body.conversationId, sequence: turns.length + 1, input: body.message, status: 'pending' }; turns.push(turn); }
          if (body.message === 'Retry this question' && failOnce) { failOnce = false; turn.status = 'failed'; return json({ error: 'Temporary interruption' }, 503); }
          Object.assign(turn, { status: 'complete', output: '## Growth plan\n\n**Eddy** has a balance of **UGX 450,000**.\n\n1. Agree a repayment schedule.\n2. Review the saved project goals.\n\n| Measure | Target |\n| --- | --- |\n| Weekly follow-ups | 5 |\n\n[Source](https://example.org/business)\n\n<script>window.hacked=true</script>\n\n![tracker](https://example.org/tracker.png)\n\n[Bad link](javascript:alert(1))', context: { business: { name: 'Test Business' }, period: { from: '2026-09-01', to: '2026-09-13' }, scope: { branch: 'North' }, sources: ['Customer names, balances and repayments'], limitations: [], memory: { previousConversations: 1 }, research: { status: 'available', sources: [{ title: 'Business reference', url: 'https://example.org/business' }] } } });
          return json({ turn, reply: turn.output, context: turn.context });
        }
        return json({ error: 'Unknown test endpoint' }, 404);
      });
      const mount = async url => { await page.goto(url || 'http://localhost:4179/tenant/ai-advisor'); await page.addStyleTag({ content: css }); await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedText = value; } } }); }); await page.addScriptTag({ content: bundle.outputFiles[0].text }); await page.getByRole('heading', { name: 'AI Advisor', exact: true }).waitFor(); };
      const showSidebar = async () => { if (viewport.width < 768 && !(await page.getByRole('complementary', { name: 'Saved conversations' }).isVisible())) await page.getByRole('button', { name: 'Show conversations' }).click(); };
      await mount(); await showSidebar();
      await page.getByRole('button', { name: 'New folder', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Growth Plans'); await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'Growth Plans', exact: true }).click();
      await page.getByRole('button', { name: 'New project', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('September Growth');
      await page.getByRole('dialog').getByLabel('Project goals & instructions').fill('Retain customers and improve staff training.');
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('button', { name: 'September Growth', exact: true }).click();
      assert.equal(collections[1].parentId, collections[0].id);
      await page.getByRole('textbox', { name: 'Message AI Advisor' }).fill('How can Eddy repay and our business grow?');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByRole('heading', { name: 'Growth plan', exact: true }).waitFor();
      assert.equal(chats[0].collectionId, collections[1].id);
      assert.equal(await page.locator('article[aria-label="Advisor reply"] strong').first().textContent(), 'Eddy');
      assert.equal(await page.locator('article[aria-label="Advisor reply"] table').count(), 1);
      assert.equal(await page.locator('article[aria-label="Advisor reply"] img').count(), 0);
      assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
      assert.equal(await page.evaluate(() => window.hacked), undefined);
      await page.getByRole('button', { name: 'Helpful reply', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Helpful reply"]')?.getAttribute('aria-pressed') === 'true');
      assert.equal(turns[0].feedback, 1);
      await page.getByRole('button', { name: 'Copy reply', exact: true }).click();
      assert.match(await page.evaluate(() => window.copiedText), /Growth plan/);
      assert(!(await page.evaluate(() => window.copiedText)).includes('**Eddy**'));
      const savedUrl = page.url();
      await mount(savedUrl); await page.getByRole('heading', { name: 'Growth plan', exact: true }).waitFor();
      assert.equal(turns.length, 1, 'Reloading must not resend the question');
      assert.equal(await page.getByRole('button', { name: 'Helpful reply', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Unhelpful reply', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Unhelpful reply"]')?.getAttribute('aria-pressed') === 'true');
      assert.equal(turns[0].feedback, -1);
      await page.getByRole('button', { name: 'Unhelpful reply', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Unhelpful reply"]')?.getAttribute('aria-pressed') === 'false');
      assert.equal(turns[0].feedback, null);
      await page.getByRole('button', { name: 'Copy conversation', exact: true }).click();
      await page.waitForFunction(() => window.copiedText?.includes('You: How can Eddy'));
      await page.getByRole('button', { name: 'Edit conversation', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Customer growth plan');
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('heading', { name: 'Customer growth plan', exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'Message AI Advisor' }).fill('Retry this question'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByRole('alert').getByText('Temporary interruption', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Retry message', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[role="log"]')?.getAttribute('aria-busy') === 'false');
      assert.equal(turns.length, 2); assert.equal(turns[1].status, 'complete');
      const retried = requests.filter(req => req.endpoint === '/chat' && req.body.message === 'Retry this question');
      assert.equal(retried.length, 2); assert.equal(retried[0].body.requestId, retried[1].body.requestId);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${viewport.width}`);
      await page.screenshot({ path: path.join(screenshots, `advisor-${viewport.width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Create visual', exact: true }).click();
      await page.getByRole('button', { name: 'New visual', exact: true }).click();
      await page.getByLabel('Creative brief', { exact: true }).fill('Create a warm and natural rice promotion for families.');
      await page.getByLabel('Product or service', { exact: true }).selectOption('rice');
      await page.getByLabel('Visual size', { exact: true }).selectOption(viewport.width < 768 ? 'square' : 'portrait');
      await page.getByLabel('Artwork', { exact: true }).selectOption('external');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await page.locator('[role="dialog"] canvas').waitFor();
      assert.equal(artifacts.length, 1);
      assert.equal(artifacts[0].data.artwork, 'external');
      assert.equal(await page.getByRole('link', { name: 'Photo source', exact: true }).getAttribute('href'), 'https://commons.wikimedia.org/wiki/File:Rice.jpg');
      assert(await page.locator('[role="dialog"] canvas').evaluate(canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; const colors = new Set();
        for (let i = 0; i < data.length; i += 400) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        return colors.size > 50;
      }), 'Artwork and lettering must render, not a blank canvas');
      await page.getByRole('button', { name: 'Edit wording', exact: true }).click();
      await page.getByLabel('Headline', { exact: true }).fill('Rice for real family meals');
      await page.getByRole('button', { name: 'Save wording', exact: true }).click();
      await page.getByRole('heading', { name: 'Rice for real family meals', exact: true }).waitFor();
      await page.locator('[role="dialog"] canvas').waitFor();
      await page.getByRole('button', { name: 'Copy caption', exact: true }).click();
      assert.match(await page.evaluate(() => window.copiedText), /#FamilyMeals/);
      assert(await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1), `Visual studio overflow at ${viewport.width}`);
      await page.screenshot({ path: path.join(screenshots, `visual-${viewport.width}.png`), fullPage: true });
      if (viewport.width === 1440) {
        const png = page.waitForEvent('download'); await page.getByRole('button', { name: 'PNG', exact: true }).click(); const download = await png; await download.saveAs(path.join(screenshots, 'flyer.png'));
        assert.deepEqual([...readFileSync(path.join(screenshots, 'flyer.png')).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        const pdf = page.waitForEvent('download'); await page.getByRole('button', { name: 'PDF', exact: true }).click(); await (await pdf).saveAs(path.join(screenshots, 'flyer.pdf'));
        assert.equal(readFileSync(path.join(screenshots, 'flyer.pdf')).subarray(0, 4).toString(), '%PDF');
      }
      await page.getByRole('button', { name: 'Saved visuals', exact: true }).click();
      await page.getByRole('button', { name: /Rice for real family meals/ }).click();
      await page.locator('[role="dialog"] canvas').waitFor();
      await page.getByRole('button', { name: 'Saved visuals', exact: true }).click();
      await page.getByRole('button', { name: 'New visual', exact: true }).click();
      await page.getByRole('button', { name: 'Report', exact: true }).click();
      await page.getByLabel('Report type', { exact: true }).selectOption('receivables');
      await page.getByLabel('Creative brief', { exact: true }).fill('Review customer balances with a practical repayment follow-up plan.');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await page.locator('[role="dialog"] canvas').waitFor();
      assert.equal(artifacts.length, 2);
      await page.screenshot({ path: path.join(screenshots, `report-${viewport.width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      assert.match(await page.locator('[role="dialog"] canvas').getAttribute('aria-label'), /page 2/);
      await page.getByText('Report data tables', { exact: true }).click();
      assert.equal(await page.getByRole('dialog').locator('tbody tr').count(), 65);
      await page.getByText('Report data tables', { exact: true }).click();
      assert(await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1), `Report overflow at ${viewport.width}`);
      if (viewport.width === 1440) {
        const pdf = page.waitForEvent('download', { timeout: 60000 }); await page.getByRole('button', { name: 'PDF', exact: true }).click(); await (await pdf).saveAs(path.join(screenshots, 'customer-report.pdf'));
        const data = readFileSync(path.join(screenshots, 'customer-report.pdf')).toString('latin1');
        assert((data.match(/\/Type \/Page\b/g) || []).length >= 6, 'All 65 long customer rows and sources must paginate');
      }
      await page.getByRole('button', { name: 'Delete visual', exact: true }).click();
      await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
      await page.getByRole('heading', { name: 'Visual studio', exact: true }).waitFor(); assert.equal(artifacts.length, 1);
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await mount(savedUrl); await page.getByRole('button', { name: 'Create visual', exact: true }).click();
      await page.getByRole('button', { name: /Rice for real family meals/ }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Delete conversation', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('heading', { name: 'New conversation', exact: true }).waitFor(); assert.equal(chats.length, 0);
      assert.deepEqual(errors, []); await page.close();
    }
    console.log(`Advisor screenshots: ${screenshots}`);
  } finally { await browser.close(); }
});
