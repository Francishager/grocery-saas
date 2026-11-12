import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('creative layouts retain copy, logos and uncropped photos with readable exports', { timeout: 180000 }, async () => {
  const bundle = await build({ entryPoints: [path.join(root, 'src/lib/advisorVisuals.ts')], bundle: true, write: false, format: 'iife', globalName: 'visuals', platform: 'browser' });
  const fallback = process.platform === 'win32' && !existsSync(chromium.executablePath()) ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined;
  const browser = await chromium.launch({ headless: true, ...(fallback ? { executablePath: fallback } : {}) });
  const output = path.join(tmpdir(), 'jibusales-creative-layout-tests'); mkdirSync(output, { recursive: true });
  const image = `data:image/jpeg;base64,${readFileSync(path.join(root, 'public/img/Keep-nventory-accurate.jpg')).toString('base64')}`;
  const logo = `data:image/png;base64,${readFileSync(path.join(root, 'public/img/jibusales_logo.png')).toString('base64')}`;
  const font = readFileSync(path.join(root, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')).toString('base64');
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await page.setContent('<main></main>');
    await page.addStyleTag({ content: `@font-face{font-family:'Geist Variable';font-weight:100 900;src:url(data:font/woff2;base64,${font})}body{margin:24px;background:#eee;font-family:'Geist Variable'}main{max-width:660px;margin:auto}canvas{width:100%;height:auto;display:block}` });
    await page.evaluate(() => document.fonts.load('700 32px "Geist Variable"'));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const artifact = { id: 'test', kind: 'flyer', status: 'complete', title: 'A well stocked store', createdAt: '2026-09-13', data: {
      brand: { name: 'EXAMPLE BUSINESS', currency: 'UGX', logo }, format: 'square', palette: 'green', platform: 'facebook', layout: 'product', warnings: [], brief: 'Save 10% this Friday.',
      product: { name: 'Everyday essentials', price: 4500, unit: 'item' },
      copy: { headline: 'Your next great find.', offer: 'Save 10%', subheading: 'Everyday essentials, all in one place.', body: 'Visit our store this Friday. Discount applies to selected items.', cta: 'Find your favourites in store', caption: 'Discover your next favourite with us.', hashtags: [] },
    } };
    for (const format of ['square', 'portrait', 'story']) {
      for (const layout of ['product', 'editorial', 'offer']) {
        for (const long of [false, true]) {
          const item = structuredClone(artifact); item.data.format = format; item.data.layout = layout;
          if (long) {
            item.data.externalPhoto = { title: 'Example photo', creator: 'Photographer', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg', license: 'CC0 1.0' };
            item.data.brand.name = 'A Business With A Particularly Long Registered Trading Name For Layout Verification';
            item.data.copy.headline = 'Explore everyday essentials for your home and business';
            item.data.copy.subheading = 'Our selection brings everyday essentials together, with room to find what works for your household.';
            item.data.copy.body = 'Browse the range and choose what suits your needs. Visit the store this Friday for 10% off selected items. The offer applies only to marked products during opening hours. Ask our team about available sizes before ordering.';
          }
          const result = await page.evaluate(async ({ item, image }) => {
            const proto = CanvasRenderingContext2D.prototype, original = proto.fillText, originalImage = proto.drawImage;
            const text = [], photos = [];
            proto.fillText = function(value, x, y, ...rest) {
              const m = this.measureText(value), size = Number(this.font.match(/([\d.]+)px/)[1]);
              text.push({ value, size, x: x - m.actualBoundingBoxLeft, y: y - m.actualBoundingBoxAscent, right: x + m.actualBoundingBoxRight, bottom: y + m.actualBoundingBoxDescent });
              return original.call(this, value, x, y, ...rest);
            };
            proto.drawImage = function(img, ...args) {
              photos.push({ args, ratio: img.naturalWidth / img.naturalHeight });
              return originalImage.call(this, img, ...args);
            };
            try {
              const [canvas] = await visuals.renderAdvisorVisual(item, image);
              document.querySelector('main').replaceChildren(canvas); window.current = { item, canvas };
              const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
              let colored = 0; for (let i = 0; i < pixels.length; i += 400) if (pixels[i] < 230 || pixels[i + 1] < 230 || pixels[i + 2] < 230) colored++;
              return { text, photos, width: canvas.width, height: canvas.height, colored };
            } finally { proto.fillText = original; proto.drawImage = originalImage; }
          }, { item, image });
          const label = `${format}-${layout}-${long ? 'long' : 'normal'}`;
          assert.equal(result.width, 1080); assert.equal(result.height, { square: 1080, portrait: 1350, story: 1920 }[format]);
          assert(result.colored > 1000, `${label}: canvas must be nonblank`);
          const actual = result.text.map(row => row.value).join('').replace(/\s/g, '');
          if (long) assert(actual.includes('Representativephoto'));
          for (const value of [item.data.copy.headline, item.data.copy.offer, item.data.copy.subheading, item.data.copy.body, item.data.copy.cta, item.data.product.name]) assert(actual.includes(value.replace(/\s/g, '')), `${label}: missing ${value}`);
          for (const row of result.text) {
            assert(row.size >= 22, `${label}: unreadable text`);
            assert(row.x >= 0 && row.y >= 0 && row.right <= result.width && row.bottom <= result.height, `${label}: text outside canvas`);
          }
          for (let i = 0; i < result.text.length; i++) for (let j = i + 1; j < result.text.length; j++) {
            const a = result.text[i], b = result.text[j];
            assert(!(a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y), `${label}: overlapping '${a.value}' and '${b.value}'`);
          }
          assert.equal(result.photos.length, 2, `${label}: product and logo must both render`);
          for (const photo of result.photos) {
            assert.equal(photo.args.length, 4, `${label}: photo must not be cropped`);
            assert(Math.abs(photo.args[2] / photo.args[3] - photo.ratio) < 0.01);
            const [x, y, w, h] = photo.args;
            assert(w > 0 && h > 0);
            for (const row of result.text) assert(!(row.x < x + w && row.right > x && row.y < y + h && row.bottom > y), `${label}: text overlays the product or logo`);
          }
          if (!long) await page.locator('canvas').screenshot({ path: path.join(output, `${label}.png`) });
        }
      }
    }
    const png = page.waitForEvent('download');
    await page.evaluate(() => visuals.downloadVisualPng(window.current.item, window.current.canvas));
    await (await png).saveAs(path.join(output, 'flyer.png'));
    assert.equal(readFileSync(path.join(output, 'flyer.png')).subarray(1, 4).toString(), 'PNG');
    const pdf = page.waitForEvent('download');
    await page.evaluate(() => visuals.downloadVisualPdf(window.current.item, [window.current.canvas]));
    await (await pdf).saveAs(path.join(output, 'flyer.pdf'));
    assert.equal(readFileSync(path.join(output, 'flyer.pdf')).subarray(0, 4).toString(), '%PDF');
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${viewport.width}`);
    }
    const noImage = structuredClone(artifact); noImage.data.brand.logo = null; noImage.data.layout = 'editorial';
    await page.evaluate(async item => { const [canvas] = await visuals.renderAdvisorVisual(item); document.querySelector('main').replaceChildren(canvas); }, noImage);
    await page.locator('canvas').screenshot({ path: path.join(output, 'editorial-no-photo.png') });
    console.log(`Creative screenshots and exports: ${output}`);
  } finally { await browser.close(); }
});
