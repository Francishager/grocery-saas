import test from 'node:test'
import assert from 'node:assert/strict'
import {
  propertyDepositReceiptLines,
  propertyDepositRefundLines,
  propertyDepositRentApplicationLines,
  propertyOpeningDepositLines,
  propertyOwnerPayoutLines,
  propertyRentChargeLines,
  propertyRentReceiptLines,
  rentAdvanceApplicationLines,
  propertyRentPlanReclassificationLines,
  propertyRentPlanReceiptLines,
  propertyRentPlanCancellationLines,
  propertySaleRecognitionLines,
  propertySalePaymentLines,
  propertySaleOwnerPayoutLines,
  propertyLandAcquisitionLines,
  propertyLandPurchaseLines,
  propertyLandPurchasePaymentLines,
} from '../src/services/propertyAccountingService.js'
import { PERMISSION_METADATA, permissionAllowedForTenant, resolveEffectivePermissions } from '../src/utils/permissions.js'

const config = {
  rentReceivableAccountId: 'rent-ar',
  rentPlanReceivableAccountId: 'rent-plan-ar',
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

test('plot acquisitions capitalize land and split upfront cash from supplier payable', () => {
  const acquisition = propertyLandPurchaseLines(config, { costBasis: 1100000, recoverableTax: 100000, total: 1200000, amountPaid: 300000, payableAccountId: 'supplier-payable', inputTaxAccountId: 'input-tax', cashAccountLedgerId: 'cash', reference: 'LAND-PUR-1' })
  const paidInFull = propertyLandPurchaseLines(config, { costBasis: 300000, recoverableTax: 0, total: 300000, amountPaid: 300000, payableAccountId: null, cashAccountLedgerId: 'cash', reference: 'LAND-PUR-2' })
  const centBalance = propertyLandPurchaseLines(config, { costBasis: 1, total: 1, amountPaid: 0.99, payableAccountId: 'supplier-payable', cashAccountLedgerId: 'cash', reference: 'LAND-PUR-3' })
  const settlement = propertyLandPurchasePaymentLines({ amount: 250000, payableAccountId: 'supplier-payable', cashAccountLedgerId: 'cash', reference: 'LAND-PAY-1' })
  assert.deepEqual(acquisition.map(line => [line.accountId, line.debit, line.credit]), [
    ['land-inventory', 1100000, 0], ['input-tax', 100000, 0], ['cash', 0, 300000], ['supplier-payable', 0, 900000],
  ])
  assert.deepEqual(paidInFull.map(line => [line.accountId, line.debit, line.credit]), [['land-inventory', 300000, 0], ['cash', 0, 300000]])
  assert.deepEqual(centBalance.map(line => [line.accountId, line.debit, line.credit]), [['land-inventory', 1, 0], ['cash', 0, 0.99], ['supplier-payable', 0, 0.01]])
  assert.deepEqual(settlement.map(line => [line.accountId, line.debit, line.credit]), [['supplier-payable', 250000, 0], ['cash', 0, 250000]])
  balanced(acquisition); balanced(paidInFull); balanced(centBalance); balanced(settlement)
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

test('multi-month rent receipt separates due rent from unearned tenant advance', () => {
  const rentConfig = { ...config, rentAdvanceAccountId: 'rent-advance' }
  const receipt = propertyRentReceiptLines(rentConfig, { amount: 1500000, appliedAmount: 500000, advanceAmount: 1000000, cashAccountLedgerId: 'cash', reference: 'R-3M' })
  const application = rentAdvanceApplicationLines(rentConfig, { amount: 500000, reference: 'R-3M-2026-11' })
  assert.deepEqual(receipt.map(line => [line.accountId, line.debit, line.credit]), [
    ['cash', 1500000, 0], ['rent-ar', 0, 500000], ['rent-advance', 0, 1000000],
  ])
  assert.deepEqual(application.map(line => [line.accountId, line.debit, line.credit]), [
    ['rent-advance', 500000, 0], ['rent-ar', 0, 500000],
  ])
  balanced(receipt); balanced(application)
})

test('rent payment plans reclass existing arrears without creating income and settle through the plan receivable', () => {
  const reclass = propertyRentPlanReclassificationLines(config, { amount: 240000, reference: 'RPL-1' })
  const receipt = propertyRentPlanReceiptLines(config, { amount: 80000, cashAccountLedgerId: 'cash', reference: 'RPL-RCPT-1' })
  const cancel = propertyRentPlanCancellationLines(config, { amount: 160000, reference: 'RPL-1' })
  assert.deepEqual(reclass.map(line => [line.accountId, line.debit, line.credit]), [['rent-plan-ar', 240000, 0], ['rent-ar', 0, 240000]])
  assert.deepEqual(receipt.map(line => [line.accountId, line.debit, line.credit]), [['cash', 80000, 0], ['rent-plan-ar', 0, 80000]])
  assert.deepEqual(cancel.map(line => [line.accountId, line.debit, line.credit]), [['rent-ar', 160000, 0], ['rent-plan-ar', 0, 160000]])
  assert.ok(!reclass.some(line => line.accountId === config.rentIncomeAccountId))
  balanced(reclass); balanced(receipt); balanced(cancel)
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

test('applying a held tenant deposit settles rent receivable without moving cash', () => {
  const application = propertyDepositRentApplicationLines(config, { amount: 450000, reference: 'DAPP-1' })
  assert.equal(application[0].accountId, 'deposit-liability')
  assert.equal(application[0].debit, 450000)
  assert.equal(application[1].accountId, 'rent-ar')
  assert.equal(application[1].credit, 450000)
  assert.ok(application.every(line => line.accountId !== 'cash'))
  balanced(application)
})

test('property permissions are exposed under the Property Management category', () => {
  const keys = [
    'canViewPropertyPortfolio', 'canViewPropertyCollections', 'canViewPropertyStatements', 'canViewTenantPersonalDetails', 'canManageTenantPersonalDetails', 'canViewRentPaymentPlans', 'canManageRentPaymentPlans', 'canEditRentPeriods',
    'canManagePropertyOwners', 'canManageProperties', 'canManagePropertyUnits',
    'canCreateTenancies', 'canEndTenancies', 'canRecordRentPayment', 'canRecordTenantDeposit',
    'canRefundTenantDeposit', 'canApplyTenantDepositToRent', 'canVoidRentPayment', 'canViewPropertyReports', 'canRecordOwnerPayout',
    'canViewPropertySales', 'canCreatePropertySale', 'canRecordPropertySalePayment',
    'canVoidPropertySalePayment', 'canCancelPropertySale', 'canManagePropertyLandInventory',
    'canViewPropertyLandPurchases', 'canCreatePropertyLandPurchase', 'canRecordPropertyLandPurchasePayment',
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
  assert.equal(permissionAllowedForTenant('canEditRentPeriods', new Set(['property_management.landlord'])), true)
  assert.equal(permissionAllowedForTenant('canEditRentPeriods', new Set(['property_management.agent'])), true)
  assert.equal(permissionAllowedForTenant('canApplyTenantDepositToRent', new Set(['property_management.landlord'])), true)
  assert.equal(permissionAllowedForTenant('canApplyTenantDepositToRent', new Set(['property_management.agent'])), true)
  assert.equal(permissionAllowedForTenant('canEditRentPeriods', new Set(['property_management'])), false)
  assert.equal(permissionAllowedForTenant('canViewPropertyPortfolio', new Set(['property_management'])), false)
  assert.equal(permissionAllowedForTenant('canViewPropertyPortfolio', new Set()), false)
})
