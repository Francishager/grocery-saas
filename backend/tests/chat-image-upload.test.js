import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validClientMessageId, verifiedChatImageMime } from '../src/utils/chatImageUpload.js';

test('chat image validation accepts only supported image signatures', () => {
  assert.equal(verifiedChatImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(verifiedChatImageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(verifiedChatImageMime(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(verifiedChatImageMime(Buffer.from('not an image')), null);
});

test('chat message idempotency accepts only version-four UUIDs', () => {
  assert.equal(validClientMessageId('f4ca7a04-ea9a-4bb5-b97e-07bf2c52af3e'), true);
  assert.equal(validClientMessageId('f4ca7a04-ea9a-1bb5-b97e-07bf2c52af3e'), false);
  assert.equal(validClientMessageId('not-a-uuid'), false);
});
