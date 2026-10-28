import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCurrencyRateCache, getCurrencyRates, getRateToBase, toBaseCurrency, toTransactionCurrency } from '../src/services/currencyRates.js';

test('loads validated rates against the requested base and caches successful response', async () => {
  clearCurrencyRateCache();
  let calls = 0;
  const fetchStub = async (url) => {
    calls += 1;
    assert.equal(url, 'https://open.er-api.com/v6/latest/UGX');
    return {
      ok: true,
      json: async () => ({ result: 'success', base_code: 'UGX', time_last_update_utc: 'Mon, 26 Oct 2026 00:00:01 +0000', time_next_update_utc: 'Tue, 27 Oct 2026 00:00:01 +0000', rates: { UGX: 1, USD: 0.00026, INVALID: 3, KES: 0 } }),
    };
  };

  const first = await getCurrencyRates('ugx', fetchStub);
  const second = await getCurrencyRates('UGX', fetchStub);
  assert.equal(first.rates.UGX, 1);
  assert.equal(first.rates.USD, 0.00026);
  assert.equal(first.rates.INVALID, undefined);
  assert.equal(first.rates.KES, undefined);
  assert.equal(second.cacheStatus, 'fresh');
  assert.equal(calls, 1);
  clearCurrencyRateCache();
});

test('rejects invalid base codes and malformed provider payloads', async () => {
  await assert.rejects(() => getCurrencyRates('UGX1'), /valid three-letter base currency/);
  await assert.rejects(() => getCurrencyRates('UGX', async () => ({ ok: true, json: async () => ({ result: 'error' }) })), /temporarily unavailable/);
  clearCurrencyRateCache();
});

test('calculates the inverse rate needed to convert transaction currency into base', async () => {
  clearCurrencyRateCache();
  const fx = await getRateToBase('UGX', 'USD', async () => ({
    ok: true,
    json: async () => ({ result: 'success', base_code: 'UGX', rates: { UGX: 1, USD: 0.00025 }, time_last_update_utc: 'Mon, 26 Oct 2026 00:00:01 +0000' }),
  }));
  assert.equal(fx.rateToBase, 4000);
  assert.equal(fx.provider, 'ExchangeRate-API Open Access');
  clearCurrencyRateCache();
});

test('rounds both transaction and base equivalents to currency precision', () => {
  assert.equal(toBaseCurrency(12.34, 4000), 49360);
  assert.equal(toTransactionCurrency(49360, 4000), 12.34);
  assert.throws(() => toBaseCurrency(10, 0), /valid amount and exchange rate/);
});
