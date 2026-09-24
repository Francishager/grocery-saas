import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/i18n.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
const { translate, translateDocument, languageLocale } = module.exports;

test('translator is disabled so financial text cannot be rewritten after data loads', () => {
  assert.equal(translate('sw', 'Cash at Hand'), 'Cash at Hand');
  assert.equal(translate('lg', 'UGX 0'), 'UGX 0');
  assert.equal(translate('rw', 'Cash at Hand: UGX 35,035,000'), 'Cash at Hand: UGX 35,035,000');
});

test('language locale is pinned to the default platform locale while translation is disabled', () => {
  assert.equal(languageLocale('sw'), 'en-UG');
  assert.equal(languageLocale('lg'), 'en-UG');
  assert.equal(languageLocale('en'), 'en-UG');
});

test('document translator is a no-op cleanup function', () => {
  const cleanup = translateDocument('sw');
  assert.equal(typeof cleanup, 'function');
  assert.equal(cleanup(), undefined);
});
