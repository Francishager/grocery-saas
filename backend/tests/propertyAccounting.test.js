import test from 'node:test'
import assert from 'node:assert/strict'
import {
  propertyDepositReceiptLines,
  propertyDepositRefundLines,
  propertyOpeningDepositLines,
  propertyOwnerPayoutLines,
  propertyRentChargeLines,
  propertyRentReceiptLines,
  propertySaleRecognitionLines,
  propertySalePaymentLines,
  propertySaleOwnerPayoutLines,
  propertyLandAcquisitionLines,
} from '../src/services/propertyAccountingService.js'
import { PERMISSION_METADATA, permissionAllowedForTenant, resolveEffectivePermissions } from '../src/utils/permissions.js'

const config = {
  rentReceivableAccountId: 'rent-ar',
  rentIncomeAccountId: 'rent-income',
  ownerPayableAccountId: 'owner-payable',
  depositLiabilityAccountId: 'deposit-liability',
  depositOpeningEquityAccountId: 'opening-equity',
  landSaleReceivableAccountId: 'plot-ar',
  landSaleRevenueAccountId: 'plot-revenue',
  landInventoryAccountId: 'land-inventory',
  landCostOfSalesAccountId: 'land-cogs',
  saleCommissionRevenueAccountId: 'commission-revenue',
  saleOwnerPayableAccountId: 'plot-owner-payable',
  landInventoryOpeningEquityAccountId: 'land-opening-equity',
}

function balanced(lines) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0)
  const credit = lines.reduce((sum, line) => sum + line.credit, 0)
  assert.equal(debit, credit)
}

test('rent charges recognize landlord income for a direct landlord and funds payable for a manager', () => {
  const landlord = propertyRentChargeLines(config, { amount: 125000, managed: false, description: 'June rent' })
  const manager = propertyRentChargeLines(config, { amount: 125000, managed: true, description: 'June rent' })
  assert.deepEqual(landlord.map(line => [line.accountId, line.debit, line.credit]), [['rent-ar', 125000, 0], ['rent-income', 0, 125000]])
  assert.deepEqual(manager.map(line => [line.accountId, line.debit, line.credit]), [['rent-ar', 125000, 0], ['owner-payable', 0, 125000]])
  balanced(landlord); balanced(manager)
})

test('owned plot sales recognize revenue, remove inventory at cost, and receipt settles receivable', () => {
  const sale = propertySaleRecognitionLines(config, { amount: 900000, commission: 0, costBasis: 500000, saleMode: 'principal', buyerName: 'Buyer', reference: 'P-1' })
  const receipt = propertySalePaymentLines(config, { amount: 250000, cashAccountLedgerId: 'cash', reference: 'R-1' })
  const acquisition = propertyLandAcquisitionLines(config, { amount: 500000, reference: 'PLOT-1' })
  assert.deepEqual(sale.map(line => [line.accountId, line.debit, line.credit]), [
    ['plot-ar', 900000, 0], ['plot-revenue', 0, 900000], ['land-cogs', 500000, 0], ['land-inventory', 0, 500000],
  ])
  assert.equal(receipt[1].accountId, 'plot-ar')
  assert.equal(acquisition[0].accountId, 'land-inventory')
  balanced(sale); balanced(receipt); balanced(acquisition)
})

test('brokered plot sale separates owner proceeds from earned commission', () => {
  const sale = propertySaleRecognitionLines(config, { amount: 1000000, commission: 100000, costBasis: 0, saleMode: 'brokered', buyerName: 'Buyer', reference: 'P-2' })
  const payout = propertySaleOwnerPayoutLines(config, { amount: 900000, cashAccountLedgerId: 'cash', reference: 'OWN-1' })
  assert.deepEqual(sale.map(line => [line.accountId, line.debit, line.credit]), [
    ['plot-ar', 1000000, 0], ['plot-owner-payable', 100000, 0], ['plot-owner-payable', 0, 1000000], ['commission-revenue', 0, 100000],
  ])
  assert.equal(payout[0].accountId, 'plot-owner-payable')
  balanced(sale); balanced(payout)
})

test('rent receipts and landlord payouts settle their respective control accounts', () => {
  const receipt = propertyRentReceiptLines(config, { amount: 50000, cashAccountLedgerId: 'cash', reference: 'R-1' })
  const payout = propertyOwnerPayoutLines(config, { amount: 50000, cashAccountLedgerId: 'cash', reference: 'P-1' })
  assert.deepEqual(receipt.map(line => [line.accountId, line.debit, line.credit]), [['cash', 50000, 0], ['rent-ar', 0, 50000]])
  assert.deepEqual(payout.map(line => [line.accountId, line.debit, line.credit]), [['owner-payable', 50000, 0], ['cash', 0, 50000]])
  balanced(receipt); balanced(payout)
})

test('tenant deposits remain liabilities on receipt, opening migration, and refund', () => {
  const receipt = propertyDepositReceiptLines(config, { amount: 30000, cashAccountLedgerId: 'cash', reference: 'D-1' })
  const opening = propertyOpeningDepositLines(config, { amount: 30000, reference: 'D-1' })
  const refund = propertyDepositRefundLines(config, { amount: 30000, cashAccountLedgerId: 'cash', reference: 'D-1' })
  assert.equal(receipt[1].accountId, 'deposit-liability')
  assert.equal(opening[1].accountId, 'deposit-liability')
  assert.equal(refund[0].accountId, 'deposit-liability')
  balanced(receipt); balanced(opening); balanced(refund)
})

test('property permissions are exposed under the Property Management category', () => {
  const keys = [
    'canViewPropertyPortfolio', 'canViewPropertyCollections', 'canViewPropertyStatements', 'canViewTenantPersonalDetails', 'canManageTenantPersonalDetails',
    'canManagePropertyOwners', 'canManageProperties', 'canManagePropertyUnits',
    'canCreateTenancies', 'canEndTenancies', 'canRecordRentPayment', 'canRecordTenantDeposit',
    'canRefundTenantDeposit', 'canVoidRentPayment', 'canViewPropertyReports', 'canRecordOwnerPayout',
    'canViewPropertySales', 'canCreatePropertySale', 'canRecordPropertySalePayment',
    'canVoidPropertySalePayment', 'canCancelPropertySale', 'canManagePropertyLandInventory',
  ]
  for (const key of keys) assert.equal(PERMISSION_METADATA[key]?.category, 'property_management', `${key} must be grouped under Property Management`)
})

test('legacy property view grants portfolio access without granting financial history access', () => {
  const permissions = resolveEffectivePermissions({ role: 'staff' }, { canViewPropertyManagement: true })
  assert.ok(permissions.includes('canViewPropertyPortfolio'))
  assert.ok(!permissions.includes('canViewPropertyCollections'))
  assert.ok(!permissions.includes('canViewPropertyStatements'))
})

test('property permissions require an explicit landlord or property-agent feature', () => {
  assert.equal(permissionAllowedForTenant('canViewPropertyPortfolio', new Set(['property_management.landlord'])), true)
  assert.equal(permissionAllowedForTenant('canViewPropertyPortfolio', new Set(['property_management.agent'])), true)
  assert.equal(permissionAllowedForTenant('canViewPropertyPortfolio', new Set(['property_management'])), false)
  assert.equal(permissionAllowedForTenant('canViewPropertyPortfolio', new Set()), false)
})
