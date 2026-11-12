import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('dashboard retains verified balances when charts fail and refreshes after reconnect and account changes', async () => {
  const bundle = await build({
    stdin: { contents: `import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {useDashboardData} from './src/hooks/useDashboardData';
      function App() {
        const [online,setOnline]=useState(true); const [scope,setScope]=useState('tenant-a');
        window.setOnline=setOnline; window.setScope=setScope;
        const data=useDashboardData(true,online,scope); window.refreshDashboard=data.refresh;
        return React.createElement('pre',{id:'state'},JSON.stringify(data));
      }
      createRoot(document.getElementById('root')).render(React.createElement(App));`,
      resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    alias: { '@': path.join(root, 'src') }, define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'dashboard-test-adapters', setup(build) {
      build.onResolve({ filter: /(?:apiConfig|db\/hybrid|db\/sync)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: name }) => {
        if (name.endsWith('apiConfig')) return { contents: `export const getApiBaseUrl=()=> 'http://dashboard.test';` };
        if (name.endsWith('hybrid')) return { contents: `export const getLocalDashboardKpis=async()=>({receivablesOutstanding:null,receivablesCount:null});
          export const getLocalDashboardCharts=async()=>({salesChart:null,profitLoss:null,topProducts:[],paymentMethods:[]});` };
        return { contents: `export const getSyncStatus=()=> 'idle'; export const onSyncStatusChange=()=>()=>{};` };
      });
    } }],
  });
  const fallbackBrowser = process.platform === 'win32' && !existsSync(chromium.executablePath())
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
    : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallbackBrowser ? { executablePath: fallbackBrowser } : {}) });
  try {
    const page = await browser.newPage();
    let balance = 21000;
    let failKpis = false;
    let kpiRequests = 0;
    await page.route('http://dashboard.test/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      if (url.pathname.endsWith('/kpis')) {
        kpiRequests++;
        return route.fulfill({ status: failKpis ? 500 : 200, contentType: 'application/json',
          body: JSON.stringify(failKpis ? { error: 'Unavailable' } : { receivablesOutstanding: balance, receivablesCount: 1 }) });
      }
      if (url.pathname.endsWith('/sales-chart')) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    });
    await page.goto('http://dashboard.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const snapshot = () => page.locator('#state').textContent().then(JSON.parse);
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).kpis?.receivablesOutstanding === 21000);
    assert.equal((await snapshot()).isOfflineData, false);
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).error?.includes('charts'));

    failKpis = true;
    await page.evaluate(() => window.refreshDashboard());
    assert.equal((await snapshot()).kpis.receivablesOutstanding, 21000);
    assert.match((await snapshot()).error, /totals/);

    await page.evaluate(() => window.setOnline(false));
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).isOfflineData);
    assert.equal((await snapshot()).kpis.receivablesOutstanding, null);

    failKpis = false;
    balance = 19000;
    await page.evaluate(() => window.setOnline(true));
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).kpis?.receivablesOutstanding === 19000);
    assert.equal((await snapshot()).isOfflineData, false);

    balance = 18000;
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).kpis?.receivablesOutstanding === 18000);

    failKpis = true;
    await page.evaluate(() => window.setScope('tenant-b'));
    await page.waitForFunction(() => !JSON.parse(document.getElementById('state').textContent).loading);
    assert.equal((await snapshot()).kpis, null);
    assert.ok(kpiRequests >= 5);
  } finally {
    await browser.close();
  }
});
