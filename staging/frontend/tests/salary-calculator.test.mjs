import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateUgandaSalaryPreview } from '../../backend/src/utils/ugandaSalaryPreview.js';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('salary calculator modes, options, validation, payroll transfer and responsive layouts', async () => {
  const app = ts.createSourceFile('App.tsx', readFileSync(path.join(root, 'src/App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const accountingRoutes = [];
  function collectRoutes(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === 'Route') {
      const pathAttribute = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(app) === 'path');
      if (pathAttribute?.initializer && ts.isStringLiteral(pathAttribute.initializer) && pathAttribute.initializer.text.startsWith('hr/accounting')) {
        accountingRoutes.push(node.getText(app));
      }
    }
    ts.forEachChild(node, collectRoutes);
  }
  collectRoutes(app);
  assert.equal(accountingRoutes.length, 3);
  const adapters = {
    '@/lib/api': `export const apiFetch=(url,options)=>fetch(url,options);`,
    '@/contexts/JWTAuthContext': `export const useJWTAuth=()=>({user:{id:'staff',role:'owner'},hasPermission:()=>true});`,
    '@/hooks/use-toast': `export const useToast=()=>({toast:()=>{}});`,
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter,Routes,Route} from 'react-router-dom';
      import HRAccountingConfigPage from './src/pages/HRAccountingConfigPage';
      const FeatureGuard = ({children}) => children;
      createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/tenant/hr/accounting/calculator']}><Routes><Route path='/tenant'>${accountingRoutes.join('\n')}</Route></Routes></MemoryRouter>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'test-data', setup(builder) {
      builder.onResolve({ filter: /^@\// }, (args) => adapters[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: adapters[name] }));
    } }],
  });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath())
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync) : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const screenshots = path.join(tmpdir(), 'jibusales-salary-calculator-tests');
  mkdirSync(screenshots, { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      const requests = [];
      let posted;
      const employee = { id: 'employee-1', firstName: 'Test', lastName: 'Employee', employeeNumber: 'TEST00001', basicSalary: 1000000, taxId: null, socialSecurityNumber: null };
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('http://salary.test/**', async (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' });
        requests.push(url.pathname);
        let data = {};
        if (url.pathname === '/api/hr/employees') data = [employee];
        if (url.pathname === '/api/hr/config') data = { config: { isConfigured: true } };
        if (url.pathname === '/api/hr/config/available-accounts') data = { expenseAccounts: [], liabilityAccounts: [], assetAccounts: [], transactionAccounts: [] };
        if (url.pathname === '/api/hr/payroll') {
          data = { payrolls: [], summary: {} };
          if (route.request().method() === 'POST') { posted = route.request().postDataJSON(); data = { success: true }; }
        }
        if (url.pathname === '/api/hr/salary-advances') data = { advances: [], summary: {} };
        if (url.pathname === '/api/hr/payroll/calculate') {
          try { const input = route.request().postDataJSON(); data = calculateUgandaSalaryPreview(input, input.employeeId ? employee : null); }
          catch (error) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: error.message }) }); }
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto('http://salary.test/');
      const assets = path.join(root, 'dist/assets');
      const css = readdirSync(assets).find((file) => file.startsWith('index-') && file.endsWith('.css'));
      await page.addStyleTag({ content: readFileSync(path.join(assets, css), 'utf8') });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByLabel('Year', { exact: true }).waitFor({ timeout: 5000 });
      assert.equal(await page.getByText('Payroll This Period', { exact: true }).count(), 0);
      assert(!requests.includes('/api/hr/payroll'), 'Calculator must not require payroll records');
      assert(!requests.includes('/api/hr/config'), 'Calculator must not require mappings');
      await page.getByLabel('Year', { exact: true }).selectOption('2026');
      await page.getByLabel('Month', { exact: true }).selectOption('9');
      await page.getByLabel('Gross pay (UGX)', { exact: true }).fill('500000');
      const calculate = page.getByRole('button', { name: 'Calculate', exact: true });
      await calculate.click();
      const result = page.getByTestId('salary-result');
      await result.waitFor();
      assert.equal(await result.textContent(), 'UGX 436,750.00');
      await page.getByRole('button', { name: 'Gross Pay', exact: true }).click();
      assert.equal(await result.count(), 0, 'Changing inputs must invalidate old results');
      await page.getByLabel('Desired net pay (UGX)').fill('741750');
      await page.getByLabel('Deduct LST', { exact: true }).check();
      await page.getByLabel('Deduct PAYE before LST', { exact: true }).check();
      await calculate.click();
      await result.waitFor();
      assert.equal(await result.textContent(), 'UGX 1,000,000.00');
      await page.getByRole('button', { name: 'PAYE', exact: true }).click();
      await page.getByLabel('From', { exact: true }).selectOption('6');
      await page.getByLabel('To', { exact: true }).selectOption('7');
      await page.getByLabel('Taxable pay (period total) (UGX)').fill('1000000');
      await calculate.click();
      await result.waitFor();
      assert.equal(await result.textContent(), 'UGX 90,250.00');
      assert.equal(await page.getByRole('table', { name: 'PAYE tax bands' }).count(), 2);
      await page.getByLabel('Show working').uncheck();
      await calculate.click();
      await result.waitFor();
      assert.equal(await page.getByRole('table').count(), 0);
      await page.getByRole('button', { name: 'Clear All' }).click();
      assert.equal(await result.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'PAYE', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Net Pay', exact: true }).click();
      await page.getByLabel('Year', { exact: true }).selectOption('2026');
      await page.getByLabel('Month', { exact: true }).selectOption('9');
      await page.getByLabel('Employee (optional)').selectOption('employee-1');
      await page.getByLabel('Housed by employer').check();
      await page.getByLabel('Value of housing (UGX)').fill('600000');
      await page.getByLabel('Rent to employer (UGX)').fill('50000');
      await page.getByLabel('Taxable non-cash benefits (UGX)').fill('20000');
      await page.getByLabel('Deduct LST', { exact: true }).check();
      await calculate.click();
      await result.waitFor();
      const expected = calculateUgandaSalaryPreview({ period: '2026-09', basicSalary: 1000000, housedByEmployer: true, housingValue: 600000, rentToEmployer: 50000, nonCashBenefits: 20000, deductLST: true }, employee).calculation;
      assert.equal(await result.textContent(), `UGX ${expected.netSalary.toLocaleString('en-UG', { minimumFractionDigits: 2 })}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Page overflow at ${viewport.width}`);
      await page.screenshot({ path: path.join(screenshots, `salary-${viewport.width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Use in Payroll Posting' }).click();
      await page.getByRole('button', { name: 'Create Payroll', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Create Payroll', exact: true }).click();
      await page.waitForFunction(() => document.body.textContent.includes('Payroll record created'));
      assert.equal(posted.paye, expected.paye, 'Transferred PAYE must not be overwritten by profile defaults');
      assert.equal(posted.socialSecurityTax, expected.employeeSocialSecurity);
      assert.equal(posted.otherDeductions, expected.localServiceTax + expected.rentToEmployer);
      assert.equal(posted.basicSalary - posted.paye - posted.socialSecurityTax - posted.otherDeductions, expected.netSalary);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`Calculator screenshots: ${screenshots}`);
  } finally { await browser.close(); }
});
