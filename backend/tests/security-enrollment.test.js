import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('only multi-business owners are gated from normal authenticated APIs, while security endpoints bypass the gate', async () => {
  const source = await read('../middleware/auth.js')
  const service = await read('../src/services/userSecurity.js')
  assert.match(source, /req\.baseUrl === '\/api\/auth' && String\(req\.path \|\| ''\)\.startsWith\('\/security\/'\)/)
  assert.match(source, /await requiresBusinessSwitchSecurity\(currentUser\) && !hasBusinessSwitchSecuritySetup\(currentUser\)/)
  assert.match(source, /securityRequired && !isSecurityEndpoint/)
  assert.match(source, /SECURITY_SETUP_REQUIRED/)
  assert.match(service, /role !== 'owner'/)
  assert.match(service, /prisma\.tenant\.findMany\(\{ where: \{ ownerId: id \}/)
  assert.match(service, /businessIds\.size > 1/)
  assert.match(service, /hasBusinessSwitchSecuritySetup/)
})

test('login and session user payloads include the server-computed security requirement', async () => {
  const source = await read('../src/routes/auth.js')
  assert.match(source, /async function userPayload/)
  assert.match(source, /const securitySetupRequired = await requiresBusinessSwitchSecurity\(user\) && !hasBusinessSwitchSecuritySetup\(user\)/)
  assert.match(source, /securityScopeVersion: 1/)
  assert.match(source, /user: await userPayload\(context\.sessionUser, userPerm, tenantFeatures\)/)
})

test('only eligible multi-business owners need passkey assertion or password confirmation to switch', async () => {
  const source = await read('../src/routes/auth.js')
  assert.match(source, /router\.post\('\/switch-business', authenticateToken, securityActionLimiter/)
  assert.match(source, /verifyBusinessSwitch\(req, baseUser, targetTenantId, req\.body\.securityAssertion\)/)
  assert.match(source, /bcrypt\.compare\(String\(req\.body\.confirmationPassword\), baseUser\.password\)/)
  assert.match(source, /targetTenantId !== baseUser\.tenantId && baseUser\.role === 'owner'/)
})

test('passkey assertions verify the challenge, exact origin, relying-party ID, user verification, and consume the challenge once', async () => {
  const source = await read('../src/services/userSecurity.js')
  assert.match(source, /expectedChallenge: challenge\.challenge/)
  assert.match(source, /expectedOrigin: challenge\.origin/)
  assert.match(source, /expectedRPID: challenge\.rpId/)
  assert.match(source, /requireUserVerification: true/)
  assert.match(source, /deleteMany\(\{ where: \{ id: challenge\.id, expiresAt: \{ gt: new Date\(\) \} \} \}\)/)
})

test('security schema bootstrap runs before the API starts and adds only security tables and nullable user fields', async () => {
  const [bootstrap, schema] = await Promise.all([
    read('../src/scripts/run-locked-schema-bootstrap.js'),
    read('../prisma/schema.prisma'),
  ])
  assert.match(bootstrap, /'ensure-user-security-schema\.js'/)
  assert.match(schema, /securitySetupCompletedAt\s+DateTime\?/)
  assert.match(schema, /model SecurityPasskey/)
  assert.match(schema, /model UserSecurityChallenge/)
})
