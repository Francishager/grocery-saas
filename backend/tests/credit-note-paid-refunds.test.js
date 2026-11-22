import test from 'node:test';
import assert from 'node:assert/strict';
import { creditNotePaidRefundSlice } from '../routes/credit-debit-notes.js';
import { unappliedCreditNoteAmount } from '../src/utils/customerBalance.js';

test('credit notes refund only the paid portion after clearing unpaid receivable balance', () => {
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 40, previousCredit: 0, noteAmount: 20 }), 0);
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 40, previousCredit: 0, noteAmount: 60 }), 0);
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 40, previousCredit: 0, noteAmount: 80 }), 20);
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 40, previousCredit: 60, noteAmount: 40 }), 40);
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 40, previousCredit: 90, noteAmount: 30 }), 10);
});

test('credit notes never refund more than the sale amount paid', () => {
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 40, previousCredit: 0, noteAmount: 200 }), 40);
  assert.equal(creditNotePaidRefundSlice({ saleTotal: 100, amountPaid: 0, previousCredit: 0, noteAmount: 100 }), 0);
});

test('paid credit-note amounts are not left available to clear another receivable after wallet or cash settlement', () => {
  const note = { effectiveAmount: 100, refundAmount: 25, walletAmount: 35 };
  assert.equal(unappliedCreditNoteAmount(note), 40);
  assert.equal(unappliedCreditNoteAmount(note, 15), 25);
});

test('applying a paid credit-note portion to another sale consumes that portion exactly once', () => {
  assert.equal(unappliedCreditNoteAmount({ effectiveAmount: 80 }, 30), 50);
});
