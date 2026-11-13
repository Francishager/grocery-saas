import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildOwnerWelcomeEmail } from '../src/services/ownerWelcomeEmail.js'

test('new owner welcome email has a warm product introduction and first-sign-in details', () => {
  const email = buildOwnerWelcomeEmail({
    ownerFname: 'Nancy', businessName: 'Nancy Stores', businessId: 'biz-123',
    tempPassword: 'Temp&Pass', otp: '123456', loginUrl: 'https://example.com/login',
  })
  assert.match(email.subject, /Welcome to JibuSales/)
  assert.match(email.html, /Welcome, Nancy!/)
  assert.match(email.html, /sales, stock, customers, cashflow, and business reports/)
  assert.match(email.html, /Temp&amp;Pass/)
  assert.match(email.html, /123456/)
  assert.match(email.html, /Open JibuSales/)
})

test('existing owner welcome keeps current credentials and explains the business switcher without new credentials', () => {
  const email = buildOwnerWelcomeEmail({
    ownerFname: 'Nancy', businessName: 'Second Store', businessId: 'biz-456',
    tempPassword: null, otp: null, loginUrl: 'https://example.com/login', existingAccount: true,
  })
  assert.match(email.subject, /Welcome to JibuSales/)
  assert.match(email.html, /Welcome back, Nancy!/)
  assert.match(email.html, /Your existing JibuSales sign-in remains the same/)
  assert.match(email.html, /business switcher/)
  assert.doesNotMatch(email.html, /Temporary password|One-time setup code/)
})

test('welcome email escapes user-controlled HTML and all owner creation routes use the shared template', async () => {
  const email = buildOwnerWelcomeEmail({
    ownerFname: '<script>alert(1)</script>', businessName: '<img src=x onerror=alert(1)>',
    businessId: 'x" onclick="alert(1)', tempPassword: 'pass', otp: '123456', loginUrl: 'https://example.com/login',
  })
  assert.doesNotMatch(email.html, /<script>|<img src=x/)
  const adminRoutes = await readFile(new URL('../src/routes/admin.js', import.meta.url), 'utf8')
  assert.equal((adminRoutes.match(/buildOwnerWelcomeEmail\(/g) || []).length, 3)
  assert.match(adminRoutes, /existingAccount: reuseOwnerAccount/)
})
