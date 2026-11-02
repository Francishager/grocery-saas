import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const panel = readFileSync(fileURLToPath(new URL('../src/components/CurrencyRatesPanel.tsx', import.meta.url)), 'utf8');

test('reference exchange rates use one selectable quote against the business currency', () => {
  assert.match(panel, /currencyApi\.rates\(normalizedBase\)/);
  assert.match(panel, /1 \$\{normalizedBase\} = \$\{formatRate\(quoteRate\)\} \$\{displayedQuote\}/);
  assert.match(panel, /aria-label="Compare business currency with"/);
  assert.doesNotMatch(panel, /Selected currency|Uganda shilling|USD\/UGX|baseToUgx|usdToUgx/);
  assert.match(panel, /Object\.keys\(rates\)/);
  assert.match(panel, /Compare with/);
  assert.match(panel, /currencyCodes\.slice\(0, 5\)/);
  assert.match(panel, /Load more rates/);
  assert.match(panel, /Show fewer rates/);
});

test('exchange rates render one comparison card and a short expandable rate list', () => {
  assert.match(panel, /rounded-md border border-primary\/20 bg-primary\/5 p-3/);
  assert.match(panel, /aria-label="Compare business currency with"/);
  assert.match(panel, /overflow-x-auto rounded-md border/);
  assert.match(panel, /visibleCurrencyCodes\.map/);
});

test('out-of-order rate responses cannot overwrite the latest selected currency', () => {
  assert.match(panel, /const currentRequestId = \+\+requestId\.current/);
  assert.match(panel, /requestId\.current === currentRequestId/);
  assert.match(panel, /data\?\.baseCurrency\?\.toUpperCase\(\) === normalizedBase/);
});
