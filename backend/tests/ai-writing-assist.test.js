import test from 'node:test';
import assert from 'node:assert/strict';
import { sensitivePattern } from '../src/routes/aiWritingAssist.js';

test('writing prompt guard rejects common private data formats', () => {
  for (const value of ['contact a@example.com', 'call 0771234567', 'UGX 450,000', 'bank account ending 1234']) {
    assert.equal(sensitivePattern.test(value), true, value);
  }
});

test('writing prompt guard permits generic instructions', () => {
  for (const value of ['Write a friendly follow-up after a product demonstration.', 'Make this reminder concise and professional.']) {
    assert.equal(sensitivePattern.test(value), false, value);
  }
});
