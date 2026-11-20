import test from 'node:test';
import assert from 'node:assert/strict';
import { customerWalletDepositReferenceKeys, customerWalletReclassificationStatementRow, customerWalletTransactionsWithBalances, customerWalletWithdrawalReferenceKeys, isCustomerWalletDeposit, isCustomerWalletDepositMovement, isCustomerWalletWithdrawalMovement } from '../src/utils/customerWalletReporting.js';

test('wallet deposit detection uses its explicit allocation target', () => {
  assert.equal(isCustomerWalletDeposit({ allocations: [{ targetType: 'customer_wallet' }] }), true);
  assert.equal(isCustomerWalletDeposit({ allocations: [{ targetType: 'sale' }] }), false);
  assert.equal(isCustomerWalletDeposit({ allocations: [] }), false);
});

test('wallet deposit cash movements match payment IDs and references', () => {
  const references = customerWalletDepositReferenceKeys([
    { id: 'payment-1', reference: 'WALLET-1', transactionId: 'txn-1', allocations: [{ targetType: 'customer_wallet' }] },
    { id: 'payment-2', allocations: [{ targetType: 'sale' }] },
  ]);
  assert.equal(isCustomerWalletDepositMovement({ id: 'cash-1', reference: 'WALLET-1' }, references), true);
  assert.equal(isCustomerWalletDepositMovement({ id: 'cash-2', reference: 'payment-1' }, references), true);
  assert.equal(isCustomerWalletDepositMovement({ id: 'cash-3', reference: 'payment-2' }, references), false);
});

test('wallet withdrawal cash movements match the linked withdrawal reference', () => {
  const references = customerWalletWithdrawalReferenceKeys([
    { id: 'withdrawal-1', reference: 'WD-100' },
  ]);
  assert.equal(isCustomerWalletWithdrawalMovement({ id: 'cash-1', reference: 'WD-100' }, references), true);
  assert.equal(isCustomerWalletWithdrawalMovement({ id: 'cash-2', reference: 'other' }, references), false);
});

test('statement reclassification reconciles a migrated customer credit without recording cash', () => {
  const customer = { id: 'customer-1', openingBalance: -120000, createdAt: new Date('2025-01-01T00:00:00Z') };
  const wallet = { migratedLegacyAmount: 120000, createdAt: new Date('2025-06-01T00:00:00Z') };
  const row = customerWalletReclassificationStatementRow(customer, wallet);

  assert.equal(row.debit, 120000);
  assert.equal(row.credit, 0);
  assert.match(row.description, /no cash was received/);
  assert.equal(customer.openingBalance + row.debit - row.credit, 0);
  assert.equal(customerWalletReclassificationStatementRow(customer, { migratedLegacyAmount: 0 }), null);
});

test('wallet statement rows show their own running balance without affecting receivables', () => {
  const rows = customerWalletTransactionsWithBalances([
    { id: 'withdrawal', direction: 'out', amount: 15 },
    { id: 'deposit', direction: 'in', amount: 50 },
    { id: 'opening', direction: 'in', amount: 100 },
  ], 135);

  assert.deepEqual(rows.map((row) => row.balanceAfter), [135, 150, 100]);
});
