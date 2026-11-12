const DURATION_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, Infinity]
const WINDOW_MINUTES = 60
const MAX_ROUTE_LABELS = 80

function createCounter() {
  return {
    requests: 0,
    clientErrors: 0,
    serverErrors: 0,
    durationSumMs: 0,
    durationHistogram: Array(DURATION_BUCKETS_MS.length).fill(0),
    routes: new Map(),
  }
}

function addDuration(counter, durationMs) {
  const index = DURATION_BUCKETS_MS.findIndex((limit) => durationMs <= limit)
  counter.durationHistogram[index < 0 ? DURATION_BUCKETS_MS.length - 1 : index] += 1
}

function summarizeCounter(counter) {
  const target = Math.ceil(counter.requests * 0.95)
  let seen = 0
  let p95Ms = 0
  for (let index = 0; index < counter.durationHistogram.length; index += 1) {
    seen += counter.durationHistogram[index]
    if (seen >= target && target > 0) {
      p95Ms = Number.isFinite(DURATION_BUCKETS_MS[index]) ? DURATION_BUCKETS_MS[index] : 5000
      break
    }
  }

  const routes = [...counter.routes.entries()]
    .map(([route, stats]) => ({
      route,
      requests: stats.requests,
      averageMs: Math.round(stats.durationSumMs / Math.max(1, stats.requests)),
      p95Ms: summarizeCounter(stats).p95Ms,
    }))
    .sort((a, b) => b.p95Ms - a.p95Ms || b.averageMs - a.averageMs)
    .slice(0, 5)

  return {
    requests: counter.requests,
    clientErrors: counter.clientErrors,
    serverErrors: counter.serverErrors,
    serverErrorRatePercent: counter.requests ? Number((counter.serverErrors / counter.requests * 100).toFixed(2)) : 0,
    averageMs: counter.requests ? Math.round(counter.durationSumMs / counter.requests) : 0,
    p95Ms,
    slowRoutes: routes,
  }
}

export function createPlatformRuntimeMetrics({ now = Date.now, maxMinutes = WINDOW_MINUTES } = {}) {
  const buckets = new Map()

  function getBucket(minute) {
    if (!buckets.has(minute)) buckets.set(minute, createCounter())
    return buckets.get(minute)
  }

  function record({ method = 'OTHER', route = 'other', statusCode = 0, durationMs = 0, at = now() }) {
    const minute = Math.floor(at / 60_000)
    const current = getBucket(minute)
    const duration = Math.max(0, Number(durationMs) || 0)
    const status = Number(statusCode) || 0
    current.requests += 1
    current.clientErrors += status >= 400 && status < 500 ? 1 : 0
    current.serverErrors += status >= 500 ? 1 : 0
    current.durationSumMs += duration
    addDuration(current, duration)

    const label = `${String(method).toUpperCase().slice(0, 10)} ${String(route).slice(0, 120)}`
    const routeKey = current.routes.has(label) || current.routes.size < MAX_ROUTE_LABELS ? label : 'OTHER routes'
    if (!current.routes.has(routeKey)) current.routes.set(routeKey, createCounter())
    const routeStats = current.routes.get(routeKey)
    routeStats.requests += 1
    routeStats.durationSumMs += duration
    addDuration(routeStats, duration)

    const oldestMinute = minute - maxMinutes + 1
    for (const key of buckets.keys()) if (key < oldestMinute) buckets.delete(key)
  }

  function snapshot(at = now(), minutes = 5) {
    const endMinute = Math.floor(at / 60_000)
    const startMinute = endMinute - Math.max(1, minutes) + 1
    const combined = createCounter()
    for (const [minute, bucket] of buckets) {
      if (minute < startMinute || minute > endMinute) continue
      combined.requests += bucket.requests
      combined.clientErrors += bucket.clientErrors
      combined.serverErrors += bucket.serverErrors
      combined.durationSumMs += bucket.durationSumMs
      bucket.durationHistogram.forEach((count, index) => { combined.durationHistogram[index] += count })
      for (const [route, stats] of bucket.routes) {
        if (!combined.routes.has(route)) combined.routes.set(route, createCounter())
        const target = combined.routes.get(route)
        target.requests += stats.requests
        target.durationSumMs += stats.durationSumMs
        stats.durationHistogram.forEach((count, index) => { target.durationHistogram[index] += count })
      }
    }
    return summarizeCounter(combined)
  }

  return { record, snapshot }
}

export const platformRuntimeMetrics = createPlatformRuntimeMetrics()

export function platformRuntimeMetricsMiddleware(req, res, next) {
  const startedAt = performance.now()
  res.once('finish', () => {
    const requestPath = String(req.originalUrl || '').split('?')[0]
    if (requestPath === '/api/health' || requestPath === '/api/health/ready' || requestPath === '/api/platform/runtime-health') return
    const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched'
    platformRuntimeMetrics.record({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: performance.now() - startedAt,
    })
  })
  next()
}
