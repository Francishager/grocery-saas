import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const receivablesPage = readFileSync(fileURLToPath(new URL('../src/pages/receivables/ReceivablesPage.tsx', import.meta.url)), 'utf8');
const customerProfile = readFileSync(fileURLToPath(new URL('../src/components/customer/CustomerTransactionHistoryDialog.tsx', import.meta.url)), 'utf8');

test('receivables customer payments use the profile or sale branch for backend scoping', () => {
  assert.match(customerProfile, /branchId\?: string \| null/);
  assert.match(receivablesPage, /branchId: selectedSale\?\.branchId \|\| selectedSale\?\.branch\?\.id \|\| targetCustomer\.branchId \|\| undefined/);
});
