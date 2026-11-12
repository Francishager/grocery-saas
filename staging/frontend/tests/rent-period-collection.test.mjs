import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/PropertyManagementPage.tsx', import.meta.url), 'utf8')
const backend = readFileSync(new URL('../../backend/src/routes/propertyManagement.js', import.meta.url), 'utf8')

test('rent collection selects explicit periods and sends them to the payment endpoint', () => {
  assert.match(source, /Rent periods to settle/)
  assert.match(source, /selectedPeriods: selectedRentPeriods, advanceMonths: rentAdvanceMonths/)
  assert.match(backend, /const selectedPeriods = Array\.isArray\(req\.body\?\.selectedPeriods\)/)
  assert.match(backend, /where: \{ tenantId, tenancyId: tenancy\.id, period: \{ in: selectedPeriods \} \}/)
})

test('rent payment allocation is bounded by selected charges and explicitly declared advances', () => {
  assert.match(backend, /allocateRentPaymentToPeriods\(\{ amount, charges, advanceCapacity \}\)/)
  assert.match(backend, /if \(allocation\.error\) throw Object\.assign\(new Error\(allocation\.error\)/)
  assert.match(source, /Unselected arrears stay outstanding/)
  assert.match(source, /Held as rent advance/)
})

test('rent collection modal keeps a visible close control while its content scrolls on mobile', () => {
  assert.match(source, /aria-label="Close dialog"/)
  assert.match(source, /sticky top-0 z-10/)
  assert.match(source, /min-h-0 overflow-y-auto/)
})
