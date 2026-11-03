export function isValidStockQuantity(value, { allowZero = true } = {}) {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    && quantity >= (allowZero ? 0 : Number.EPSILON)
    && Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 1e-7;
}
