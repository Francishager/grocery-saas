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
const targetName = 'Pink Rice Premium Long Grain Family Pack with an Extra Long Product Name';
const products = Array.from({ length: 22 }, (_, index) => ({ id: `product-${index + 1}`,
  product_id: `SKU-${String(index + 1).padStart(3, '0')}`, product_name: index === 21 ? targetName : `Product ${index + 1}`,
  itemType: 'product', quantity: 50, low_stock_alert: 5, cost_price: 3200, unit_price: 5400,
  categoryId: 'rice', categoryName: 'Groceries', branchId: index === 21 ? 'north' : 'south', isUncategorized: false,
}));

test('inventory searches stay visible across pagination, filters, concurrent requests and screen sizes', { timeout: 180000 }, async () => {
  const adapters = {
    '@/lib/api': `export const inventoryApi={listWithDailyMovements:async(search,branchId,itemType,dates)=>{
      const res=await fetch('/api/inventory?'+new URLSearchParams({search:search||'',branchId:branchId||'',itemType:itemType||'',...dates}));
      const data=await res.json();if(!res.ok)throw new Error(data.error);return data}};
      export const categoriesApi={list:async()=>[{id:'rice',name:'Groceries'}]};
      export const branchesApi={active:async()=>[{id:'north',name:'North'},{id:'south',name:'South'}]};`,
    '@/contexts/JWTAuthContext': `export const useJWTAuth=()=>({user:{id:'owner',role:'owner'},hasPermission:()=>true});`,
    '@/hooks/use-toast': `export const useToast=()=>({toast:()=>{}});`,
    '@/db/hooks': `export const useOnlineStatus=()=>!window.offline;`,
    '@/db/hybrid': `export const getLocalProducts=async(q)=>window.savedProducts.filter(item=>item.product_name.toLowerCase().includes((q||'').toLowerCase()));export const getLocalBranches=async()=>[];`,
    '@/db/sync': `export const queueMutation=async()=>{};`,
    '@/db/index': `export const db={};`,
    '@/components/BarcodeScanner': `export default ()=>null;`,
    '@/components/UsageLimitBanner': `export const UsageLimitBanner=()=>null;`,
  };
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';
    import InventoryPage from './src/pages/InventoryPage';
    createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/tenant/inventory/products']}><Routes><Route path='/tenant/inventory/:tab' element={<InventoryPage/>}/></Routes></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'test-data', setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
    } }],
  });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath())
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const screenshots = path.join(tmpdir(), 'jibusales-inventory-search-tests');
  mkdirSync(screenshots, { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(10000);
      const errors = [];
      const queries = [];
      let oldRequested, releaseOld, failSearch = true;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://inventory.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname !== '/api/inventory') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' });
        const query = Object.fromEntries(url.searchParams);
        queries.push(query);
        assert.equal(query.itemType, 'product');
        if (query.search === 'old') { oldRequested(); await new Promise(resolve => { releaseOld = resolve; }); }
        if (query.search === 'failure' && failSearch) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Search temporarily unavailable' }) });
        const matches = query.search === 'old' ? [products[0]] : query.search === 'failure' ? [products[21]] : products.filter(item =>
          `${item.product_name} ${item.product_id}`.toLowerCase().includes(query.search.toLowerCase()) && (!query.branchId || item.branchId === query.branchId));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ products: matches, movementSummary: {} }) });
      });
      const mount = async (offline = false) => {
        await page.goto('http://inventory.test/');
        await page.evaluate(({ offline, products }) => { window.offline = offline; window.savedProducts = products; }, { offline, products });
        const assets = path.join(root, 'dist/assets');
        const css = readdirSync(assets).find(file => file.startsWith('index-') && file.endsWith('.css'));
        await page.addStyleTag({ content: readFileSync(path.join(assets, css), 'utf8') });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.getByRole('heading', { name: 'Products (22)', exact: true }).waitFor();
        await page.waitForFunction(() => document.getElementById('inventory-results')?.getAttribute('aria-busy') === 'false');
      };
      const waitTarget = async () => {
        await page.getByRole('heading', { name: 'Products (1)', exact: true }).waitFor();
        await page.waitForFunction(() => document.getElementById('inventory-results')?.getAttribute('aria-busy') === 'false');
        assert.equal(await page.getByText(targetName, { exact: true }).locator('visible=true').count(), 1);
        assert(await page.getByText('1 / 1', { exact: true }).isVisible());
      };
      await mount();
      const input = page.getByRole('textbox', { name: 'Search products', exact: true });
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      assert(await page.getByText('3 / 3', { exact: true }).isVisible());
      await input.fill('Rice');
      await waitTarget();
      const visibleTarget = page.getByText(targetName, { exact: true }).locator('visible=true');
      const resultBox = await page.locator('#inventory-results').boundingBox();
      const searchBox = await page.getByRole('search', { name: 'Product search' }).boundingBox();
      const overview = await page.getByRole('button', { name: /^Products Sold/ }).boundingBox();
      assert(resultBox.y >= searchBox.y + searchBox.height, 'Search controls must not cover results');
      assert(resultBox.y - (searchBox.y + searchBox.height) < 50, 'Search results must follow the search form');
      assert(overview.y >= resultBox.y + resultBox.height, 'Summary cards must not push search results away from the field');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal page overflow at ${viewport.width}px`);
      assert(await visibleTarget.evaluate(element => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1), 'The full matching product name must be readable');
      await page.screenshot({ path: path.join(screenshots, `search-${viewport.width}.png`), fullPage: true });

      await page.getByRole('button', { name: 'Clear product search' }).click();
      await page.getByRole('heading', { name: 'Products (22)', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      await page.getByLabel('Filter by branch').selectOption('north');
      await waitTarget();
      await page.getByRole('button', { name: 'Show Uncategorized', exact: true }).click();
      await page.getByText('No items found', { exact: true }).waitFor();
      assert(await page.getByRole('heading', { name: 'Products (0)', exact: true }).isVisible());
      await page.getByRole('button', { name: /Uncategorized Only/ }).click();
      await page.getByLabel('Filter by branch').selectOption('');
      await page.getByRole('heading', { name: 'Products (22)', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      await input.fill('SKU-022');
      await input.press('Enter');
      await waitTarget();
      assert.equal(queries.at(-1).search, 'SKU-022');

      const pending = new Promise(resolve => { oldRequested = resolve; });
      await input.fill('old');
      await pending;
      assert(await visibleTarget.isVisible(), 'Existing results remain readable while a search is loading');
      await input.fill('Rice');
      await waitTarget();
      const finishedOld = page.waitForResponse(response => new URL(response.url()).searchParams.get('search') === 'old');
      releaseOld();
      const oldResponse = await finishedOld;
      await oldResponse.finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert(await visibleTarget.isVisible(), 'An older response must not replace the latest results');
      assert(await page.getByRole('heading', { name: 'Products (1)', exact: true }).isVisible());

      await input.fill('failure');
      await page.getByRole('alert').getByText('Search temporarily unavailable', { exact: true }).waitFor();
      assert.equal(await page.getByText('No items found', { exact: true }).count(), 0, 'A failed request must not be shown as no matches');
      failSearch = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await waitTarget();
      await input.fill('not-in-catalogue');
      await page.getByText('No items found', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Clear product search' }).click();
      await page.getByRole('heading', { name: 'Products (22)', exact: true }).waitFor();

      await mount(true);
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      await input.fill('Rice');
      await waitTarget();
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`Inventory search screenshots: ${screenshots}`);
  } finally { await browser.close(); }
});
