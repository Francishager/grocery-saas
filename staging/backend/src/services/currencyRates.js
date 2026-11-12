import { getTenantFeatures, hasFeatureAccess } from '../../middleware/featureCheck.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STALE_MS = 48 * 60 * 60 * 1000;
const cache = new Map();

export const toBaseCurrency = (amount, rateToBase) => {
  const value = Number(amount);
  const rate = Number(rateToBase);
  if (!Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0) {
    throw Object.assign(new Error('Enter a valid amount and exchange rate.'), { statusCode: 400 });
  }
  return Math.round((value * rate + Number.EPSILON) * 100) / 100;
};

export const toTransactionCurrency = (amount, rateToBase) => {
  const value = Number(amount);
  const rate = Number(rateToBase);
  if (!Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0) {
    throw Object.assign(new Error('Enter a valid amount and exchange rate.'), { statusCode: 400 });
  }
  return Math.round((value / rate + Number.EPSILON) * 100) / 100;
};

export async function resolveTenantTransactionCurrency(prisma, tenantId, requestedCurrency, quotedUnitsPerBase) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } });
  if (!tenant) throw Object.assign(new Error('Business not found.'), { statusCode: 404 });
  const baseCurrency = normalizeCode(tenant.currency || 'UGX');
  const currency = normalizeCode(requestedCurrency || baseCurrency);
  if (!baseCurrency || !currency) throw Object.assign(new Error('Select a valid three-letter transaction currency.'), { statusCode: 400 });
  if (currency === baseCurrency) return { baseCurrency, currency, rateToBase: 1, rateDate: null, provider: 'Business base currency' };

  if (!hasFeatureAccess(await getTenantFeatures(tenantId), 'settings.currencies')) {
    throw Object.assign(new Error('Foreign-currency transactions are not enabled on this business plan.'), { statusCode: 403 });
  }
  const fx = await getRateToBase(baseCurrency, currency);
  if (fx.cacheStatus === 'stale') throw Object.assign(new Error('Live exchange rates are temporarily unavailable; foreign-currency posting is paused until a fresh rate can be confirmed.'), { statusCode: 503 });
  const unitsPerBase = Number(quotedUnitsPerBase);
  const liveUnitsPerBase = 1 / fx.rateToBase;
  if (Number.isFinite(unitsPerBase) && Math.abs(unitsPerBase - liveUnitsPerBase) / liveUnitsPerBase > 0.001) {
    throw Object.assign(new Error('The exchange rate changed. Refresh the rate and try again.'), { statusCode: 409 });
  }
  return { baseCurrency, currency, ...fx };
}

const normalizeCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
};

export async function getCurrencyRates(baseCurrency, fetchImpl = fetch) {
  const base = normalizeCode(baseCurrency);
  if (!base) throw Object.assign(new Error('Enter a valid three-letter base currency.'), { statusCode: 400 });
  const apiKey = String(process.env.EXCHANGE_RATE_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Currency rates are not configured. Set EXCHANGE_RATE_API_KEY in the backend environment.'), { statusCode: 503 });

  const now = Date.now();
  const existing = cache.get(base);
  if (existing && now - existing.cachedAt < CACHE_TTL_MS) return { ...existing.data, cacheStatus: 'fresh' };

  try {
    const response = await fetchImpl(`https://v6.exchangerate-api.com/v6/latest/${encodeURIComponent(base)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Rate provider returned ${response.status}.`);
    const payload = await response.json();
    const rates = payload?.conversion_rates;
    if (payload?.result !== 'success' || payload?.base_code !== base || !rates || typeof rates !== 'object') {
      throw new Error('Rate provider returned an invalid response.');
    }
    const validRates = Object.fromEntries(Object.entries(rates)
      .filter(([code, value]) => normalizeCode(code) && Number.isFinite(Number(value)) && Number(value) > 0)
      .map(([code, value]) => [code, Number(value)]));
    if (validRates[base] !== 1) throw new Error('Rate provider response is missing a valid base rate.');

    const data = {
      baseCurrency: base,
      rates: validRates,
      provider: 'ExchangeRate-API Standard',
      rateDate: payload.time_last_update_utc || null,
      nextUpdateAt: payload.time_next_update_utc || null,
    };
    cache.set(base, { data, cachedAt: now });
    return { ...data, cacheStatus: 'fresh' };
  } catch (error) {
    if (existing && now - existing.cachedAt <= MAX_STALE_MS) {
      return { ...existing.data, cacheStatus: 'stale', warning: 'Live rates are temporarily unavailable; showing the last retrieved rate.' };
    }
    throw Object.assign(new Error('Live exchange rates are temporarily unavailable. Retry shortly.'), { statusCode: 503, cause: error });
  }
}

export function clearCurrencyRateCache() {
  cache.clear();
}

export async function getRateToBase(baseCurrency, transactionCurrency, fetchImpl = fetch) {
  const base = normalizeCode(baseCurrency);
  const currency = normalizeCode(transactionCurrency);
  if (!base || !currency) throw Object.assign(new Error('Enter valid three-letter currency codes.'), { statusCode: 400 });
  if (base === currency) return { rateToBase: 1, rateDate: null, provider: 'Business base currency' };
  const quote = await getCurrencyRates(base, fetchImpl);
  const currencyPerBase = Number(quote.rates[currency]);
  if (!Number.isFinite(currencyPerBase) || currencyPerBase <= 0) {
    throw Object.assign(new Error(`Live exchange rate for ${currency} is unavailable.`), { statusCode: 400 });
  }
  return {
    rateToBase: 1 / currencyPerBase,
    rateDate: quote.rateDate,
    provider: quote.provider,
    cacheStatus: quote.cacheStatus,
  };
}

export { normalizeCode as normalizeCurrencyCode };
