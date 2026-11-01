import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const panel = readFileSync(fileURLToPath(new URL('../src/components/CurrencyRatesPanel.tsx', import.meta.url)), 'utf8');

test('reference exchange rates follow the selected business currency and retain USD/UGX context', () => {
  assert.match(panel, /currencyApi\.rates\(normalizedBase\)/);
  assert.match(panel, /1 \$\{normalizedBase\} = \$\{formatRate\(baseToUgx\)\} UGX/);
  assert.match(panel, /1 USD = \$\{formatRate\(usdToUgx\)\} UGX/);
  assert.match(panel, /\{normalizedBase\} to \{code\}/);
});

test('exchange-rate table keeps readable wrapped columns on narrow screens', () => {
  assert.match(panel, /overflow-x-auto rounded-md border/);
  assert.match(panel, /w-full table-fixed text-sm/);
  assert.match(panel, /break-words px-3 py-2 text-right tabular-nums/);
});

test('out-of-order rate responses cannot overwrite the latest selected currency', () => {
  assert.match(panel, /const currentRequestId = \+\+requestId\.current/);
  assert.match(panel, /requestId\.current === currentRequestId/);
  assert.match(panel, /data\?\.baseCurrency\?\.toUpperCase\(\) === normalizedBase/);
});
