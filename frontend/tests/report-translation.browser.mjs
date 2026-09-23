import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const assets = join(root, 'dist', 'assets');
const stylesheet = existsSync(assets) ? readdirSync(assets).find(name => name.startsWith('index-') && name.endsWith('.css')) : null;
const bundle = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import Report from './src/components/DailyBusinessReport';
    import {translateDocument} from './src/lib/i18n';
    const root = createRoot(document.getElementById('root'));
    let stop = () => {};
    window.renderReport = (data) => flushSync(() => root.render(<Report data={data} />));
    window.setReportLanguage = (language) => { stop(); stop = translateDocument(language); };
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  plugins: [{ name: 'report-history-isolation', setup(builder) {
    builder.onResolve({ filter: /CustomerTransactionHistoryDialog$/ }, ({ path }) => ({ path, namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default function History() { return null }' }));
  } }],
});
const server = createServer((req, res) => {
  if (req.url === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(stylesheet ? readFileSync(join(assets, stylesheet)) : '');
    return;
  }
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/test.js' ? bundle.outputFiles[0].text : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.renderReport === 'function');
  const data = amount => ({
    header: { date: '2026-09-23', branch: 'Test branch', status: 'Open' },
    summary: { totalSales: amount, cashSales: amount, expenses: 0 },
    cashMovement: { openingCash: 0, cashAtHand: amount, netCashMovement: amount },
    profitability: { revenue: amount, cogs: 0, grossProfit: amount, netProfit: amount },
    cashLedger: [{ id: 'cash-sale', kind: 'cash-movement', amount, debit: amount, credit: 0, account: 'Test till' }],
    transactions: [{ id: 'sale', kind: 'sale', paymentMethod: 'cash', amount, debit: amount, cashAmount: amount, cogs: 0 }],
  });
  const render = value => page.evaluate(value => window.renderReport(value), data(value));
  const language = value => page.evaluate(value => window.setReportLanguage(value), value);
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const values = () => page.locator('p[aria-label]').evaluateAll(elements => elements.map(element => ({ expected: element.getAttribute('aria-label').split(': ').slice(1).join(': '), shown: element.textContent })));
  const check = async expected => {
    await settle();
    const amounts = await values();
    assert.ok(amounts.length >= 15, 'Report amount elements must be rendered');
    for (const value of amounts) assert.equal(value.shown, value.expected, 'Visible and accessible amounts must agree');
    for (const label of ['Cash at Hand', 'Net Cash Movement', 'Cash Sales', 'Gross Profit', 'Net Profit']) {
      const shown = await page.locator(`p[aria-label^="${label}:"]`).first().textContent();
      assert.equal(Number(shown.replace(/[^0-9.-]/g, '')), expected, label);
    }
  };
  await render(0);
  await language('en');
  await render(35035000);
  await check(35035000);
  await language('sw');
  await check(35035000);
  await language('sw');
  await check(35035000);
  console.log('PASS: loading zero updates to the report amount and survives language changes');

  for (const code of ['lg', 'nyn', 'rw', 'nyo', 'ach', 'en']) {
    await render(1275000);
    await language(code);
    await check(1275000);
    await render(-25000);
    await check(-25000);
    await render(0);
    await check(0);
  }

  await render(1275000);
  await language('en');
  await check(1275000);
  await page.locator('button').filter({ has: page.locator('p[aria-label^="Cash at Hand:"]') }).first().click();
  await settle();
  const ledgerBalance = await page.locator('[role="dialog"] tbody tr').evaluateAll(rows => rows.reduce((total, row) => {
    const cells = row.querySelectorAll('td');
    return total + Number(cells[5].textContent.replace(/[^0-9.-]/g, '')) - Number(cells[6].textContent.replace(/[^0-9.-]/g, ''));
  }, 0));
  assert.equal(ledgerBalance, 1275000);
  await check(1275000);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  console.log('PASS: Cash at Hand agrees with its actual rendered debit/credit drill-down');

  await page.evaluate(() => {
    const area = document.createElement('section');
    area.id = 'translation-probes';
    area.innerHTML = '<span id="dynamic-label">Cash at Hand</span><input id="search" placeholder="Search"><div data-print-exempt><span id="receipt-label">Cash at Hand</span></div><span translate="no" id="data-value">Sales</span>';
    document.body.append(area);
  });
  await language('sw');
  await settle();
  assert.equal(await page.locator('#dynamic-label').textContent(), 'Fedha mkononi');
  assert.equal(await page.locator('#receipt-label').textContent(), 'Cash at Hand');
  assert.equal(await page.locator('#data-value').textContent(), 'Sales');
  assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Tafuta');
  await page.evaluate(() => {
    document.querySelector('#dynamic-label').firstChild.nodeValue = 'Sales';
    document.querySelector('#search').setAttribute('placeholder', 'Customer Name');
  });
  await settle();
  assert.equal(await page.locator('#dynamic-label').textContent(), 'Mauzo');
  assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Jina la mteja');
  await language('en');
  await settle();
  assert.equal(await page.locator('#dynamic-label').textContent(), 'Sales');
  assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Customer Name');
  await page.evaluate(() => document.querySelector('#search').removeAttribute('placeholder'));
  await settle();
  await language('sw');
  assert.equal(await page.locator('#search').getAttribute('placeholder'), null);
  // An idle translated page must not keep mutating itself and stall navigation.
  await settle();
  const idleWrites = await page.evaluate(() => new Promise(resolve => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    requestAnimationFrame(() => requestAnimationFrame(() => { observer.disconnect(); resolve(count); }));
  }));
  assert.equal(idleWrites, 0);
  console.log('PASS: dynamic labels and placeholders update; receipts stay unchanged; translator settles');

  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'late-search';
    input.placeholder = 'Search';
    document.body.append(input);
  });
  await settle();
  assert.equal(await page.locator('#late-search').getAttribute('placeholder'), 'Tafuta');
  await page.evaluate(() => { document.querySelector('#translation-probes').remove(); document.querySelector('#late-search').remove(); });
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await render(35035000);
    await check(35035000);
    const cash = page.locator('p[aria-label^="Cash at Hand:"]').first();
    assert.ok(await cash.isVisible());
    await cash.scrollIntoViewIfNeeded();
    const screenshot = join(tmpdir(), `daily-report-language-${width}.png`);
    await page.screenshot({ path: screenshot });
    console.log(`PASS: ${width}px report cards display current amounts; screenshot ${screenshot}`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: changed filters, zero and negative balances stay current in every language');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
