import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('app verifies server enrollment status before rendering authenticated routes and fails closed', async () => {
  const app = await read('../src/App.tsx')
  assert.match(app, /SecurityEnrollmentGate/)
  assert.match(app, /user\?\.role === 'owner' \|\| Boolean\(user\?\.securitySetupRequired\)/)
  assert.match(app, /\/security\/status/)
  assert.match(app, /state === 'error'/)
  assert.match(app, /<SecurityEnrollmentPage onCompleted=/)
  assert.match(app, /!shouldCheckSecurity \|\| isPlatformUser\(\)/)
})

test('security setup offers server-verified passkey enrollment and password-confirmation fallback', async () => {
  const page = await read('../src/pages/auth/SecurityEnrollmentPage.tsx')
  assert.match(page, /startRegistration\(\{ optionsJSON: options \}\)/)
  assert.match(page, /security\/passkey\/register\/verify/)
  assert.match(page, /security\/password-method/)
  assert.match(page, /autoComplete="current-password"/)
})

test('Android app bridges passkey enrollment and authentication to native Credential Manager', async () => {
  const app = await read('../../mobile/src/app/index.tsx')
  assert.match(app, /type:'passkey\.get'/)
  assert.match(app, /type:'passkey\.create'/)
  assert.match(app, /Passkey\.get\(request\.options as unknown as PasskeyGetRequest\)/)
  assert.match(app, /Passkey\.create\(request\.options as unknown as PasskeyCreateRequest\)/)
  const getPasskey = app.slice(app.indexOf("if (request.type === 'passkey.get')"), app.indexOf("} else if (request.type === 'passkey.create')"))
  assert.match(getPasskey, /request\.options\.userVerification !== 'required'/)
  assert.match(getPasskey, /LocalAuthentication\.authenticateAsync\([\s\S]*disableDeviceFallback: true[\s\S]*biometricsSecurityLevel: 'strong'/)
  assert.ok(getPasskey.indexOf('if (!biometric.success) throw') < getPasskey.indexOf('Passkey.get('))
  assert.match(getPasskey, /assertion\.response\?\.signature/)
})

test('Android Digital Asset Links associates the app with the JibuSales passkey origin', async () => {
  const links = JSON.parse(await read('../public/.well-known/assetlinks.json'))
  assert.ok(links.some((entry) =>
    entry.relation.includes('delegate_permission/common.get_login_creds') &&
    entry.target.namespace === 'android_app' &&
    entry.target.package_name === 'com.jibusales.app' &&
    entry.target.sha256_cert_fingerprints.includes('8F:9F:AC:5C:60:51:B4:7A:C5:10:23:CC:15:1A:FC:2D:4C:FC:F8:E4:39:5D:C7:1B:AA:D7:D1:64:2A:B8:1C:01')
  ))
})

test('business switch offers native passkey verification and a password fallback', async () => {
  const auth = await read('../src/contexts/JWTAuthContext.tsx')
  const layout = await read('../src/components/layout/TenantLayout.tsx')
  assert.match(auth, /startAuthentication\(\{ optionsJSON: options as Parameters/)
  assert.match(auth, /securityAssertion/)
  assert.match(auth, /JibuNativePasskey\?\.get/)
  assert.match(auth, /authenticateWithBusinessPasskey\(options\)/)
  assert.match(auth, /const statusResponse = await fetch\(`\$\{resolvedApiEndpoint\}\/security\/status`/)
  assert.match(layout, /JibuSales needs to verify it’s you/)
  assert.match(layout, /Confirm your identity with a biometric or your JibuSales password/)
  assert.match(layout, /Verify with fingerprint \/ biometric/)
  assert.match(layout, /if \(!confirmationPassword && !usePasskey\) \{\s*setPendingBusinessTarget\(nextTenantId\)/)
  assert.doesNotMatch(auth, /Complete account security setup before switching businesses\./)
})

test('server refuses to switch unless the assertion has a fresh challenge and verified user presence', async () => {
  const security = await read('../../backend/src/services/userSecurity.js')
  const route = await read('../../backend/src/routes/auth.js')
  assert.match(security, /purpose: 'business-switch', targetTenantId, expiresAt: \{ gt: new Date\(\) \}/)
  assert.match(security, /requireUserVerification: true/)
  assert.match(security, /!result\.verified \|\| !result\.authenticationInfo\.userVerified/)
  assert.match(security, /Business-switch confirmation was already used/)
  assert.match(route, /if \(req\.body\?\.securityAssertion\) \{\s*await verifyBusinessSwitch/)
  assert.match(route, /else if \(req\.body\?\.confirmationPassword && await bcrypt\.compare/)
  assert.match(route, /Passkey confirmation failed\. Use your account password to recover this switch/)
})

test('security enrollment is server-scoped to owners with multiple businesses and requires a configured method', async () => {
  const service = await read('../../backend/src/services/userSecurity.js')
  const middleware = await read('../../backend/middleware/auth.js')
  const auth = await read('../src/contexts/JWTAuthContext.tsx')
  assert.match(service, /requiresBusinessSwitchSecurity/)
  assert.match(service, /hasOwnerRelationship = role === 'owner' \|\| memberships\.length > 0 \|\| ownedTenants\.length > 0/)
  assert.match(service, /prisma\.tenant\.findMany\(\{ where: \{ ownerId: id \}/)
  assert.match(service, /businessIds\.size > 1/)
  assert.match(service, /hasBusinessSwitchSecuritySetup/)
  assert.match(middleware, /await requiresBusinessSwitchSecurity\(currentUser\) && !hasBusinessSwitchSecuritySetup\(currentUser\)/)
  assert.match(middleware, /securityRequired && !isSecurityEndpoint/)
  const route = await read('../../backend/src/routes/auth.js')
  assert.match(route, /const context = await getTenantSessionContext\(baseUser, targetTenantId\)/)
  assert.match(route, /const securityRequired = targetTenantId !== \(req\.user\.activeTenantId \|\| req\.user\.tenantId\)/)
  assert.match(auth, /fetch\(`\$\{resolvedApiEndpoint\}\/security\/status`/)
  assert.match(auth, /requireVerification && !securityMethod/)
  const enrollment = await read('../src/pages/auth/SecurityEnrollmentPage.tsx')
  assert.match(enrollment, /JibuNativePasskey\?\.create/)
  assert.match(enrollment, /nativeCreate\(options as Record<string, unknown>\)/)
  assert.match(auth, /if \(data\.code === 'SECURITY_SETUP_REQUIRED'\)/)
})

test('fresh server-scoped security status avoids a verification screen for single-business users', async () => {
  const app = await read('../src/App.tsx')
  const auth = await read('../src/contexts/JWTAuthContext.tsx')
  assert.match(auth, /securityScopeVersion\?: number/)
  assert.match(app, /user\.securityScopeVersion === 1/)
  assert.match(app, /if \(!user\.securitySetupRequired\) return <>{children}<\/>/)
  assert.ok(auth.indexOf('const updateUser = useCallback') < auth.indexOf('const switchBusiness = useCallback'))
})
