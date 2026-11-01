import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const profilePage = source('../src/pages/receivables/CustomerProfilePage.tsx');
const paymentDialog = source('../src/components/customer/CustomerPaymentDialog.tsx');

test('record payment opens over the profile without navigating to the receivables table', () => {
  assert.match(profilePage, /onRecordPayment=\{\(customer\) => setPaymentCustomer\(customer\)\}/);
  assert.match(profilePage, /<CustomerPaymentDialog/);
  assert.doesNotMatch(profilePage, /onRecordPayment=\{\(customer\) => navigate\('\/tenant\/receivables\/customers'/);
});

test('profile payment posts through the permission-checked receivables endpoint with branch and idempotency', () => {
  assert.match(paymentDialog, /apiFetch\('\/api\/receivables\/payments'/);
  assert.match(paymentDialog, /branchId: customer\.branchId/);
  assert.match(paymentDialog, /'Idempotency-Key': idempotencyKey/);
  assert.match(paymentDialog, /canUseOwnCashAccount|canUseSafeAccount|canUseBankAccount/);
});

test('payment-method and account selectors cannot dismiss the payment dialog through their portals', () => {
  assert.match(paymentDialog, /onInteractOutside=\{\(event\) => \{/);
  assert.match(paymentDialog, /event\.preventDefault\(\)/);
  assert.match(paymentDialog, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
});

test('mobile-money payments require and submit provider, phone, and transaction reference', () => {
  assert.match(paymentDialog, /mobileProvider: method === 'mobile_money' \? mobileProvider/);
  assert.match(paymentDialog, /phoneNumber: method === 'mobile_money' \? phoneNumber/);
  assert.match(paymentDialog, /transactionId: \['mobile_money', 'card'\]\.includes\(method\)/);
  assert.match(paymentDialog, /provider, phone number, and transaction ID/);
});
