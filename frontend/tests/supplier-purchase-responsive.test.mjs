import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/receivables/PayablesPage.tsx', import.meta.url), 'utf8')
const purchaseRoute = readFileSync(new URL('../../backend/routes/payables.js', import.meta.url), 'utf8')

test('supplier purchase item rows constrain selected labels and stack on narrow screens', () => {
  assert.match(source, /grid min-w-0 w-full grid-cols-1 gap-3 sm:grid-cols-\[minmax\(0,1fr\)_6rem_minmax\(0,8\.75rem\)_2\.5rem\]/)
  assert.match(source, /containerClassName="min-w-0 w-full"[\s\S]*?className="h-10 min-w-0 w-full border-input/)
  assert.match(source, /overflow-x-hidden overflow-y-auto rounded-lg bg-white p-4 sm:p-6/)
})

test('recorded supplier purchases increment tracked inventory and refresh product data', () => {
  assert.match(purchaseRoute, /if \(product && product\.itemType === 'service'\) continue[\s\S]*?quantity:\s*\{\s*increment:\s*item\.quantity\s*\}/)
  assert.match(source, /await Promise\.all\(\[loadPurchases\(\), loadProducts\(\)\]\)/)
  assert.match(source, /Purchase recorded\. Stock-tracked item quantities have been added to inventory\./)
})
