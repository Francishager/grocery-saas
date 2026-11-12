const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

export function allocateSaleTaxToItems(items = [], taxAmount = 0) {
  const tax = toMoney(taxAmount)
  const weights = items.map((item) => Math.max(0, Number(item.total ?? (Number(item.price || 0) * Number(item.quantity || 0))) || 0))
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)
  if (!items.length || tax <= 0 || totalWeight <= 0) return items.map(() => 0)

  let allocated = 0
  return weights.map((weight, index) => {
    const share = index === weights.length - 1
      ? toMoney(tax - allocated)
      : toMoney(tax * weight / totalWeight)
    allocated = toMoney(allocated + share)
    return share
  })
}

export function returnItemTaxAmount(saleItem, returnedSellingQuantity) {
  const originalTax = saleItem?.taxAmount
  const soldQuantity = Number(saleItem?.quantity || 0)
  const returnedQuantity = Number(returnedSellingQuantity || 0)
  if (originalTax == null || soldQuantity <= 0 || returnedQuantity <= 0) return null
  return toMoney(Number(originalTax) * Math.min(1, returnedQuantity / soldQuantity))
}
