import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCurrencyRateCache, getCurrencyRates, getRateToBase, toBaseCurrency, toTransactionCurrency } from '../src/services/currencyRates.js';

async function withApiKey(run) {
  const previousKey = process.env.EXCHANGE_RATE_API_KEY;
  process.env.EXCHANGE_RATE_API_KEY = 'test-api-key';
  try { return await run(); }
  finally {
    if (previousKey === undefined) delete process.env.EXCHANGE_RATE_API_KEY;
    else process.env.EXCHANGE_RATE_API_KEY = previousKey;
  }
}

test('loads validated rates against the requested base and caches successful response', async () => {
  clearCurrencyRateCache();
  await withApiKey(async () => {
    let calls = 0;
    const fetchStub = async (url, options) => {
      calls += 1;
      assert.equal(url, 'https://v6.exchangerate-api.com/v6/latest/UGX');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-api-key');
      return {
        ok: true,
        json: async () => ({ result: 'success', base_code: 'UGX', time_last_update_utc: 'Mon, 26 Oct 2026 00:00:01 +0000', time_next_update_utc: 'Tue, 27 Oct 2026 00:00:01 +0000', conversion_rates: { UGX: 1, USD: 0.00026, INVALID: 3, KES: 0 } }),
      };
    };

    const first = await getCurrencyRates('ugx', fetchStub);
    const second = await getCurrencyRates('UGX', fetchStub);
    assert.equal(first.rates.UGX, 1);
    assert.equal(first.rates.USD, 0.00026);
    assert.equal(first.rates.INVALID, undefined);
    assert.equal(first.rates.KES, undefined);
    assert.equal(first.attributionUrl, undefined);
    assert.equal(second.cacheStatus, 'fresh');
    assert.equal(calls, 1);
  });
  clearCurrencyRateCache();
});

test('rejects invalid base codes and malformed provider payloads', async () => {
  await assert.rejects(() => getCurrencyRates('UGX1'), /valid three-letter base currency/);
  await withApiKey(async () => {
    await assert.rejects(() => getCurrencyRates('UGX', async () => ({ ok: true, json: async () => ({ result: 'error' }) })), /temporarily unavailable/);
  });
  clearCurrencyRateCache();
});

test('calculates the inverse rate needed to convert transaction currency into base', async () => {
  clearCurrencyRateCache();
  await withApiKey(async () => {
    const fx = await getRateToBase('UGX', 'USD', async () => ({
      ok: true,
      json: async () => ({ result: 'success', base_code: 'UGX', conversion_rates: { UGX: 1, USD: 0.00025 }, time_last_update_utc: 'Mon, 26 Oct 2026 00:00:01 +0000' }),
    }));
    assert.equal(fx.rateToBase, 4000);
    assert.equal(fx.provider, 'ExchangeRate-API Standard');
  });
  clearCurrencyRateCache();
});

test('requires a backend API key and never falls back to the attribution-required endpoint', async () => {
  clearCurrencyRateCache();
  const previousKey = process.env.EXCHANGE_RATE_API_KEY;
  delete process.env.EXCHANGE_RATE_API_KEY;
  let called = false;
  try {
    await assert.rejects(() => getCurrencyRates('UGX', async () => { called = true; }), /Set EXCHANGE_RATE_API_KEY/);
    assert.equal(called, false);
  } finally {
    if (previousKey !== undefined) process.env.EXCHANGE_RATE_API_KEY = previousKey;
  }
});

test('rounds both transaction and base equivalents to currency precision', () => {
  assert.equal(toBaseCurrency(12.34, 4000), 49360);
  assert.equal(toTransactionCurrency(49360, 4000), 12.34);
  assert.throws(() => toBaseCurrency(10, 0), /valid amount and exchange rate/);
});
