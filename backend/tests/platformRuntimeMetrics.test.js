import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlatformRuntimeMetrics } from '../src/utils/platformRuntimeMetrics.js'

test('runtime metrics summarize rolling request counts, errors, latency, and route templates', () => {
  const start = 1_800_000_000_000
  const metrics = createPlatformRuntimeMetrics({ now: () => start })
  metrics.record({ method: 'get', route: '/api/sales/:saleId', statusCode: 200, durationMs: 18, at: start })
  metrics.record({ method: 'post', route: '/api/sales', statusCode: 500, durationMs: 2200, at: start + 1000 })
  metrics.record({ method: 'get', route: '/api/customers', statusCode: 403, durationMs: 45, at: start + 2000 })

  const snapshot = metrics.snapshot(start + 3000, 5)
  assert.equal(snapshot.requests, 3)
  assert.equal(snapshot.clientErrors, 1)
  assert.equal(snapshot.serverErrors, 1)
  assert.equal(snapshot.serverErrorRatePercent, 33.33)
  assert.equal(snapshot.p95Ms, 2500)
  assert.equal(snapshot.slowRoutes[0].route, 'POST /api/sales')
  assert.equal(snapshot.slowRoutes[0].p95Ms, 2500)
})

test('runtime metrics expire data outside the selected time window', () => {
  const start = 1_800_000_000_000
  const metrics = createPlatformRuntimeMetrics({ now: () => start, maxMinutes: 60 })
  metrics.record({ method: 'get', route: '/api/old', statusCode: 200, durationMs: 10, at: start })
  metrics.record({ method: 'get', route: '/api/new', statusCode: 200, durationMs: 10, at: start + 6 * 60_000 })

  const snapshot = metrics.snapshot(start + 6 * 60_000, 5)
  assert.equal(snapshot.requests, 1)
  assert.equal(snapshot.slowRoutes[0].route, 'GET /api/new')
})
