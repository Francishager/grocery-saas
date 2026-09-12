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
const screenshots = path.join(tmpdir(), 'jibusales-customers-hours-tests');
const customers = Array.from({ length: 27 }, (_, i) => ({ id: `customer-${i + 1}`, name: `Customer ${String(i + 1).padStart(2, '0')}`,
  phone: '0700000000', email: `customer${i + 1}@example.test`, balance: 0, creditLimit: 100000, status: 'active', trustScore: 0 }));
const adapters = {
  '@/lib/api': `const json=async(url,options)=>{const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed');return data};
    export const apiFetch=(url,options)=>fetch(url,options), inventoryApi={};
    export const settingsApi={get:()=>json('/api/settings'),update:body=>json('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})};
    export const branchesApi={active:()=>json('/api/branches')};
    export const staffApi={list:()=>json('/api/staff'),getPermissionsSchema:()=>json('/api/staff/permissions/schema'),getPermissions:id=>json('/api/staff/'+id+'/permissions'),
      update:(id,body)=>json('/api/staff/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})};`,
  '@/contexts/JWTAuthContext': `export const useJWTAuth=()=>({user:{id:'owner',tenantId:'business-a',role:window.readOnly?'attendant':'owner'},hasPermission:()=>!window.readOnly});`,
  '@/db/hooks': `export const useOnlineStatus=()=>!window.offline;`,
  '@/db/hybrid': `export const getLocalReceivableCustomers=async()=>window.savedCustomers||[]; export const getLocalReceivableSales=async()=>[];
    export const getLocalReceivablePayments=async()=>[];export const getLocalProducts=async()=>[];export const getLocalSettings=async()=>({});
    export const getLocalStaff=async()=>[]; export const getLocalBranches=async()=>[];`,
  '@/db/index': `export const db={};`,
  '@/hooks/use-toast': `export const useToast=()=>({toast:value=>{window.lastToast=value}});`,
  '@/components/modals/CreateCustomerModal': `export default ()=>null;`,
  '@/components/customer/CustomerTransactionHistoryDialog': `export default ()=>null;`,
  '@/components/UsageLimitBanner': `export const UsageLimitBanner=()=>null;`,
};

test('customer pagination and staff working-hours controls work on desktop and mobile', { timeout: 180000 }, async () => {
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
    import Customers from './src/pages/receivables/ReceivablesPage';import Settings from './src/pages/BusinessSettingsPage';import Roles from './src/pages/RolesPermissionsPage';
    const Component=location.pathname==='/settings'?Settings:location.pathname==='/roles'?Roles:Customers;
    createRoot(document.getElementById('root')).render(<MemoryRouter><Component/></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'test-adapters', setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
    } }],
  });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath())
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  mkdirSync(screenshots, { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      const queries = [];
      const staffSaves = [];
      const settingsSaves = [];
      let business = { id: 'business-a', name: 'Test Business', timezone: 'Africa/Kampala', currency: 'UGX', workingHours: null };
      let staff = { id: 'staff-a', name: 'Test Staff', email: 'staff@example.test', role: 'attendant', isActive: true, workingHours: null };
      let failCustomers = false;
      let slowResponse;
      let releaseSlow;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://hours.test/**', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' });
        let data = {};
        if (url.pathname === '/api/receivables/customers') {
          queries.push(Object.fromEntries(url.searchParams));
          if (failCustomers) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Customer service unavailable' }) });
          const term = url.searchParams.get('search') || '';
          const filtered = customers.filter(customer => customer.name.toLowerCase().includes(term.toLowerCase()));
          const current = Number(url.searchParams.get('page'));
          const limit = Number(url.searchParams.get('limit'));
          data = { customers: filtered.slice((current - 1) * limit, current * limit), pagination: { total: filtered.length, page: current, limit, pages: Math.ceil(filtered.length / limit) } };
          if (term === 'Customer 0') { slowResponse?.(); await new Promise(resolve => { releaseSlow = resolve; }); }
        }
        if (url.pathname === '/api/receivables/summary') data = { totalCustomers: customers.length };
        if (url.pathname === '/api/settings/business-profile') data = { timezone: business.timezone };
        if (url.pathname === '/api/settings') {
          if (route.request().method() === 'PUT') {
            const body = route.request().postDataJSON(); settingsSaves.push(body); business = { ...business, ...body }; data = { tenant: business };
          } else data = business;
        }
        if (url.pathname === '/api/staff') data = [staff];
        if (url.pathname === '/api/staff/staff-a') {
          const body = route.request().postDataJSON(); staffSaves.push(body); staff = { ...staff, ...body }; data = { staff };
        }
        if (url.pathname === '/api/staff/permissions/schema') data = { keys: ['canViewReceivable'], defaults: {}, categories: [], permissions: [] };
        if (url.pathname.endsWith('/permissions')) data = { canViewReceivable: true };
        if (['/api/branches', '/api/expenses/cash-accounts'].includes(url.pathname)) data = [];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const mount = async (pathname, globals = {}) => {
        await page.goto('http://hours.test' + pathname);
        await page.evaluate(globals => Object.assign(window, globals), globals);
        const assets = path.join(root, 'dist/assets');
        const css = readdirSync(assets).find(file => file.startsWith('index-') && file.endsWith('.css'));
        await page.addStyleTag({ content: readFileSync(path.join(assets, css), 'utf8') });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
      };
      const customerButtons = () => page.getByRole('button', { name: /^Customer \d{2}$/ });
      const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${viewport.width}px on ${page.url()}`);
      await mount('/customers');
      await page.getByRole('button', { name: 'Customer 01', exact: true }).waitFor();
      assert.equal(await customerButtons().count(), 10);
      assert(await page.getByText('27 customers', { exact: true }).isVisible());
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await page.getByRole('button', { name: 'Customer 11', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      await page.getByRole('button', { name: 'Customer 27', exact: true }).waitFor();
      assert.equal(await customerButtons().count(), 7);
      assert(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Previous page', exact: true }).click();
      await page.getByRole('button', { name: 'Customer 11', exact: true }).waitFor();
      await page.getByRole('button', { name: 'First page', exact: true }).click();
      await page.getByRole('button', { name: 'Customer 01', exact: true }).waitFor();
      await page.getByLabel('Customers per page').selectOption('25');
      await page.getByRole('button', { name: 'Customer 25', exact: true }).waitFor();
      assert.equal(await customerButtons().count(), 25);
      await page.getByPlaceholder('Search...', { exact: true }).fill('Customer 27');
      await page.getByRole('button', { name: 'Customer 27', exact: true }).waitFor();
      assert.equal(await customerButtons().count(), 1);
      assert.equal(queries.at(-1).page, '1');
      const slowRequested = new Promise(resolve => { slowResponse = resolve; });
      await page.getByPlaceholder('Search...', { exact: true }).fill('Customer 0');
      await slowRequested;
      await page.getByPlaceholder('Search...', { exact: true }).fill('Customer 26');
      await page.getByRole('button', { name: 'Customer 26', exact: true }).waitFor();
      const delayedFinished = page.waitForResponse(response => response.url().includes('search=Customer+0'));
      releaseSlow();
      await delayedFinished;
      assert.equal(await customerButtons().count(), 1);
      assert(await page.getByRole('button', { name: 'Customer 26', exact: true }).isVisible());
      await page.screenshot({ path: path.join(screenshots, `customers-${viewport.width}.png`), fullPage: true });
      await noOverflow();
      failCustomers = true;
      await page.getByPlaceholder('Search...', { exact: true }).fill('Customer 25');
      await page.getByText('No customers found.', { exact: true }).waitFor();
      assert.equal(await customerButtons().count(), 0);
      await page.waitForFunction(() => window.lastToast?.description === 'Customer service unavailable');
      failCustomers = false;
      await mount('/customers', { offline: true, savedCustomers: customers });
      await page.getByRole('button', { name: 'Customer 01', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Last page', exact: true }).click();
      await page.getByRole('button', { name: 'Customer 27', exact: true }).waitFor();
      assert(await page.getByText('27 customers saved on this device', { exact: true }).isVisible());

      await mount('/settings');
      await page.getByLabel('Restrict staff access to working hours', { exact: true }).check();
      await page.getByLabel('Monday opening', { exact: true }).fill('07:30');
      await page.getByLabel('Monday closing', { exact: true }).fill('19:00');
      await page.getByLabel('Friday 24 hours', { exact: true }).check();
      await page.getByLabel('Saturday', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      await page.waitForFunction(() => window.lastToast?.title === 'Settings saved');
      assert.equal(settingsSaves.at(-1).workingHours.enabled, true);
      assert.equal(settingsSaves.at(-1).workingHours.days[1].start, '07:30');
      assert.equal(settingsSaves.at(-1).workingHours.days[5].allDay, true);
      assert.equal(settingsSaves.at(-1).workingHours.days[6].enabled, false);
      await page.screenshot({ path: path.join(screenshots, `business-hours-${viewport.width}.png`), fullPage: true });
      await noOverflow();
      await mount('/settings', { readOnly: true });
      await page.getByLabel('Restrict staff access to working hours', { exact: true }).waitFor();
      assert(await page.getByLabel('Restrict staff access to working hours', { exact: true }).isDisabled());

      await mount('/roles');
      await page.getByText('Test Staff', { exact: true }).waitFor();
      await page.locator('button').filter({ has: page.locator('svg.lucide-ellipsis-vertical') }).click();
      await page.getByRole('button', { name: 'Permissions', exact: true }).click();
      await page.getByLabel('Use custom working hours', { exact: true }).check();
      await page.getByLabel('Monday opening', { exact: true }).fill('20:00');
      await page.getByLabel('Monday closing', { exact: true }).fill('04:00');
      assert(await page.getByText('Closes next day', { exact: true }).isVisible());
      await page.getByRole('button', { name: 'Save Working Hours', exact: true }).click();
      await page.waitForFunction(() => window.lastToast?.title === 'Working hours saved');
      assert.equal(staffSaves.at(-1).workingHours.days[1].start, '20:00');
      assert.equal(staffSaves.at(-1).workingHours.days[1].end, '04:00');
      await page.screenshot({ path: path.join(screenshots, `staff-hours-${viewport.width}.png`), fullPage: true });
      await noOverflow();
      await page.getByLabel('Use custom working hours', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Save Working Hours', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('button') && ![...document.querySelectorAll('button')].some(button => button.textContent === 'Saving...'));
      assert.equal(staffSaves.at(-1).workingHours, null);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`Customer/working-hours screenshots: ${screenshots}`);
  } finally { await browser.close(); }
});
