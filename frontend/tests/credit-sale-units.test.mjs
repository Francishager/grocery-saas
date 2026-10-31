import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../src/pages/receivables/ReceivablesPage.tsx', import.meta.url)), 'utf8')

test('credit sale form offers saved product selling units and uses their configured prices', () => {
  assert.match(source, /const sellingUnits = selectedItem\?\.units \|\| \[\]/)
  assert.match(source, /sellingUnits\.map\(\(unit: any\)/)
  assert.match(source, /unitName: selectedUnit\.unitName, price: String\(selectedUnit\.sellingPrice\)/)
  assert.match(source, /unitName: item\.unitName \|\| null/)
  assert.match(source, /disabled=\{Boolean\(item\.unitName\)\}/)
})

test('credit sale invoice print and download preserve the selected selling unit', () => {
  assert.match(source, /item\?\.unitName \? ` \(\$\{item\.unitName\}\)`/)
  assert.match(source, /item\.unitName \? ` \$\{item\.unitName\}`/)
})
