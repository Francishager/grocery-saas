import crypto from 'crypto';

export function normalizeMsisdn(msisdn) {
  const raw = String(msisdn || '').trim().replace(/\s+/g, '');

  if (!raw) throw new Error('Phone number is required');
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('256')) return `+${raw}`;
  if (raw.startsWith('0')) return `+256${raw.slice(1)}`;
  return `+${raw}`;
}

export function buildBillingPaymentRequest({ amount, msisdn, networkProvider, tenantId }) {
  const normalizedAmount = Number(amount || 0);
  const provider = String(networkProvider || 'MTN').toUpperCase();

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Valid billing amount is required');
  }

  return {
    tenantId: String(tenantId || 'unknown'),
    amount: normalizedAmount,
    msisdn: normalizeMsisdn(msisdn),
    networkProvider: provider,
    reference: `BILL_${String(tenantId || 'TENANT').replace(/[^A-Z0-9]/gi, '').slice(0, 12).toUpperCase()}_${Date.now().toString(36).toUpperCase()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    currency: 'UGX',
    description: `JibuSales subscription billing for tenant ${tenantId || 'tenant'}`,
  };
}

export function getBillingGatewaySummary() {
  const configured = Boolean(process.env.RELWORX_API_KEY && process.env.RELWORX_ACCOUNT_NO);
  return {
    configured,
    provider: configured ? 'relworx' : 'mock',
    mode: configured ? 'live' : 'simulation',
    baseUrl: process.env.RELWORX_BASE_URL || null,
    accountNo: process.env.RELWORX_ACCOUNT_NO || null,
  };
}

export async function processTenantBillingPayment({ amount, msisdn, networkProvider, tenantId, tenantName }) {
  const payload = buildBillingPaymentRequest({
    amount,
    msisdn,
    networkProvider,
    tenantId,
  });

  const summary = getBillingGatewaySummary();

  if (!summary.configured) {
    return {
      provider: 'mock',
      mode: 'simulation',
      configured: false,
      paymentId: `mock_${payload.reference}`,
      reference: payload.reference,
      amount: payload.amount,
      currency: payload.currency,
      networkProvider: payload.networkProvider,
      msisdn: payload.msisdn,
      status: 'COMPLETED',
      message: 'Live Relworx gateway is not configured. The billing request was simulated successfully for this tenant.',
      tenantName: tenantName || tenantId || 'tenant',
      createdAt: new Date().toISOString(),
    };
  }

  const response = await fetch(`${summary.baseUrl || 'https://payments.relworx.com/api'}/mobile-money/request-payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RELWORX_API_KEY}`,
      Accept: 'application/vnd.relworx.v2',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_no: summary.accountNo,
      reference: payload.reference,
      msisdn: payload.msisdn,
      currency: payload.currency,
      amount: Number(payload.amount),
      description: payload.description,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorText = data?.message || data?.error || 'Relworx request failed';
    throw new Error(errorText);
  }

  return {
    provider: 'relworx',
    mode: 'live',
    configured: true,
    paymentId: data?.payment_id || data?.paymentId || payload.reference,
    reference: data?.reference || payload.reference,
    amount: Number(data?.amount ?? payload.amount),
    currency: data?.currency || payload.currency,
    networkProvider: payload.networkProvider,
    msisdn: payload.msisdn,
    status: data?.status || data?.request_status || 'PENDING',
    message: data?.message || 'Relworx mobile money request initiated successfully.',
    rawResponse: data,
    tenantName: tenantName || tenantId || 'tenant',
    createdAt: new Date().toISOString(),
  };
}
