import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const readSource = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const boundary = readSource('../src/components/AppErrorBoundary.tsx')
const tenantLayout = readSource('../src/components/layout/TenantLayout.tsx')
const adminLayout = readSource('../src/components/layout/SaaSAdminLayout.tsx')

test('a render failure is scoped to the active page and records its route for diagnosis', () => {
  assert.match(tenantLayout, /<AppErrorBoundary resetKey=\{location\.pathname\}><Outlet \/><\/AppErrorBoundary>/)
  assert.match(adminLayout, /<AppErrorBoundary resetKey=\{location\.pathname\}><Outlet \/><\/AppErrorBoundary>/)
  assert.match(boundary, /componentStack: info\.componentStack/)
  assert.match(boundary, /this\.props\.resetKey !== previousProps\.resetKey/)
})
