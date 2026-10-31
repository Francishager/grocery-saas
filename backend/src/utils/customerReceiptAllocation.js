const money = (value) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

export function allocateCustomerReceipt(amount, sales, preferredSaleId = null) {
  let remaining = Math.max(0, money(amount))
  const orderedSales = [...sales]
  if (preferredSaleId) {
    orderedSales.sort((left, right) => Number(right.id === preferredSaleId) - Number(left.id === preferredSaleId))
  }

  const allocations = []
  for (const sale of orderedSales) {
    if (remaining <= 0) break
    const openAmount = Math.max(0, money(sale.openAmount))
    const allocated = Math.min(remaining, openAmount)
    if (allocated <= 0) continue
    allocations.push({ saleId: sale.id, amount: allocated })
    remaining = money(remaining - allocated)
  }

  return { allocations, unallocated: remaining }
}
