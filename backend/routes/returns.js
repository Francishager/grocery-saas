import { Router } from "express";
import prisma from "../src/db.js";
import { authenticateToken, requirePermission, requireCashAccount, checkPaymentMethodPermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureCheck.js";
import { resolveBranchScope, scopedWhere, handleBranchError } from "../src/utils/branchAccess.js";
import { syncLinkedTransactionAccountBalance } from "../src/utils/accountingSync.js";

const router = Router();
const CREDIT_NOTE_STOCK_RETURN_METHOD = "credit_note_stock";
const DIRECT_REFUND_METHODS = new Set(["cash", "mobile_money", "bank", "card"]);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function toMoney(value, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : fallback;
}

function normalizePaymentMethod(value) {
  return String(value || "cash").trim().toLowerCase();
}

function wholeQuantity(value, label = "Quantity") {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw httpError(400, `${label} must be a whole number greater than zero`);
  }
  return quantity;
}

function conversionFactorFor(item) {
  const conversionFactor = Number(item?.conversionFactor || 1);
  return Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
}

function itemBaseQuantity(item, quantity = item?.quantity) {
  const baseQty = Number(quantity || 0) * conversionFactorFor(item);
  if (!Number.isInteger(baseQty) || baseQty <= 0) {
    throw httpError(400, "Returned quantity must convert to a whole stock quantity");
  }
  return baseQty;
}

function normalReturnWhere(scope, extra = {}) {
  return scopedWhere(scope, {
    saleId: { not: null },
    refundMethod: { not: CREDIT_NOTE_STOCK_RETURN_METHOD },
    status: { not: "cancelled" },
    ...extra,
  });
}

function returnedBaseQuantityByProduct(saleReturns = []) {
  const returned = new Map();
  for (const ret of saleReturns || []) {
    if (ret.status === "cancelled" || ret.refundMethod === CREDIT_NOTE_STOCK_RETURN_METHOD) continue;
    for (const item of ret.items || []) {
      returned.set(item.productId, (returned.get(item.productId) || 0) + Number(item.quantity || 0));
    }
  }
  return returned;
}

function returnableSaleItems(sale) {
  const returnedByProduct = returnedBaseQuantityByProduct(sale.saleReturns);
  return (sale.items || []).flatMap((item) => {
    if (item.product?.itemType === "service") return [];
    let soldBaseQty = 0;
    try {
      soldBaseQty = itemBaseQuantity(item);
    } catch {
      return [];
    }
    const returnedForProduct = Number(returnedByProduct.get(item.productId) || 0);
    const consumedFromLine = Math.min(soldBaseQty, returnedForProduct);
    returnedByProduct.set(item.productId, Math.max(0, returnedForProduct - consumedFromLine));
    const remainingBaseQuantity = Math.max(0, soldBaseQty - consumedFromLine);
    const conversionFactor = conversionFactorFor(item);
    const remainingQuantity = Math.floor(remainingBaseQuantity / conversionFactor);
    return [{
      id: item.id,
      productId: item.productId,
      productName: item.product?.name || "Product",
      sku: item.product?.sku || "",
      itemType: item.product?.itemType || "product",
      quantity: Number(item.quantity || 0),
      returnedQuantity: Math.max(0, Number(item.quantity || 0) - remainingQuantity),
      remainingQuantity,
      remainingBaseQuantity,
      unitName: item.unitName || item.product?.baseUnit || "",
      conversionFactor,
      price: toMoney(item.price),
      total: toMoney(item.total),
    }];
  }).filter((item) => item.remainingQuantity > 0);
}

function saleSelectPayload(sale) {
  const items = returnableSaleItems(sale);
  return {
    id: sale.id,
    receiptNo: sale.receiptNo,
    total: toMoney(sale.total),
    paymentMethod: sale.paymentMethod,
    customerName: sale.customerName || "Walk-in Customer",
    createdAt: sale.createdAt,
    branch: sale.branch,
    user: sale.user,
    items,
    returnableTotal: items.reduce((sum, item) => sum + toMoney(item.remainingQuantity * item.price), 0),
  };
}

async function resolveRefundAccount(tx, scope, sale, req) {
  const saleTransaction = await tx.cashTransaction.findFirst({
    where: { tenantId: scope.tenantId, reference: sale.receiptNo, type: "sale" },
    include: { account: true },
    orderBy: { createdAt: "desc" },
  });
  if (saleTransaction?.account && saleTransaction.account.isActive !== false) return saleTransaction.account;

  if (!req.userCashAccountId) return null;
  return tx.cashAccount.findFirst({
    where: { id: req.userCashAccountId, tenantId: scope.tenantId, isActive: true },
  });
}

// List returns
router.get("/", authenticateToken, requireFeature("sales.returns"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const returns = await prisma.saleReturn.findMany({
      where: normalReturnWhere(scope),
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        sale: { select: { id: true, receiptNo: true, paymentMethod: true, customerName: true } },
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, fname: true, lname: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(returns);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch returns");
  }
});

// List POS sales that still have returnable stock-tracked items.
router.get("/eligible-sales", authenticateToken, requirePermission("canViewSale"), requireFeature("sales.returns"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const search = String(req.query.search || "").trim();
    const sales = await prisma.sale.findMany({
      where: scopedWhere(scope, {
        status: { not: "cancelled" },
        ...(search ? {
          OR: [
            { receiptNo: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      }),
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true, itemType: true, baseUnit: true } } } },
        saleReturns: {
          where: { status: { not: "cancelled" }, refundMethod: { not: CREDIT_NOTE_STOCK_RETURN_METHOD } },
          include: { items: true },
        },
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, fname: true, lname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      sales: sales
        .filter((sale) => DIRECT_REFUND_METHODS.has(normalizePaymentMethod(sale.paymentMethod)))
        .map(saleSelectPayload)
        .filter((sale) => sale.items.length > 0),
    });
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch returnable sales");
  }
});

// Get single return
router.get("/:id", authenticateToken, requireFeature("sales.returns"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const ret = await prisma.saleReturn.findFirst({
      where: normalReturnWhere(scope, { id: req.params.id }),
      include: {
        items: { include: { product: true } },
        sale: true,
        customer: true,
        user: { select: { id: true, fname: true, lname: true } },
      },
    });
    if (!ret) return res.status(404).json({ error: "Return not found" });
    res.json(ret);
  } catch (err) {
    handleBranchError(res, err, "Failed to fetch return");
  }
});

// Create return for a normal POS sale only. Credit sale returns belong on Credit & Debit Notes.
router.post("/", authenticateToken, requirePermission("canRefundSale"), requireFeature("sales.returns"), requireCashAccount, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { saleId, items = [], reason, refundMethod } = req.body;

    if (!saleId) return res.status(400).json({ error: "Select the original sale receipt before processing a return" });
    if (!items.length) return res.status(400).json({ error: "Items required" });

    const returnNo = `RET-${Date.now()}`;

    const ret = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: scopedWhere(scope, {
          OR: [{ id: saleId }, { receiptNo: saleId }],
          status: { not: "cancelled" },
        }),
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true, itemType: true, baseUnit: true } } } },
          saleReturns: {
            where: { status: { not: "cancelled" }, refundMethod: { not: CREDIT_NOTE_STOCK_RETURN_METHOD } },
            include: { items: true },
          },
        },
      });
      if (!sale) throw httpError(404, "Original sale receipt was not found");

      const originalPaymentMethod = normalizePaymentMethod(sale.paymentMethod);
      if (!DIRECT_REFUND_METHODS.has(originalPaymentMethod)) {
        throw httpError(400, "Returns page only handles paid sales. Use Credit & Debit Notes for credit sale returns.");
      }

      const requestedRefundMethod = refundMethod ? normalizePaymentMethod(refundMethod) : originalPaymentMethod;
      if (requestedRefundMethod !== originalPaymentMethod) {
        throw httpError(400, `Refund method must match the original sale payment method: ${originalPaymentMethod}`);
      }
      if (!checkPaymentMethodPermission(req, requestedRefundMethod)) {
        throw httpError(403, `You do not have permission to use ${requestedRefundMethod} as a payment method. Please contact your administrator.`);
      }

      const saleItemsById = new Map((sale.items || []).map((item) => [item.id, item]));
      const saleItemsByProduct = new Map();
      for (const item of sale.items || []) {
        if (!saleItemsByProduct.has(item.productId)) saleItemsByProduct.set(item.productId, []);
        saleItemsByProduct.get(item.productId).push(item);
      }

      const returnedByProduct = returnedBaseQuantityByProduct(sale.saleReturns);
      const remainingByProduct = new Map();
      for (const item of sale.items || []) {
        if (item.product?.itemType === "service") continue;
        remainingByProduct.set(item.productId, (remainingByProduct.get(item.productId) || 0) + itemBaseQuantity(item));
      }
      for (const [productId, quantity] of returnedByProduct.entries()) {
        remainingByProduct.set(productId, Math.max(0, (remainingByProduct.get(productId) || 0) - quantity));
      }

      let total = 0;
      const returnItems = [];
      const requestedByProduct = new Map();
      for (const requested of items) {
        const qty = wholeQuantity(requested.quantity, "Returned quantity");
        let saleItem = requested.saleItemId ? saleItemsById.get(requested.saleItemId) : null;
        if (!saleItem && requested.productId) {
          const productItems = saleItemsByProduct.get(requested.productId) || [];
          if (productItems.length === 1) saleItem = productItems[0];
        }
        if (!saleItem) throw httpError(400, "Returned item must belong to the selected sale");
        if (saleItem.product?.itemType === "service") throw httpError(400, `${saleItem.product?.name || "Service"} is not a stock-tracked sale item`);

        const baseQty = itemBaseQuantity(saleItem, qty);
        const nextRequestedBase = (requestedByProduct.get(saleItem.productId) || 0) + baseQty;
        const remainingBase = Number(remainingByProduct.get(saleItem.productId) || 0);
        if (nextRequestedBase > remainingBase) {
          throw httpError(400, `Returned quantity for ${saleItem.product?.name || "item"} exceeds the remaining sold quantity`);
        }
        requestedByProduct.set(saleItem.productId, nextRequestedBase);

        const lineUnitTotal = Number(saleItem.quantity || 0) > 0 ? toMoney(saleItem.total) / Number(saleItem.quantity) : toMoney(saleItem.price);
        const lineTotal = toMoney(lineUnitTotal * qty);
        total += lineTotal;
        returnItems.push({
          productId: saleItem.productId,
          quantity: baseQty,
          price: baseQty > 0 ? toMoney(lineTotal / baseQty) : toMoney(saleItem.price),
          total: lineTotal,
          reason: requested.reason || reason || null,
        });
      }

      total = toMoney(total);
      if (!returnItems.length || total <= 0) throw httpError(400, "Select at least one valid returned sale item");

      const refundAccount = await resolveRefundAccount(tx, scope, sale, req);
      if (!refundAccount) {
        throw httpError(400, "No payment account was found for this sale refund. Link or assign a transaction account before refunding.");
      }
      if (Number(refundAccount.balance || 0) < total) {
        throw httpError(400, `Insufficient funds in ${refundAccount.name} to refund ${total.toFixed(2)}`);
      }

      for (const item of returnItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }

      const remainingAfterReturn = [...remainingByProduct.entries()].every(([productId, remaining]) => {
        const returnedNow = Number(requestedByProduct.get(productId) || 0);
        return Math.max(0, remaining - returnedNow) === 0;
      });

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: remainingAfterReturn ? "refunded" : "completed" },
      });

      const createdReturn = await tx.saleReturn.create({
        data: {
          returnNo,
          tenantId: scope.tenantId,
          branchId: sale.branchId || scope.branchId || null,
          saleId: sale.id,
          userId: req.user.id,
          customerId: null,
          total,
          reason,
          refundMethod: requestedRefundMethod,
          status: "completed",
          items: { create: returnItems },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          sale: { select: { id: true, receiptNo: true, paymentMethod: true, customerName: true } },
          customer: { select: { id: true, name: true } },
        },
      });

      const updatedAccount = await tx.cashAccount.update({
        where: { id: refundAccount.id },
        data: { balance: { decrement: total } },
      });
      await tx.cashTransaction.create({
        data: {
          tenantId: scope.tenantId,
          accountId: refundAccount.id,
          type: "refund",
          amount: total,
          balanceAfter: updatedAccount.balance,
          reference: returnNo,
          description: `Sales return ${returnNo} for ${sale.receiptNo}`,
          userId: req.user.id,
        },
      });
      await syncLinkedTransactionAccountBalance(tx, scope.tenantId, refundAccount.id);

      return createdReturn;
    });

    res.status(201).json(ret);
  } catch (err) {
    console.error("Create return error:", err);
    handleBranchError(res, err, "Failed to create return");
  }
});

export default router;
