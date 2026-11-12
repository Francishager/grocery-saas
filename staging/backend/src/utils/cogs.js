export function saleLineCogs(item) {
  const rawCost = item?.cost;
  if (rawCost !== null && rawCost !== undefined && rawCost !== "") {
    const savedCost = Number(rawCost);
    if (Number.isFinite(savedCost)) return savedCost * Number(item?.quantity || 0);
  }

  const productCost = Number(item?.product?.cost || 0);
  const conversionFactor = Number(item?.conversionFactor || 1);
  const effectiveCost = productCost * (Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1);
  return effectiveCost * Number(item?.quantity || 0);
}

export function saleCogs(sale) {
  return (sale?.items || []).reduce((sum, item) => sum + saleLineCogs(item), 0);
}

export function saleItemProfit(item) {
  return Number(item?.total || 0) - saleLineCogs(item);
}
