import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const sales = read('../src/routes/sales.js')
const receivables = read('../routes/receivables.js')
const inventory = read('../src/routes/inventory.js')
const featureCatalog = read('../prisma/seed-features.js')

test('Multi-UOM sales charge the configured selling-unit price and deduct base-unit stock', () => {
  assert.match(sales, /effectivePrice = unit\.sellingPrice/)
  assert.match(sales, /baseQty = item\.quantity \* unit\.conversionFactor/)
  assert.match(sales, /quantity: \{ decrement: item\.baseQty \}/)
  assert.match(receivables, /const baseQty = quantity \* normalizedConversionFactor/)
})

test('Multi-UOM is a separately controllable SaaS feature and unit endpoints are gated', () => {
  assert.match(featureCatalog, /name: 'inventory\.multi_unit'/)
  assert.match(inventory, /router\.get\("\/:productId\/units", authenticateToken, requireFeature\('inventory\.multi_unit'\)/)
  assert.match(inventory, /router\.post\("\/:productId\/units", authenticateToken, requireFeature\('inventory\.multi_unit'\)/)
  assert.match(inventory, /router\.put\("\/:productId\/units\/\:unitId", authenticateToken, requireFeature\('inventory\.multi_unit'\)/)
  assert.match(inventory, /router\.delete\("\/:productId\/units\/\:unitId", authenticateToken, requireFeature\('inventory\.multi_unit'\)/)
  assert.match(sales, /usesSellingUnits && !hasFeatureAccess\(await getTenantFeatures\(scope\.tenantId\), 'inventory\.multi_unit'\)/)
  assert.match(receivables, /items\.some\(\(item\) => Boolean\(item\.unitName\)\).*inventory\.multi_unit/s)
})
