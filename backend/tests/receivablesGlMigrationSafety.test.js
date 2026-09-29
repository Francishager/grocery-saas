import test from 'node:test'
import assert from 'node:assert/strict'
import { findPotentialLegacyJournalMatches } from '../src/services/receivablesGlMigrationSafety.js'

test('migration blocks a legacy journal with the same source reference', () => {
  const action = { sourceType: 'POS_SALE', sourceId: 'sale-1', reference: 'RCP-100' }
  const entries = [{ id: 'journal-1', sourceType: 'GENERAL_JOURNAL', sourceId: 'manual-1', reference: 'RCP-100' }]
  assert.deepEqual(findPotentialLegacyJournalMatches(action, entries).map((entry) => entry.id), ['journal-1'])
})

test('migration allows the corresponding invoice/receipt pair to share a reference', () => {
  const action = { sourceType: 'CUSTOMER_RECEIPT', sourceId: 'payment-1', reference: 'SALE-100' }
  const entries = [{ id: 'sale-journal', sourceType: 'RECEIVABLE_SALE', sourceId: 'sale-1', reference: 'SALE-100' }]
  assert.deepEqual(findPotentialLegacyJournalMatches(action, entries), [])
})

test('migration catches duplicate payment references and source-id collisions', () => {
  const action = { sourceType: 'CUSTOMER_RECEIPT', sourceId: 'payment-2', reference: 'PMT-200' }
  const entries = [
    { id: 'duplicate-payment', sourceType: 'CUSTOMER_RECEIPT', sourceId: 'payment-1', reference: 'PMT-200' },
    { id: 'same-source-id', sourceType: 'GENERAL_JOURNAL', sourceId: 'payment-2', reference: 'unrelated' },
  ]
  assert.deepEqual(findPotentialLegacyJournalMatches(action, entries).map((entry) => entry.id), ['duplicate-payment', 'same-source-id'])
})

test('an exact matching source journal is handled as an existing source, not a legacy collision', () => {
  const action = { sourceType: 'POS_SALE', sourceId: 'sale-1', reference: 'RCP-100' }
  assert.deepEqual(findPotentialLegacyJournalMatches(action, [{ sourceType: 'POS_SALE', sourceId: 'sale-1', reference: 'RCP-100' }]), [])
})
