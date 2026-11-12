export function fuelDeliveryValuation({ stockLitres, unitCost, deliveryLitres, deliveryUnitCost }) {
  const values = [stockLitres, unitCost, deliveryLitres, deliveryUnitCost].map(Number)
  if (!values.every(Number.isFinite) || values.some(value => value < 0)) throw new RangeError('Fuel stock and costs must be finite and non-negative')
  const [currentLitres, currentUnitCost, addedLitres, addedUnitCost] = values
  const stockValueBefore = currentLitres * currentUnitCost
  const deliveryValue = addedLitres * addedUnitCost
  const stockAfter = currentLitres + addedLitres
  return {
    stockValueBefore,
    deliveryValue,
    stockAfter,
    averageUnitCost: stockAfter > 0 ? (stockValueBefore + deliveryValue) / stockAfter : addedUnitCost,
    stockValueAfter: stockValueBefore + deliveryValue,
  }
}

export function fuelMeterSaleValuation({ stockLitres, unitCost, openingReading, closingReading }) {
  const values = [stockLitres, unitCost, openingReading, closingReading].map(Number)
  if (!values.every(Number.isFinite) || values.some(value => value < 0)) throw new RangeError('Fuel stock, meter readings, and unit cost must be finite and non-negative')
  const [currentLitres, currentUnitCost, opening, closing] = values
  if (closing < opening) throw new RangeError('Closing meter reading cannot be below opening reading')
  const litresSold = closing - opening
  if (litresSold > currentLitres + 0.001) throw new RangeError('Fuel sale cannot exceed available book stock')
  const stockValueBefore = currentLitres * currentUnitCost
  const costOfSales = litresSold * currentUnitCost
  return {
    litresSold,
    stockAfter: Math.max(0, currentLitres - litresSold),
    costOfSales,
    stockValueAfter: Math.max(0, stockValueBefore - costOfSales),
  }
}

export function fuelShiftReconciliation({ fuelSales, cashSales, mobileSales, creditSales, lubricantSales = 0, carWashIncome = 0, expenses = 0 }) {
  const values = [fuelSales, cashSales, mobileSales, creditSales, lubricantSales, carWashIncome, expenses].map(Number)
  if (!values.every(Number.isFinite) || values.some(value => value < 0)) throw new RangeError('Shift sales, collections, and expenses must be finite and non-negative')
  const [fuel, cash, mobile, credit, lubricants, carWash, expenseTotal] = values
  const totalSales = fuel + lubricants + carWash
  const reportedSalesTotal = cash + mobile + credit
  return {
    totalSales,
    reportedSalesTotal,
    actualTenderTotal: cash + mobile,
    variance: reportedSalesTotal - totalSales,
    netAmount: totalSales - expenseTotal,
  }
}
