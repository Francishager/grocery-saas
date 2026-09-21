import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [{
    name: 'attendance-test-entry',
    resolveId(id) { if (id === '/__attendance-test-entry.jsx') return id; },
    load(id) {
      if (id === '/__attendance-test-entry.jsx') return `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import Page from '/src/pages/hr/AttendanceCheckPage.tsx';
        import '/src/index.css';
        createRoot(document.getElementById('root')).render(React.createElement(Page));`;
    },
  }],
  server: { host: '127.0.0.1', port: 5187, strictPort: false, open: false, hmr: false },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const context = await browser.newContext({
    geolocation: { latitude: 0.3476, longitude: 32.5825, accuracy: 10 },
    permissions: ['geolocation'], serviceWorkers: 'block',
  });
  const page = await context.newPage();
  let record = { checkInTime: new Date().toISOString(), checkOutTime: null };
  let configured = true;
  let failEmployees = false;
  let locationRequests = 0;
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.route('**/api/hr/attendance/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data, status = 200;
    if (path.endsWith('/geofence')) {
      locationRequests++;
      data = { configured, data: { address: 'Kampala Store', latitude: configured ? 0.3476 : null, longitude: configured ? 32.5825 : null, radiusMeters: 200 } };
    } else if (path.endsWith('/employee-options')) {
      status = failEmployees ? 403 : 200;
      data = failEmployees ? { message: 'Your login is not linked to an employee profile.' }
        : { data: [{ id: 'employee-a', firstName: 'Alex', lastName: 'Test', employeeNumber: 'AT00001' }], ownEmployeeId: 'employee-a', canRecordAnyone: false };
    } else if (path.endsWith('/current-status')) data = { data: record };
    else if (path.endsWith('/checkout')) { record = { ...record, checkOutTime: new Date().toISOString() }; data = { data: record }; }
    else if (path.endsWith('/checkin')) { record = { checkInTime: new Date().toISOString(), checkOutTime: null }; data = { data: record }; }
    else throw new Error('Unexpected attendance endpoint: ' + path);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/__attendance-check-test', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div>
      <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/__attendance-test-entry.jsx');
      </script></body></html>`,
  }));
  const open = () => page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/__attendance-check-test');
  const enabled = async (text) => {
    await page.waitForFunction((label) => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === label && !button.disabled), text);
  };
  const disabled = async (text) => {
    await page.waitForFunction((label) => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === label && button.disabled), text);
  };
  await open();
  await enabled('Check Out');
  assert.equal(await page.locator('#attendance-employee').inputValue(), 'employee-a');
  assert.equal(await page.locator('#attendance-employee').isDisabled(), true);
  await disabled('Check In');
  await page.getByRole('button', { name: 'Check Out', exact: true }).click();
  await page.getByText('Attendance is completed for today.', { exact: true }).waitFor();
  await disabled('Check In');
  await disabled('Check Out');
  console.log('PASS: saved check-in restores Check Out; self employee selected; checkout completes');

  record = null;
  await page.reload();
  await enabled('Check In');
  await context.setGeolocation({ latitude: 1, longitude: 33, accuracy: 10 });
  await disabled('Check In');
  await page.getByText('You are outside the saved business attendance area.', { exact: true }).waitFor();
  await context.setGeolocation({ latitude: 0.3476, longitude: 32.5825, accuracy: 10 });
  await enabled('Check In');
  console.log('PASS: live location disables outside and re-enables inside the attendance radius');

  failEmployees = true;
  await page.reload();
  await page.locator('#attendance-location').filter({ hasText: 'Kampala Store' }).waitFor();
  await page.getByRole('alert').filter({ hasText: 'not linked' }).waitFor();
  await disabled('Check In');
  failEmployees = false;
  await page.getByRole('button', { name: 'Refresh Location' }).click();
  await enabled('Check In');
  console.log('PASS: employee lookup failure preserves business location; retry recovers');

  configured = false;
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'capture the business GPS location' }).waitFor();
  await disabled('Check In');
  const beforeRefresh = locationRequests;
  configured = true;
  await page.getByRole('button', { name: 'Refresh Location' }).click();
  await enabled('Check In');
  assert.ok(locationRequests > beforeRefresh);
  console.log('PASS: newly saved business GPS loads on refresh without reloading the page');

  await context.clearPermissions();
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'Location is blocked' }).waitFor();
  await disabled('Check In');
  await context.grantPermissions(['geolocation']);
  await page.getByRole('button', { name: 'Refresh Location' }).click();
  await enabled('Check In');
  console.log('PASS: denied location explains the block and recovers after permission is restored');

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: join(tmpdir(), 'attendance-' + width + '.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile layouts fit; no page runtime errors');
} finally {
  await browser?.close();
  await server.close();
}
