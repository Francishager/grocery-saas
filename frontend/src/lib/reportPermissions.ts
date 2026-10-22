export const SALES_REPORT_IDS = [
  'salesSummary', 'salesDaily', 'salesWeekly', 'salesMonthly', 'salesByProduct', 'salesByCategory',
  'salesByCustomer', 'salesByUser', 'salesServiceJobs', 'salesByBranch', 'salesDiscounts', 'salesReturns',
] as const

export const salesReportPermissionKey = (reportId: string) =>
  `canViewReport${reportId[0]?.toUpperCase() || ''}${reportId.slice(1)}`

export const SALES_REPORT_PERMISSION_KEYS = SALES_REPORT_IDS.map(salesReportPermissionKey)

export const GRANULAR_REPORT_IDS = [
  ...SALES_REPORT_IDS,
  'inventoryStock','inventoryValuation','inventoryLowStock','inventoryOutOfStock','inventoryStockMovement','inventoryAdjustments','inventoryExpiry','inventoryDamaged','inventoryFastMoving','inventorySlowMoving','inventoryProductLedger',
  'financialProfitLoss','financialIncome','financialExpense','financialCashFlow','financialTrialBalance','financialBalanceSheet','financialGeneralLedger','financialBankTransactions','financialTax',
  'customersList','customersSales','customersBalance','customersReceivables','customersTop','customersLedger','customersStatement','customersCreditNotes',
  'suppliersList','suppliersPurchases','suppliersPayables','suppliersBalance','suppliersStatement','suppliersDebitNotes','suppliersLedger',
  'receivablesOutstanding','receivablesAging','receivablesCollection','receivablesOverdue','receivablesCreditNotes',
  'payablesOutstanding','payablesAging','payablesPaymentHistory','payablesOverdue','payablesDebitNotes',
  'performanceBranch','performanceProduct','performanceCategory','performanceUserActivity','performanceTopProducts','performanceLeastProducts',
  'servicesSummary','servicesList','servicesSales','servicesByCategory','servicesByBranch','servicesTop',
  'rentalsSummary','rentalsList','rentalsByItem','rentalsByCustomer','rentalsByBranch','rentalsActive','rentalsOverdue','rentalsReturns','rentalsDaily','rentalsMonthly',
  'fuelSalesSummary','fuelByPump','fuelByTank','fuelDeliveries','fuelShiftSummary','fuelLubricantSales','fuelCarWash','fuelMeterReadings',
  'mfgProductionSummary','mfgByProduct','mfgWasteReport','mfgCostAnalysis','mfgBOMReport','executiveSummary',
] as const
export const GRANULAR_REPORT_PERMISSION_KEYS = GRANULAR_REPORT_IDS.map(salesReportPermissionKey)

export function canViewReportItem(
  reportId: string,
  categoryPermission: string,
  hasPermission: (permission: string) => boolean,
) {
  if ((GRANULAR_REPORT_IDS as readonly string[]).includes(reportId)) {
    return hasPermission(salesReportPermissionKey(reportId))
  }
  return hasPermission(categoryPermission)
}
