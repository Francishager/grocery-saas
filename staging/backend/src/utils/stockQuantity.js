export function isValidStockQuantity(value, { allowZero = true, precision = 3 } = {}) {
  const quantity = Number(value);
  const decimals = Math.max(0, Math.min(9, Number(precision) || 3));
  const scale = 10 ** decimals;
  return Number.isFinite(quantity)
    && quantity >= (allowZero ? 0 : Number.EPSILON)
    && Math.abs(quantity * scale - Math.round(quantity * scale)) < 1e-7;
}
