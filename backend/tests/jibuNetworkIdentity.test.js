import test from 'node:test';
import assert from 'node:assert/strict';
import { createJibuId, isValidJibuId, normalizeJibuId } from '../src/services/jibuNetworkIdentity.js';

test('JibuSales IDs include a country code and exactly ten digits, preserving leading zeroes', () => {
  assert.equal(isValidJibuId('+2560123456789'), true);
  assert.equal(isValidJibuId('+2560000000000'), true);
  assert.equal(isValidJibuId('+2569876543210'), true);
  assert.equal(isValidJibuId('+25612345678'), false);
  assert.equal(isValidJibuId('+256123456789'), false);
  assert.equal(isValidJibuId('0123456789'), false);
  assert.equal(isValidJibuId('+9991234567890'), false);
});

test('JibuSales ID normalization removes display formatting, not meaningful digits', () => {
  assert.equal(normalizeJibuId('+256 (012) 345-6789'), '+2560123456789');
  assert.equal(isValidJibuId('+256 (012) 345-6789'), true);
});

test('generated JibuSales ID has the exact country-code plus ten-digit format', () => {
  for (let i = 0; i < 100; i += 1) {
    const id = createJibuId('+256');
    assert.match(id, /^\+256\d{10}$/);
  }
  assert.throws(() => createJibuId('+999'));
});
