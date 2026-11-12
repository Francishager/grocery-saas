import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const assets = join(root, 'dist/assets');
const stylesheet = readdirSync(assets).find(name => name.startsWith('index-') && name.endsWith('.css'));
const apiFixture = `
export const apiFetch = async (path, options={}) => {
  window.fixture.requests.push({path,method:options.method||'GET'});
  const url = new URL(path,'http://test');
  let body;
  if (!options.method) {
    const items = window.fixture.items.filter(item=>item.label.toLowerCase().includes((url.searchParams.get('search')||'').toLowerCase()));
    const page = Number(url.searchParams.get('page')||1), limit = Number(url.searchParams.get('limit')||20);
    body = {items:items.slice((page-1)*limit,page*limit),total:items.length};
  } else if (url.pathname.endsWith('/bulk')) {
    const request = JSON.parse(options.body);
    const batch = window.fixture.items.filter(item=>!request.cursor||item.id>request.cursor).slice(0,100);
    const failed = batch.filter(item=>item.id===window.fixture.failId).map(item=>({...item,error:'Record changed; review required.'}));
    const ids = new Set(batch.filter(item=>item.id!==window.fixture.failId).map(item=>item.id));
    window.fixture.items = window.fixture.items.filter(item=>!ids.has(item.id));
    body = {succeeded:ids.size,failed,hasMore:window.fixture.items.some(item=>item.id>batch.at(-1)?.id),cursor:batch.at(-1)?.id,before:request.before||new Date().toISOString()};
  } else {
    const id = url.pathname.split('/')[3];
    window.fixture.items = window.fixture.items.filter(item=>item.id!==id); body = {id};
  }
  return {ok:true,json:async()=>structuredClone(body)};
};`;
const bundle = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Trash from './src/pages/TrashPage'; import {AppFeedback} from './src/lib/appFeedback'; import {Toaster} from './src/components/ui/toaster';
    window.fixture={requests:[],items:[],allowed:!location.search.includes('denied')};
    window.seed=count=>{window.fixture.items=Array.from({length:count},(_,i)=>({id:'item-'+String(i).padStart(4,'0'),label:'Rice stock item '+i,type:'Inventory item',deletedBy:'Business owner',deletedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString()}))};
    window.seed(25);
    createRoot(document.getElementById('root')).render(<React.StrictMode><Trash/><AppFeedback/><Toaster/></React.StrictMode>);
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: join(root, 'tsconfig.json'),
  plugins: [{ name: 'trash-fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
      const resolved = path.startsWith('.') ? resolve(dirname(importer), path).replaceAll('\\', '/') : path;
      if (resolved.endsWith('JWTAuthContext')) return { path: 'auth', namespace: 'fixture' };
      if (resolved.endsWith('lib/api')) return { path: 'api', namespace: 'fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'api' ? apiFixture : "const hasPermission=permission=>window.fixture.allowed&&permission==='canDeleteProduct'; export const useJWTAuth=()=>({hasPermission});", loader: 'js' }));
  } }],
});
const server = createServer((req, res) => {
  if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync(join(assets, stylesheet))); return; }
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/test.js' ? bundle.outputFiles[0].text : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push('Native dialog'); await dialog.dismiss(); });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('button', { name: 'Actions for Rice stock item 0', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 20);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page fits viewport');
    await page.screenshot({ path: join(tmpdir(), `jibusales-trash-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByRole('button', { name: 'Actions for Rice stock item 24', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 5);
    await page.getByRole('textbox', { name: 'Search Trash' }).fill('Rice stock item 12');
    await page.getByRole('button', { name: 'Actions for Rice stock item 12', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByRole('button', { name: 'Actions for Rice stock item 12', exact: true }).click();
    assert.equal(await page.getByRole('menu').count(), 1);
    await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.requests.filter(req => req.method !== 'GET').length), 0);
    await page.getByRole('button', { name: 'Actions for Rice stock item 12', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByText('No matching records.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.requests.filter(req => req.method === 'POST').length), 1);
    await page.getByRole('textbox', { name: 'Search Trash' }).fill('Rice stock item 13');
    await page.getByRole('button', { name: 'Actions for Rice stock item 13', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByText(/Recovery will no longer be available/).waitFor();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByText('No matching records.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.requests.filter(req => req.method === 'DELETE').length), 1);
    await page.getByRole('textbox', { name: 'Search Trash' }).fill('');
    await page.getByRole('button', { name: 'Actions for Rice stock item 0', exact: true }).waitFor();
    await page.evaluate(() => { window.seed(105); window.fixture.failId='item-0001'; });
    await page.getByRole('button', { name: 'Refresh Trash' }).click();
    await page.getByText('105 items', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'All Items' }).click();
    await page.getByRole('menuitem', { name: 'Restore All', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByText('1 item', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Needs Review', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.requests.filter(req => req.path === '/api/trash/bulk').length), 2);
    await page.evaluate(() => { window.fixture.failId = null; });
    await page.getByRole('button', { name: 'All Items' }).click();
    await page.getByRole('menuitem', { name: 'Delete All', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByText('Trash is empty.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await page.goto('http://127.0.0.1:' + server.address().port + '?denied');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.fixture.requests.length), 0);
    assert.equal(await page.getByRole('button', { name: 'All Items' }).count(), 0);
    console.log(`PASS ${width}px: search, pagination, single menu, confirmations, restore/delete, bulk multi-page, partial failures, no-permission denial, no page overflow`);
    await page.close();
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
