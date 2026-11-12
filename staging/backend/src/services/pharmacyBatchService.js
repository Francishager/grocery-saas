import { getTenantFeatures, hasFeatureAccess } from '../../middleware/featureCheck.js';
import { randomUUID } from 'node:crypto';

const makeId = () => randomUUID();

// Called inside the same DB transaction that creates a cash or credit sale.
// Batches are an allocation layer over existing inventory, never a second stock ledger.
export async function allocatePharmacySaleBatches(tx, { tenantId, branchId, sourceId, sourceType, items }) {
  const features = await getTenantFeatures(tenantId);
  if (!hasFeatureAccess(features, 'pharmacy_management')) return;

  for (const item of items) {
    if (item.itemType === 'service') continue;
    const productId = item.productId;
    const requested = Number(item.baseQty ?? (Number(item.quantity) * Number(item.conversionFactor || 1)));
    if (!productId || !Number.isFinite(requested) || requested <= 0) continue;

    const branchFilter = branchId
      ? '("branchId" IS NULL OR "branchId" = $3)'
      : '"branchId" IS NULL';
    const existing = await tx.$queryRawUnsafe(
      `SELECT id FROM pharmacy_batches WHERE "tenantId" = $1 AND "productId" = $2 AND ${branchFilter} LIMIT 1`,
      ...(branchId ? [tenantId, productId, branchId] : [tenantId, productId]),
    );
    // Existing stock may predate pharmacy lot tracking. It remains sellable until
    // the business begins recording batches for that medicine.
    if (!existing.length) continue;

    const batches = await tx.$queryRawUnsafe(
      `SELECT id, "quantityRemaining" FROM pharmacy_batches WHERE "tenantId" = $1 AND "productId" = $2 AND ${branchFilter} AND status = 'active' AND "quantityRemaining" > 0 AND ("expiryDate" IS NULL OR "expiryDate" >= CURRENT_DATE) ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC FOR UPDATE`,
      ...(branchId ? [tenantId, productId, branchId] : [tenantId, productId]),
    );
    const available = batches.reduce((sum, batch) => sum + Number(batch.quantityRemaining), 0);
    if (available + 0.000001 < requested) {
      throw Object.assign(new Error(`Insufficient unexpired pharmacy batch stock for product ${productId}. Available: ${Math.max(available, 0)}; requested: ${requested}.`), { statusCode: 409 });
    }

    let remaining = requested;
    for (const batch of batches) {
      if (remaining <= 0.000001) break;
      const quantity = Math.min(Number(batch.quantityRemaining), remaining);
      const updated = await tx.$executeRaw`UPDATE pharmacy_batches SET "quantityRemaining" = "quantityRemaining" - ${quantity}, status = CASE WHEN "quantityRemaining" - ${quantity} <= 0.000001 THEN 'depleted' ELSE status END WHERE id = ${batch.id} AND "quantityRemaining" >= ${quantity}`;
      if (!updated) throw Object.assign(new Error('Pharmacy batch stock changed while recording this sale. Refresh and retry.'), { statusCode: 409 });
      await tx.$executeRaw`INSERT INTO pharmacy_sale_batch_allocations (id, "tenantId", "saleId", "saleRecordId", "batchId", "productId", quantity) VALUES (${makeId()}, ${tenantId}, ${sourceType === 'cash' ? sourceId : null}, ${sourceType === 'credit' ? sourceId : null}, ${batch.id}, ${productId}, ${quantity})`;
      remaining -= quantity;
    }
  }
}
