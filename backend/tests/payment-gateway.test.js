import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  normalizeMsisdn,
  buildBillingPaymentRequest,
  getBillingGatewaySummary,
  normalizeRelworxStatus,
  verifyRelworxWebhookSignature,
} from '../src/services/paymentGateway.js';

test('normalizeMsisdn converts local Ugandan numbers into E.164 format', () => {
  assert.equal(normalizeMsisdn('0771234567'), '+256771234567');
  assert.equal(normalizeMsisdn('+256771234567'), '+256771234567');
});

test('buildBillingPaymentRequest returns a provider-ready reference and amount', () => {
  const request = buildBillingPaymentRequest({
    amount: 250000,
    msisdn: '0771234567',
    networkProvider: 'MTN',
    tenantId: 'tenant-123',
  });

  assert.equal(request.amount, 250000);
  assert.equal(request.msisdn, '+256771234567');
  assert.equal(request.networkProvider, 'MTN');
  assert.match(request.reference, /^BILL_/);
});

test('getBillingGatewaySummary reports a mock provider when no gateway env vars are configured', () => {
  const summary = getBillingGatewaySummary();

  assert.equal(summary.configured, false);
  assert.equal(summary.provider, 'mock');
  assert.equal(summary.mode, 'simulation');
});

test('normalizeRelworxStatus maps provider values to the tenant billing state', () => {
  assert.equal(normalizeRelworxStatus('successful'), 'COMPLETED');
  assert.equal(normalizeRelworxStatus('failed'), 'FAILED');
  assert.equal(normalizeRelworxStatus('pending'), 'PENDING');
});

test('verifyRelworxWebhookSignature accepts a valid signed payload', () => {
  const webhookUrl = 'https://example.test/api/tenants/billing-reminder/relworx/webhook';
  const payload = {
    customer_reference: 'BILL_TENANT_123',
    internal_reference: 'INT_123',
    status: 'completed',
  };

  const timestamp = '1710000000';
  const params = {
    customer_reference: payload.customer_reference,
    internal_reference: payload.internal_reference,
    status: payload.status,
  };

  const sortedEntries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  const signedData = sortedEntries.reduce((acc, [key, value]) => `${acc}${key}${value}`, `${webhookUrl}${timestamp}`);
  const signature = crypto.createHmac('sha256', 'test-webhook-key').update(signedData).digest('hex');

  process.env.RELWORX_WEBHOOK_KEY = 'test-webhook-key';
  const valid = verifyRelworxWebhookSignature(`t=${timestamp},v=${signature}`, payload, webhookUrl);

  assert.equal(valid, true);
});
