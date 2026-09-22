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

test('included and extra services require job details and remain usable across device sizes', { timeout: 120000 }, async () => {
  const adapters = {
    '@/lib/api': `export const inventoryApi={list:async()=>window.items}; export const salesApi={list:async()=>[],checkout:async(cart,payment,discount,details)=>{window.saved.push({cart,details});return{sale:{id:'sale-a',receiptNo:'RCP-A',serviceJobCards:[{id:'job-a'}]}}}};
      export const barcodeApi={};export const categoriesApi={list:async()=>[]};export const branchesApi={active:async()=>[{id:'main',name:'Main'}]};
      export const settingsApi={getTaxConfig:async()=>({taxEnabled:false}),getBusinessProfile:async()=>({name:'Workshop'})};
      export const apiFetch=async(url)=>({ok:true,json:async()=>url.includes('service-options')?{technicians:[{id:'tech-a',name:'Technician A',userId:'staff'}]}:{customers:[]}});`,
    '@/contexts/JWTAuthContext': `const user={id:'staff',tenantId:'tenant-a',role:'owner',branchId:'main'};const hasPermission=key=>key!=='canCreateServiceJobCard'||window.jobPermission;export const useJWTAuth=()=>({user,hasPermission});`,
    '@/services/featureAccessService': `const hasFeature=()=>window.jobFeature;export const useFeatureAccess=()=>({hasFeature});`,
    '@/hooks/use-toast': `const toast=value=>window.toasts.push(value);export const useToast=()=>({toast});`,
    '@/db/hooks': 'export const useOnlineStatus=()=>true;',
    '@/db/hybrid': 'export const getLocalProducts=async()=>[];export const getLocalSales=async()=>[];export const getLocalSettings=async()=>({});',
    '@/db/sync': 'export const queueMutation=async()=>{};',
    '@/db/index': 'export const db={};',
    '@/components/BarcodeScanner': 'export default ()=>null;',
    '@/components/ReceiptViewer': 'export default ()=>null;',
    '@/components/customer/CustomerTransactionHistoryDialog': 'export default ()=>null;',
    '@/lib/receiptPrint': 'export const openReceiptPrintWindow=()=>null;export const printReceiptInBrowser=async()=>true;',
    '@/lib/receiptPreview': 'export const buildReceiptPreviewFromData=()=>({});',
  };
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import SalesPage from './src/pages/SalesPage';createRoot(document.getElementById('root')).render(<MemoryRouter><SalesPage/></MemoryRouter>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' }, plugins: [{ name: 'fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
  } }] });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath()) ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const screenshots = path.join(tmpdir(), 'jibusales-sale-service-tests');
  mkdirSync(screenshots, { recursive: true });
  const assets = path.join(root, 'dist/assets');
  const css = readdirSync(assets).find(file => file.startsWith('index-') && file.endsWith('.css'));
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://sale-services.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }));
      const mount = async (enabled = true, permission = true) => {
        await page.goto('http://sale-services.test/');
        await page.evaluate(({enabled,permission}) => {
          window.jobFeature=enabled;window.jobPermission=permission;window.saved=[];window.toasts=[];
          window.items=[{id:'product-a',product_id:'P-A',product_name:'Equipment with professional installation',unit_price:200000,cost_price:100000,quantity:10,categoryId:'cat',itemType:'product',includedServices:[{id:'service-a',name:'Installation',description:'Install and test the purchased equipment'}]},
            {id:'service-b',product_id:'S-B',product_name:'Extra maintenance service',description:'Maintain customer equipment',unit_price:30000,cost_price:0,quantity:0,categoryId:'service-cat',itemType:'service'}];
        }, {enabled,permission});
        await page.addStyleTag({ content: readFileSync(path.join(assets, css), 'utf8') });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.getByText('Equipment with professional installation', {exact:true}).waitFor();
      };
      await mount();
      await page.getByText('Equipment with professional installation', {exact:true}).locator('..').locator('..').locator('..').getByRole('button', {name:'Add to Cart',exact:true}).click();
      await page.getByRole('checkbox', {name:'Job card: Installation (included free)'}).check();
      assert.equal(await page.getByLabel('Technician for Installation', {exact:true}).inputValue(), 'tech-a');
      assert.equal(await page.getByLabel('Job details for Installation', {exact:true}).inputValue(), 'Install and test the purchased equipment');
      await page.getByRole('button', {name:'Complete Sale',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.saved.length),0,'customer name is required');
      await page.getByPlaceholder('Walk-in / Customer name').fill('Alice');
      await page.getByLabel('Job details for Installation', {exact:true}).fill('');
      await page.getByRole('button', {name:'Complete Sale',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.saved.length),0,'job details are required');
      await page.getByLabel('Job details for Installation', {exact:true}).fill('Install equipment in the reception area');
      await page.screenshot({ path: path.join(screenshots, `checkout-${width}.png`), fullPage: true });
      const bounds = await page.getByLabel('Technician for Installation', {exact:true}).boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'technician input must fit viewport');
      await page.getByRole('button', {name:'Complete Sale',exact:true}).click();
      await page.waitForFunction(()=>window.saved.length===1);
      const saved = await page.evaluate(()=>window.saved[0]);
      assert.equal(saved.details.customerName,'Alice');
      assert.equal(saved.cart[0].serviceJobs[0].serviceProductId,'service-a');
      assert.equal(saved.cart[0].selling_price,200000);
      await page.getByText('Extra maintenance service', {exact:true}).locator('..').locator('..').locator('..').getByRole('button', {name:'Add to Cart',exact:true}).click();
      await page.getByRole('checkbox', {name:'Job card: Extra maintenance service'}).check();
      await page.getByRole('button', {name:'Complete Sale',exact:true}).click();
      await page.waitForFunction(()=>window.saved.length===2);
      assert.equal((await page.evaluate(()=>window.saved[1])).cart[0].selling_price,30000);
      await mount(false);
      await page.getByText('Equipment with professional installation', {exact:true}).locator('..').locator('..').locator('..').getByRole('button', {name:'Add to Cart',exact:true}).click();
      assert.equal(await page.getByRole('checkbox', {name:/Job card:/}).count(),0,'business feature disabled');
      await mount(true,false);
      await page.getByText('Equipment with professional installation', {exact:true}).locator('..').locator('..').locator('..').getByRole('button', {name:'Add to Cart',exact:true}).click();
      assert.equal(await page.getByRole('checkbox', {name:/Job card:/}).count(),0,'job-card permission disabled');
      assert.deepEqual(errors,[]);
      await page.close();
    }
  } finally { await browser.close(); }
});
