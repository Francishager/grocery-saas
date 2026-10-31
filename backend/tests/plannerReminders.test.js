import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverDuePlannerReminders } from '../src/services/plannerReminders.js'

test('planner reminder query excludes non-tenant notes without invalid null filters', async () => {
  let query
  const result = await deliverDuePlannerReminders({
    prismaClient: {
      stickyNote: { findMany: async (args) => { query = args; return [] } },
    },
  })

  assert.deepEqual(result, { delivered: 0 })
  assert.deepEqual(query.where, { title: '__JIBUSALES_PLANNER_DATA__', tenantId: { not: '' } })
})
