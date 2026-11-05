import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../src/pages/receivables/ReceivablesPage.tsx', import.meta.url)), 'utf8')

test('credit sale form offers saved product selling units and uses their configured prices', () => {
  assert.match(source, /hasFeature\('inventory\.multi_unit'\)/)
  assert.match(source, /const sellingUnits = multiUnitEnabled \? \(selectedItem\?\.units \|\| \[\]\) : \[\]/)
  assert.match(source, /sellingUnits\.map\(\(unit: any\)/)
  assert.match(source, /unitName: selectedUnit\.unitName, price: String\(selectedUnit\.sellingPrice\)/)
  assert.match(source, /unitName: item\.unitName \|\| null/)
  assert.match(source, /disabled=\{Boolean\(item\.unitName\)\}/)
})

test('credit sale cannot present saved selling units when the tenant lacks the SaaS feature', () => {
  assert.match(source, /multiUnitEnabled \? \(selectedItem\?\.units \|\| \[\]\) : \[\]/)
})

test('credit sale invoice print and download preserve the selected selling unit', () => {
  assert.match(source, /item\?\.unitName \? ` \(\$\{item\.unitName\}\)`/)
  assert.match(source, /item\.unitName \? ` \$\{item\.unitName\}`/)
})

test('credit sale add-item action follows the item rows instead of the section heading', () => {
  const sectionStart = source.indexOf('<Label>Items</Label>')
  const firstItemRow = source.indexOf('{saleItems.map((item, index) => {', sectionStart)
  const addAnotherItem = source.indexOf('Add another item', sectionStart)
  assert.ok(sectionStart >= 0)
  assert.ok(firstItemRow > sectionStart)
  assert.ok(addAnotherItem > firstItemRow)
  assert.doesNotMatch(source.slice(sectionStart, firstItemRow), /Add another item/)
})
