import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { ACCESS_TOKEN_TTL_SECONDS, createSessionTokens } from '../src/utils/sessionTokens.js'

test('session tokens provide an eight-hour access token and a rolling 30-day refresh token', () => {
  const secret = 'test-session-secret-with-enough-entropy'
  const tokens = createSessionTokens({ id: 'user-1', tenantId: 'tenant-1' }, secret)
  const access = jwt.verify(tokens.accessToken, secret)
  const refresh = jwt.verify(tokens.refreshToken, secret)

  assert.equal(tokens.expiresIn, ACCESS_TOKEN_TTL_SECONDS)
  assert.equal(access.exp - access.iat, 8 * 60 * 60)
  assert.equal(refresh.exp - refresh.iat, 30 * 24 * 60 * 60)
  assert.equal(refresh.type, 'refresh')
  assert.equal(refresh.id, 'user-1')
})

test('refresh tokens retain the selected tenant so refresh cannot silently switch books', () => {
  const secret = 'test-secret-for-session-token-claims'
  const tokens = createSessionTokens({ id: 'user-1', tenantId: 'tenant-b', activeTenantId: 'tenant-b' }, secret)
  const claims = jwt.verify(tokens.refreshToken, secret)
  assert.equal(claims.id, 'user-1')
  assert.equal(claims.tenantId, 'tenant-b')
  assert.equal(claims.activeTenantId, 'tenant-b')
})

test('legacy sessions without a selected tenant remain compatible', () => {
  const secret = 'test-secret-for-session-token-claims'
  const tokens = createSessionTokens({ id: 'user-1' }, secret)
  const claims = jwt.verify(tokens.refreshToken, secret)
  assert.equal(claims.id, 'user-1')
  assert.equal(claims.tenantId, null)
  assert.equal(claims.activeTenantId, null)
})
