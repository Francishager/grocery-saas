import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMsisdn, buildBillingPaymentRequest, getBillingGatewaySummary } from '../src/services/paymentGateway.js';

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
