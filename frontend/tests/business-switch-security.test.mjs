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
  assert.match(app, /user\?\.role !== 'owner' \|\| isPlatformUser\(\)/)
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
  assert.doesNotMatch(auth, /Complete account security setup before switching businesses\./)
})

test('security enrollment is server-scoped to owners with multiple businesses and requires a configured method', async () => {
  const service = await read('../../backend/src/services/userSecurity.js')
  const middleware = await read('../../backend/middleware/auth.js')
  const auth = await read('../src/contexts/JWTAuthContext.tsx')
  assert.match(service, /requiresBusinessSwitchSecurity/)
  assert.match(service, /role !== 'owner'/)
  assert.match(service, /prisma\.tenant\.findMany\(\{ where: \{ ownerId: id \}/)
  assert.match(service, /businessIds\.size > 1/)
  assert.match(service, /hasBusinessSwitchSecuritySetup/)
  assert.match(middleware, /await requiresBusinessSwitchSecurity\(currentUser\) && !hasBusinessSwitchSecuritySetup\(currentUser\)/)
  assert.match(middleware, /securityRequired && !isSecurityEndpoint/)
  assert.match(auth, /fetch\(`\$\{resolvedApiEndpoint\}\/security\/status`/)
})

test('fresh server-scoped security status avoids a verification screen for single-business users', async () => {
  const app = await read('../src/App.tsx')
  const auth = await read('../src/contexts/JWTAuthContext.tsx')
  assert.match(auth, /securityScopeVersion\?: number/)
  assert.match(app, /user\.securityScopeVersion === 1/)
  assert.match(app, /if \(!user\.securitySetupRequired\) return <>{children}<\/>/)
})
