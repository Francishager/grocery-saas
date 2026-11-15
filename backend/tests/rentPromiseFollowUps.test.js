import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_PERMISSION_KEYS, PERMISSION_METADATA, permissionAllowedForTenant } from '../src/utils/permissions.js'

test('promise-note actions are individually permissioned for property-management plans', () => {
  const keys = ['canEditRentPromiseNotes', 'canAddRentPromiseFollowUps', 'canCompleteRentPromiseFollowUps']
  for (const key of keys) {
    assert.ok(ALL_PERMISSION_KEYS.includes(key))
    assert.ok(PERMISSION_METADATA[key]?.name)
    assert.equal(permissionAllowedForTenant(key, ['property_management.landlord']), true)
    assert.equal(permissionAllowedForTenant(key, []), false)
  }
  assert.equal(new Set(keys).size, keys.length)
})
