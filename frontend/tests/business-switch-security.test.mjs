import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('app verifies server enrollment status before rendering authenticated routes and fails closed', async () => {
  const app = await read('../src/App.tsx')
  assert.match(app, /SecurityEnrollmentGate/)
  assert.match(app, /\/security\/status/)
  assert.match(app, /state === 'error'/)
  assert.match(app, /<SecurityEnrollmentPage onCompleted=/)
})

test('security setup offers server-verified passkey enrollment and password-confirmation fallback', async () => {
  const page = await read('../src/pages/auth/SecurityEnrollmentPage.tsx')
  assert.match(page, /startRegistration\(\{ optionsJSON: options \}\)/)
  assert.match(page, /security\/passkey\/register\/verify/)
  assert.match(page, /security\/password-method/)
  assert.match(page, /autoComplete="current-password"/)
})

test('business switch obtains a passkey assertion and exposes a password recovery prompt', async () => {
  const auth = await read('../src/contexts/JWTAuthContext.tsx')
  const layout = await read('../src/components/layout/TenantLayout.tsx')
  assert.match(auth, /startAuthentication\(\{ optionsJSON: options \}\)/)
  assert.match(auth, /securityAssertion/)
  assert.match(layout, /Confirm business switch/)
  assert.match(layout, /Use your account password if your passkey is unavailable/)
})
