import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canViewPropertyNotification,
  isPropertyManagementNotification,
  isPropertySystemAccount,
  stripPropertySystemAccounts,
} from '../src/utils/propertyFeatureAccess.js'

test('property-specific notifications are identifiable for feature-aware delivery', () => {
  assert.equal(isPropertyManagementNotification({ metadata: { tenancyId: 'tenancy-1' } }), true)
  assert.equal(isPropertyManagementNotification({ metadata: { link: '/tenant/property-management/tenancies' } }), true)
  assert.equal(isPropertyManagementNotification({ metadata: { link: '/tenant/inventory' } }), false)
  assert.equal(isPropertyManagementNotification({ metadata: null }), false)
})

test('Property Management notifications respect the user permission set as well as feature access', () => {
  assert.equal(canViewPropertyNotification({ role: 'owner' }), true)
  assert.equal(canViewPropertyNotification({ role: 'staff' }, { canViewPropertyCollections: true }), true)
  assert.equal(canViewPropertyNotification({ role: 'staff' }, { canViewCustomer: true }), false)
})

test('only property-owned system accounts are hidden from shared account lists', () => {
  const propertyAccount = { id: 'pm', description: 'JibuSales property accounting role: rentIncome' }
  const ordinaryAccount = { id: 'ordinary', description: 'User-created rental income account' }
  assert.equal(isPropertySystemAccount(propertyAccount), true)
  assert.equal(isPropertySystemAccount(ordinaryAccount), false)
  assert.deepEqual(stripPropertySystemAccounts([propertyAccount, ordinaryAccount]), [
    { ...ordinaryAccount, parent: undefined, children: undefined },
  ])
})

test('property accounts nested in shared chart rows are removed when feature is unavailable', () => {
  const rows = [{
    id: 'income',
    description: null,
    parent: { id: 'pm-parent', description: 'JibuSales property accounting role: rentIncome' },
    children: [
      { id: 'pm-child', description: 'JibuSales property accounting role: rentIncome' },
      { id: 'normal-child', description: null },
    ],
  }]
  assert.deepEqual(stripPropertySystemAccounts(rows), [{
    id: 'income',
    description: null,
    parent: null,
    children: [{ id: 'normal-child', description: null }],
  }])
})
