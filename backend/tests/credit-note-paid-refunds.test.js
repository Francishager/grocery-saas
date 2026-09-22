import test from 'node:test';
import assert from 'node:assert/strict';
import { creditNotePaidRefundSlice } from '../routes/credit-debit-notes.js';

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
