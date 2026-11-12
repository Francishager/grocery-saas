import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const receivablesRoute = readFileSync(fileURLToPath(new URL('../routes/receivables.js', import.meta.url)), 'utf8')
const propertyRoute = readFileSync(fileURLToPath(new URL('../src/routes/propertyManagement.js', import.meta.url)), 'utf8')

test('customer payment notes are included in customer history receipt data', () => {
  assert.match(receivablesRoute, /notes: payment\.notes \|\| null/)
})

test('renter payment mobile-money details are included in renter history receipt data', () => {
  assert.match(propertyRoute, /mobileProvider: payment\.mobileProvider, phoneNumber: payment\.phoneNumber/)
})
