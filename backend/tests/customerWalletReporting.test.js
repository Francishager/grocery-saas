import test from 'node:test';
import assert from 'node:assert/strict';
import { customerWalletDepositReferenceKeys, customerWalletWithdrawalReferenceKeys, isCustomerWalletDeposit, isCustomerWalletDepositMovement, isCustomerWalletWithdrawalMovement } from '../src/utils/customerWalletReporting.js';

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
