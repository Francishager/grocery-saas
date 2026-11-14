export function inventoryQuantityChange(log) {
  const before = Number(log?.changes?.before?.quantity);
  const after = Number(log?.changes?.after?.quantity);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return null;
  return { before, after, delta: after - before };
}

export function aggregateInventorySales(sales, products = [], { includeUnsold = false } = {}) {
  const rows = new Map();
  const productById = new Map(products.filter((product) => product?.id).map((product) => [product.id, product]));
  for (const product of products) {
    if (!product?.id) continue;
    rows.set(product.id, {
      productId: product.id,
      product: product.name || 'Unknown',
      quantity: 0,
      revenue: 0,
      baseUnit: product.baseUnit || 'Piece',
      branch: product.branch?.name || 'Unassigned',
      saleCount: 0,
    });
  }

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const productId = item.productId || item.product?.id;
      if (!productId) continue;
      const listedProduct = productById.get(productId);
      const product = item.product
        ? { ...listedProduct, ...item.product, branch: item.product.branch || listedProduct?.branch }
        : listedProduct;
      if (!rows.has(productId)) {
        rows.set(productId, {
          productId,
          product: product?.name || 'Unknown',
          quantity: 0,
          revenue: 0,
          baseUnit: product?.baseUnit || 'Piece',
          branch: product?.branch?.name || 'Unassigned',
          saleCount: 0,
        });
      }
      const row = rows.get(productId);
      const quantity = Number(item.quantity || 0);
      const factor = Number(item.conversionFactor || 1);
      row.quantity += quantity * (Number.isFinite(factor) && factor > 0 ? factor : 1);
      row.revenue += Number(item.total || 0);
      row.saleCount += 1;
    }
  }

  return [...rows.values()]
    .filter((row) => includeUnsold || row.saleCount > 0)
    .map((row) => ({ ...row, quantity: Number(row.quantity.toFixed(6)), revenue: Math.round(row.revenue * 100) / 100 }));
}

export function isExplicitDamageReason(reason) {
  return /damag|lost|waste|shrink|expir|spoil/i.test(String(reason || ''));
}

export function calendarDaysBetween(date, now = new Date()) {
  const day = (value) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.floor((day(new Date(date)) - day(now)) / 86400000);
}

export function summarizeInventoryMovements(movements) {
  const totals = new Map();
  for (const movement of movements || []) {
    const unit = movement.baseUnit || 'Piece';
    const current = totals.get(unit) || { inQty: 0, outQty: 0 };
    current.inQty += Number(movement.inQty || 0);
    current.outQty += Number(movement.outQty || 0);
    totals.set(unit, current);
  }
  const format = (selector) => [...totals.entries()]
    .map(([unit, values]) => `${Number(selector(values).toFixed(6))} ${unit}`)
    .join(' · ') || '0';
  return {
    totalInbound: format((values) => values.inQty),
    totalOutbound: format((values) => values.outQty),
    netChange: format((values) => values.inQty - values.outQty),
    movementCount: (movements || []).length,
  };
}
