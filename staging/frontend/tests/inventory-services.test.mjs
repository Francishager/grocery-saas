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

test('services have their own catalogue, forms and permissions on desktop, tablet and mobile', { timeout: 120000 }, async () => {
  const adapters = {
    '@/services/featureAccessService': 'export const useFeatureAccess=()=>({hasFeature:()=>false});',
    '@/lib/api': `export const inventoryApi={
      list:async(q,branch,type)=>{window.listTypes.push(type);return window.services.filter(s=>s.product_name.toLowerCase().includes((q||'').toLowerCase()))},
      listWithDailyMovements:async()=>{window.productLoads++;return {products:[],movementProducts:[]}},
      create:async(data)=>{window.saved.push(data);return{id:'created'}},
      update:async(id,data)=>{window.saved.push({...data,id});return{id}},
      delete:async()=>{}
    };export const categoriesApi={
      list:async(type)=>{window.categoryTypes.push(type);return[{id:'services',name:'Professional Services'},...Array.from({length:1100},(_,i)=>({id:'category-'+i,name:'Speciality Category '+i}))]},
      create:async(data)=>{window.createdCategories.push(data);return{category:{id:'custom-category',...data}}}
    };
    export const branchesApi={active:async()=>[{id:'main',name:'Main Branch'}]};`,
    '@/contexts/JWTAuthContext': `export const useJWTAuth=()=>({user:{id:'staff',role:'staff',branchId:'main'},hasPermission:key=>window.permissions.includes(key)});`,
    '@/hooks/use-toast': 'export const useToast=()=>({toast:data=>window.toasts.push(data)});',
    '@/db/hooks': 'export const useOnlineStatus=()=>true;',
    '@/db/hybrid': 'export const getLocalProducts=async()=>[];export const getLocalBranches=async()=>[];',
    '@/db/sync': 'export const queueMutation=async()=>{};',
    '@/db/index': 'export const db={};',
    '@/components/BarcodeScanner': 'export default ()=>null;',
    '@/components/UsageLimitBanner': 'export const UsageLimitBanner=()=>null;',
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,Link}from'react-router-dom';
      import InventoryPage from './src/pages/InventoryPage';
      createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/tenant/inventory/services']}>
      <Link to="/tenant/inventory/products">Product catalogue</Link><Link to="/tenant/inventory/services">Service catalogue</Link>
      <Routes><Route path="/tenant/inventory/:tab" element={<InventoryPage/>}/></Routes></MemoryRouter>);`,
      resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'test-data', setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
    } }],
  });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath())
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const screenshots = path.join(tmpdir(), 'jibusales-services-tests');
  mkdirSync(screenshots, { recursive: true });
  try {
    for (const width of [1440, 1024, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://services.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }));
      const mount = async permissions => {
        await page.goto('http://services.test/');
        await page.evaluate(permissions => {
          window.permissions=permissions;window.saved=[];window.toasts=[];window.listTypes=[];window.categoryTypes=[];window.productLoads=0;window.createdCategories=[];
          window.services=Array.from({length:12},(_,i)=>({id:String(i),product_id:'SVC-'+i,
            product_name:'Professional equipment maintenance and inspection service '+i,unit_price:125000,
            quantity:0,cost_price:0,low_stock_alert:0,itemType:'service',branchId:'main',categoryId:'services',
            description:'Scheduled inspection and maintenance.',estimatedHours:2,duration:'Per visit'}));
        }, permissions);
        const assets = path.join(root, 'dist/assets');
        const css = readdirSync(assets).find(file => file.startsWith('index-') && file.endsWith('.css'));
        await page.addStyleTag({ content: readFileSync(path.join(assets, css), 'utf8') });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.getByRole('heading', { name: 'Services (12)', exact: true }).waitFor();
      };
      await mount(['canViewService','canCreateService','canEditService','canDeleteService']);
      assert.deepEqual(await page.evaluate(()=>[...new Set(window.listTypes)]), ['service']);
      assert.deepEqual(await page.evaluate(()=>[...new Set(window.categoryTypes)]), ['service']);
      assert.equal(await page.evaluate(()=>window.productLoads), 0);
      assert.equal(await page.getByText('Opening Stock', {exact:true}).count(), 0);
      assert.equal(await page.getByRole('button',{name:/Stock In/}).count(),0);
      await page.getByRole('button',{name:'Last page',exact:true}).click();
      assert(await page.getByText('2 / 2',{exact:true}).isVisible());
      await page.getByRole('textbox',{name:'Search services'}).fill('service 11');
      await page.getByRole('heading',{name:'Services (1)',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:/Products Sold|Stock Received|Units Sold/}).count(),0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(screenshots,'services-'+width+'.png'),fullPage:true});
      await page.getByRole('button',{name:'Clear service search'}).click();
      await page.getByRole('button',{name:'Add Service',exact:true}).click();
      await page.getByLabel('Service Name',{exact:true}).fill('Consultation');
      await page.getByLabel('Service Price',{exact:true}).fill('75000');
      await page.getByLabel('Estimated Hours').fill('1.5');
      await page.getByLabel('Duration / Billing Period').fill('Per session');
      await page.getByLabel('Service Description').fill('Business consultation');
      await page.getByRole('combobox',{name:'Category',exact:true}).click();
      await page.getByRole('textbox',{name:'Search categories'}).fill('Speciality Category 1099');
      assert(await page.getByRole('button',{name:'Speciality Category 1099',exact:true}).isVisible());
      await page.getByRole('textbox',{name:'Search categories'}).fill('Professional Services');
      await page.getByRole('button',{name:'Professional Services',exact:true}).click();
      await page.locator('#branchId').selectOption('main');
      assert.equal(await page.getByLabel('Opening Stock').count(),0);
      assert.equal(await page.getByLabel('Current Cost Price').count(),0);
      await page.locator('form').getByRole('button',{name:'Add Service',exact:true}).click();
      await page.waitForFunction(()=>window.saved.length===1);
      const saved=await page.evaluate(()=>window.saved[0]);
      assert.equal(saved.itemType,'service');assert.equal(saved.quantity,0);assert.equal(saved.cost_price,0);
      assert.equal(saved.estimatedHours,1.5);assert.equal(saved.duration,'Per session');
      await page.getByRole('button',{name:'Actions for Professional equipment maintenance and inspection service 0',exact:true}).locator('visible=true').click();
      await page.getByRole('menuitem',{name:'Edit Service'}).click();
      assert.equal(await page.getByLabel('Estimated Hours').inputValue(),'2');
      await page.getByRole('combobox',{name:'Category',exact:true}).click();
      await page.getByRole('textbox',{name:'Search categories'}).fill('Specialist equipment advice');
      await page.getByRole('button',{name:'Create service category: Specialist equipment advice',exact:true}).click();
      assert(await page.getByRole('combobox',{name:'Category',exact:true}).getByText('Specialist equipment advice').isVisible());
      assert.deepEqual(await page.evaluate(()=>window.createdCategories),[{name:'Specialist equipment advice',categoryType:'service'}]);
      await page.getByLabel('Service Description').fill('Updated inspection');
      await page.getByRole('button',{name:'Update Service',exact:true}).click();
      await page.waitForFunction(()=>window.saved.length===2);
      assert.equal(await page.evaluate(()=>window.saved[1].description),'Updated inspection');
      assert.equal(await page.evaluate(()=>window.saved[1].categoryId),'custom-category');
      await page.getByRole('button',{name:'Add Service',exact:true}).click();
      await page.getByRole('link',{name:'Product catalogue'}).click();
      assert.equal(await page.getByLabel('Service Name',{exact:true}).count(),0);
      await page.getByRole('link',{name:'Service catalogue'}).click();
      await page.getByRole('heading',{name:'Services (12)',exact:true}).waitFor();
      await mount(['canViewService','canCreateProduct','canEditProduct','canDeleteProduct']);
      assert.equal(await page.getByRole('button',{name:'Add Service',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:/Actions for/}).count(),0);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Service screenshots: '+screenshots);
  } finally { await browser.close(); }
});
