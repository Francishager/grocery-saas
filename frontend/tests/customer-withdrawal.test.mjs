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

test('withdrawals require customer funds on desktop/mobile and guard excessive and repeated submissions', async () => {
  const adapters = {
    '@/lib/api': `export const apiFetch=(url,options)=>fetch(url,options); export const inventoryApi={};`,
    '@/contexts/JWTAuthContext': `export const useJWTAuth=()=>({user:{id:'staff',role:'owner',cashAccountId:'cash'},hasPermission:()=>true});`,
    '@/db/hooks': `export const useOnlineStatus=()=>true;`,
    '@/db/hybrid': `export const getLocalReceivableCustomers=async()=>[]; export const getLocalReceivableSales=async()=>[]; export const getLocalReceivablePayments=async()=>[]; export const getLocalProducts=async()=>[];`,
    '@/hooks/use-toast': `export const useToast=()=>({toast:(value)=>{window.lastToast=value}});`,
    '@/components/modals/CreateCustomerModal': `export default ()=>null;`,
    '@/components/customer/CustomerTransactionHistoryDialog': `export default ()=>null;`,
    '@/components/UsageLimitBanner': `export const UsageLimitBanner=()=>null;`,
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';
      import ReceivablesPage from './src/pages/receivables/ReceivablesPage';
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ReceivablesPage)));`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'test-data', setup(builder) {
      builder.onResolve({ filter: /^@\// }, (args) => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
    } }],
  });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath())
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const screenshots = path.join(tmpdir(), 'jibusales-withdrawal-tests');
  mkdirSync(screenshots, { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const customers = [50000, 0, -10000, -10000].map((balance, i) => ({ id: `customer-${i}`, name: ['Debtor', 'Settled', 'Funded', 'Blocked'][i],
        balance, creditLimit: 100000000, status: i === 3 ? 'blocked' : 'active', trustScore: 0 }));
      let requests = 0;
      let release;
      let received;
      let rejected = true;
      const firstRequest = new Promise((resolve) => { received = resolve; });
      await page.route('http://withdrawals.test/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
        let data = {};
        if (url.pathname === '/api/receivables/customers') data = { customers };
        if (url.pathname === '/api/expenses/cash-accounts') data = [{ id: 'cash', name: 'Staff Till', type: 'cash', balance: 50000, isActive: true }];
        if (url.pathname === '/api/receivables/withdrawals') {
          requests++;
          assert.equal(route.request().postDataJSON().amount, 10000);
          if (rejected) {
            received();
            await new Promise((resolve) => { release = resolve; });
            return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Insufficient customer funds', code: 'INSUFFICIENT_CUSTOMER_FUNDS', currentBalance: 0, availableFunds: 0 }) });
          }
          customers[2].balance = 0;
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ customer: customers[2] }) });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const mount = async () => {
        await page.goto('http://withdrawals.test/');
        const assets = path.join(root, 'dist/assets');
        if (existsSync(assets)) {
          const css = readdirSync(assets).find((file) => file.startsWith('index-') && file.endsWith('.css'));
          if (css) await page.addStyleTag({ content: readFileSync(path.join(assets, css), 'utf8') });
        }
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.getByRole('button', { name: 'Withdrawal', exact: true }).nth(3).waitFor();
      };
      await mount();
      const buttons = page.getByRole('button', { name: 'Withdrawal', exact: true });
      for (const i of [0, 1, 3]) assert(await buttons.nth(i).isDisabled());
      assert(await buttons.nth(2).isEnabled());
      await buttons.nth(2).click();
      await page.waitForFunction(() => document.getElementById('withdrawalCashAccount')?.value === 'cash');
      const input = page.locator('#withdrawalAmount');
      const submit = page.getByRole('button', { name: 'Record Withdrawal', exact: true });
      assert.equal(await input.getAttribute('max'), '10000');
      await input.fill('10000.01');
      assert(await submit.isDisabled());
      await page.locator('form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(requests, 0);
      await page.waitForFunction(() => window.lastToast?.title === 'Insufficient customer funds');
      await page.screenshot({ path: path.join(screenshots, `withdrawal-${viewport.width}.png`), fullPage: true });
      await input.fill('10000');
      assert(await submit.isEnabled());
      await page.locator('form').evaluate((form) => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await firstRequest;
      assert.equal(requests, 1);
      assert(await page.getByRole('button', { name: 'Recording...', exact: true }).isDisabled());
      release();
      await page.waitForFunction(() => document.getElementById('withdrawalAmount').max === '0');
      assert(await submit.isDisabled());
      assert(await buttons.nth(2).isDisabled());
      rejected = false;
      await mount();
      await buttons.nth(2).click();
      await page.waitForFunction(() => document.getElementById('withdrawalCashAccount')?.value === 'cash');
      await input.fill('10000');
      await submit.click();
      await input.waitFor({ state: 'detached' });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Withdrawal').every((button) => button.disabled));
      assert.equal(requests, 2);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`Withdrawal screenshots: ${screenshots}`);
  } finally {
    await browser.close();
  }
});
