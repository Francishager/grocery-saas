import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/translatedText.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const { translatedText } = module.exports;
const sw = key => ({ 'Cash at Hand': 'Fedha mkononi', 'Loading...': 'Inapakia...', Sales: 'Mauzo' })[key] || key;
const en = key => key;

test('translation never restores a cached loading zero over a newly loaded financial amount', () => {
  const initial = translatedText('UGX 0', undefined, en);
  const loaded = translatedText('UGX 35,035,000', initial, sw);
  assert.equal(loaded.rendered, 'UGX 35,035,000');
  assert.equal(translatedText(loaded.rendered, loaded, en).rendered, 'UGX 35,035,000');
});

test('updated zeros and negative amounts survive language changes in visible text and labels', () => {
  for (const prefix of ['', 'Cash at Hand: ']) {
    let state = translatedText(prefix + 'UGX 35,035,000', undefined, sw);
    for (const amount of ['UGX 0', '-UGX 25,000', 'UGX 1,275,000']) {
      state = translatedText(prefix + amount, state, en);
      state = translatedText(state.rendered, state, sw);
      assert.equal(state.rendered, prefix + amount);
    }
  }
});

test('an asynchronously loaded amount replaces a translated loading message', () => {
  const loading = translatedText('Loading...', undefined, sw);
  assert.equal(loading.rendered, 'Inapakia...');
  const loaded = translatedText('UGX 400', loading, sw);
  assert.equal(loaded.rendered, 'UGX 400');
  assert.equal(translatedText(loaded.rendered, loaded, en).rendered, 'UGX 400');
});

test('labels restore to English and pick up React label changes without losing whitespace', () => {
  const cash = translatedText('  Cash at Hand\n', undefined, sw);
  assert.equal(cash.rendered, '  Fedha mkononi\n');
  assert.equal(translatedText(cash.rendered, cash, en).rendered, '  Cash at Hand\n');
  const sales = translatedText('Sales', cash, sw);
  assert.equal(sales.rendered, 'Mauzo');
  assert.equal(translatedText(sales.rendered, sales, en).rendered, 'Sales');
});
