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
