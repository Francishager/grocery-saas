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
const stubs = {
  JWTAuthContext: "const user = {id:'staff',role:'staff',tenantId:'tenant',name:'Test Staff'}; const hasPermission = () => true; export const useJWTAuth = () => ({user,hasPermission});",
  featureAccessService: "const hasFeature = () => false; export const useFeatureAccess = () => ({hasFeature});",
  'db/hooks': "export const useOnlineStatus = () => window.fixture.online;",
  'db/hybrid': "export const getLocalNotifications = async () => []; export const getLocalProducts = async () => window.fixture.products; export const getLocalSales = async () => []; export const getLocalSettings = async () => ({name:'Test Business'});",
  'db/index': "const table = {toArray:async()=>[], update:async()=>{}, get:async()=>({quantity:10}), put:async()=>{}}; export const db = new Proxy({}, {get:()=>table});",
  'db/sync': "export const queueMutation = async () => {};",
  'lib/firebase': "export const isFirebaseConfigured = () => true; export const requestNotificationPermission = async () => Notification.permission; export const getFCMToken = async () => null; export const onForegroundMessage = callback => {window.pushMessage=callback;return ()=>{window.pushMessage=null}};",
  'lib/receiptPrint': "export const openReceiptPrintWindow=()=>({close(){}}); export const printReceiptInBrowser=async()=>true;",
  'lib/api': [
    "export const getAuthToken=()=>null;",
    "export const inventoryApi={list:async()=>window.fixture.products};",
    "export const salesApi={list:async()=>[],checkout:async()=>{window.fixture.checkouts++;if(window.fixture.fail)throw Error('Payment failed');return {total:12500,sale:{id:'sale-1',receiptNo:'TEST-001',total:12500,serviceJobCards:[]}}}};",
    "export const barcodeApi={}; export const categoriesApi={list:async()=>[]}; export const branchesApi={active:async()=>[]};",
    "export const settingsApi={getTaxConfig:async()=>({taxEnabled:false}),getBusinessProfile:async()=>({name:'Test Business'})};",
    "export const apiFetch=async(path,options={})=>{if(path.includes('/read'))window.fixture.reads.push(path);return {ok:true,json:async()=>path==='/api/notifications'?structuredClone(window.fixture.notifications):[]}};",
  ].join('\n'),
};
const bundle = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: [
    "import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';",
    "import Sales from './src/pages/SalesPage'; import {NotificationBell} from './src/components/NotificationBell'; import {Toaster} from './src/components/ui/toaster'; import {toast} from './src/hooks/use-toast';",
    "window.fixture={online:true,notifications:[],reads:[],checkouts:0,fail:false,products:[{id:'product',product_name:'Test Rice',unit_price:12500,cost_price:10000,quantity:10,categoryId:'rice',itemType:'product'}]};",
    "window.nativeCalls=0; const permission=new URLSearchParams(location.search).get('permission')||'denied';",
    "window.Notification=class { static permission=permission; static requestPermission=async()=>permission; constructor(){window.nativeCalls++;throw Error('Native foreground alert must not run')}};",
    "const interval=window.setInterval; window.setInterval=(fn,ms,...args)=>{if(ms===30000)window.pollNotifications=fn;return interval(fn,ms,...args)};",
    "import {AppFeedback, appConfirm, appNotify, appPrompt} from './src/lib/appFeedback';",
    "window.extraToast=()=>toast({title:'Payment saved',description:'See https://example.com/private and /tenant/accounting',variant:'success'});",
    "window.askConfirm=()=>{window.confirmResult='pending';appConfirm('Delete this item? This action cannot be undone. https://example.com/private').then(answer=>{window.confirmResult=answer})};",
    "window.notice=()=>appNotify('Changes saved. https://example.com/private');",
    "window.askPrompt=()=>{window.promptResult='pending';appPrompt('Enter reload amount:', 'number').then(answer=>{window.promptResult=answer})};",
    "createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter><header><NotificationBell/></header><Sales/><Toaster/><AppFeedback/></MemoryRouter></React.StrictMode>);",
  ].join('\n') },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [{ name: 'notification-fixtures', setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
      const resolved = path.startsWith('.') ? resolve(dirname(importer), path).replaceAll('\\', '/') : path;
      const key = Object.keys(stubs).find(key => resolved.endsWith(key));
      if (key) return { path: key, namespace: 'fixture' };
      if (/(BarcodeScanner|ReceiptViewer|CustomerTransactionHistoryDialog|SaleServiceJobsEditor)$/.test(path)) return { path: 'empty', namespace: 'fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
      contents: stubs[path] || 'export default function Component(){return null}', loader: 'js',
    }));
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
  for (const [width, height, permission] of [[1440, 900, 'denied'], [390, 844, 'granted']]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push('Native browser dialog: ' + dialog.type()); await dialog.dismiss(); });
    await page.goto('http://127.0.0.1:' + server.address().port + '?permission=' + permission);
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Sale', exact: true }).click();
    await page.getByText('Sale completed', { exact: true }).waitFor();
    await page.getByText('Print dialog ready', { exact: true }).waitFor();
    const popup = page.getByText('Sale completed', { exact: true }).locator('xpath=ancestor::li');
    assert.equal(await popup.count(), 1);
    assert.match(await popup.textContent(), /12,500/);
    assert.equal(await page.evaluate(() => window.nativeCalls), 0);
    assert.equal(await page.evaluate(() => window.fixture.checkouts), 1);
    console.log('PASS: real checkout shows sale and print pop-ups with browser permission ' + permission);

    await page.evaluate(async () => {
      window.fixture.notifications = [{id:'database-notification-1',title:'Sale completed',type:'sale',message:'Test Rice sold for UGX 12,500',isRead:false,createdAt:new Date().toISOString(),metadata:{saleId:'sale-1',receiptNo:'TEST-001'}}];
      await window.pollNotifications();
      if(window.pushMessage)window.pushMessage({data:{notificationId:'database-notification-1',saleId:'sale-1',type:'sale'},notification:{title:'Sale completed',body:'Test Rice sold for UGX 12,500'}});
    });
    assert.equal(await page.getByText('Sale completed', { exact: true }).count(), 1, 'No second pop-up from polling or push');
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await page.getByRole('button', { name: 'Mark notification as read', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.reads), ['/api/notifications/database-notification-1/read']);
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    console.log('PASS: immediate/poll/push sale is deduplicated and read uses the real server ID');

    await page.evaluate(async () => {
      window.fixture.notifications.push({id:'stock-1',title:'Low stock alert',message:'Test Rice has 2 bags left. https://example.com/stock /tenant/inventory/products',type:'low_stock',isRead:false,createdAt:new Date().toISOString()});
      await window.pollNotifications();
      window.extraToast();
    });
    await page.getByText('Low stock alert', { exact: true }).waitFor();
    const popups = page.locator('li[data-state="open"]');
    assert.ok(!(await popups.allTextContents()).join(' ').match(/https?:|example\.com|\/tenant\//));
    for (const element of await popups.all()) {
      const rect = await element.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width + 1, 'Pop-up fits viewport');
    }
    await page.screenshot({ path: join(tmpdir(), 'jibusales-notifications-' + width + '.png') });
    console.log('PASS: low-stock and global toasts are styled, URL-free, and fit ' + width + 'px');

    await page.reload();
    await page.evaluate(() => { window.fixture.fail = true; });
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Sale', exact: true }).click();
    await page.getByText('Checkout failed', { exact: true }).waitFor();
    assert.equal(await page.getByText('Sale completed', { exact: true }).count(), 0);
    await page.reload();
    await page.evaluate(() => { window.fixture.online = false; });
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Sale', exact: true }).click();
    await page.getByText('Sale recorded offline', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.nativeCalls), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: failed checkout has no success alert; offline checkout has an immediate confirmation');
    await page.evaluate(() => window.askConfirm());
    const dialog = page.getByRole('dialog', { name: 'Confirm action' });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => window.confirmResult), 'pending');
    assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
    assert.ok(!(await dialog.textContent()).includes('example.com'));
    const bounds = await dialog.boundingBox();
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 2);
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - height / 2) < 2);
    await page.screenshot({ path: join(tmpdir(), 'jibusales-confirmation-' + width + '.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => window.confirmResult === false);
    await page.evaluate(() => window.askConfirm());
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.confirmResult === false);
    await page.evaluate(() => window.askConfirm());
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForFunction(() => window.confirmResult === true);
    await page.evaluate(() => window.notice());
    await page.getByText('Changes saved.', { exact: true }).waitFor();
    await page.evaluate(() => window.askPrompt());
    await page.getByRole('spinbutton').fill('25000');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForFunction(() => window.promptResult === '25000');
    await page.evaluate(() => window.askPrompt());
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => window.promptResult === null);
    assert.deepEqual(errors, []);
    console.log('PASS: centered URL-free confirmation safely handles Cancel, Escape and Confirm; notices use in-app toasts');
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
