import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/pages/PropertyManagementPage.tsx', import.meta.url)), 'utf8');
const backend = readFileSync(fileURLToPath(new URL('../../backend/src/routes/propertyManagement.js', import.meta.url)), 'utf8');
const schema = readFileSync(fileURLToPath(new URL('../../backend/prisma/schema.prisma', import.meta.url)), 'utf8');

test('rent collection selects a payment method and matching permitted account', () => {
  assert.match(source, /name="paymentMethod" required value=\{method\}/);
  assert.match(source, /account\.paymentMethod === method/);
  assert.match(source, /paymentMethod: method, cashAccountId: account\.id/);
});

test('mobile-money rent collection requires and persists provider, phone, and transaction reference', () => {
  assert.match(source, /name="mobileProvider" required/);
  assert.match(source, /name="phoneNumber" type="tel" required/);
  assert.match(source, /name="mobileTransactionRef" required/);
  assert.match(source, /mobileProvider: method === 'mobile_money' \? mobileProvider/);
  assert.match(backend, /Mobile-money rent payments require the provider, phone number, and transaction reference/);
  assert.match(backend, /mobileProvider: method === 'mobile_money' \? mobileProvider/);
  assert.match(schema, /model PropertyRentPayment \{[\s\S]*?mobileProvider\s+String\?\s+phoneNumber\s+String\?/);
});

test('permission model contains every newly persisted permission causing the reported Railway validation error', () => {
  const model = schema.match(/model UserPermission \{([\s\S]*?)\n\}/)?.[1] || '';
  for (const key of ['canViewCustomerIdentity', 'canReactivateTenancies', 'canEditRentPeriods', 'canApplyTenantDepositToRent', 'canViewPlanner', 'canManagePlanner', 'canViewCRM', 'canCreateCRM', 'canEditCRM', 'canDeleteCRM']) {
    assert.match(model, new RegExp(`\\b${key}\\s+Boolean\\s+@default\\(false\\)`), `${key} must exist with a safe default`);
  }
});
