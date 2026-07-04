import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";

const router = Router();

const saleRoles = ["owner", "manager", "attendant"];

function normalizeItems(items, idKey = "productId") {
  return items.map((item) => ({
    productId: item[idKey] || item.productId || item.id,
    quantity: Math.max(1, Number(item.qty || item.quantity || 1)),
    price: Number(item.price || 0),
    discount: Number(item.discount || 0),
    cashDiscount: Number(item.cashDiscount || 0),
    unitName: item.unitName || null,
    conversionFactor: item.conversionFactor != null ? Number(item.conversionFactor) : null,
  }));
}

async function checkedSaleItems(items, scope) {
  const normalized = normalizeItems(items);
  const productIds = [...new Set(normalized.map((item) => item.productId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: scopedWhere(scope, { id: { in: productIds }, isActive: { not: false } }),
    include: { units: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  if (products.length !== productIds.length) {
    const error = new Error("One or more products were not found in this branch");
    error.statusCode = 400;
    throw error;
  }

  return normalized.map((item) => {
    const product = byId.get(item.productId);

    // Multi-UOM: if unitName specified, use conversion factor and unit price
    let effectivePrice = item.price || product.price || 0;
    let baseQty = item.quantity; // quantity in base units to deduct from stock
    let unitName = item.unitName || null;
    let conversionFactor = item.conversionFactor;

    if (unitName) {
      const unit = product.units.find((u) => u.unitName === unitName);
      if (unit) {
        effectivePrice = unit.sellingPrice;
        conversionFactor = unit.conversionFactor;
        baseQty = item.quantity * unit.conversionFactor; // convert to base units
      }
    }

    // Check stock in base units (skip for service items)
    if (product.itemType !== "service" && product.quantity < baseQty) {
      const error = new Error(`${product.name} has only ${product.quantity} ${product.baseUnit} in stock`);
      error.statusCode = 400;
      throw error;
    }

    const lineTotal = effectivePrice * item.quantity;
    const totalDiscount = item.discount + item.cashDiscount;
    return {
      productId: item.productId,
      quantity: item.quantity, // quantity in selling units
      baseQty, // quantity in base units (for stock deduction)
      price: effectivePrice,
      discount: item.discount,
      cashDiscount: item.cashDiscount,
      unitName,
      conversionFactor,
      itemType: product.itemType || "product",
      total: Math.max(0, lineTotal - totalDiscount),
    };
  });
}

// Create single sale
router.post("/", authenticateToken, requirePermission("canCreateSale"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { items = [], paymentMethod = "cash", notes, cashDiscount = 0, mobileProvider, phoneNumber, transactionId } = req.body;
    if (!items.length) return res.status(400).json({ error: "Items required" });

    // Check discount permission
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const invoiceCashDiscount = Number(cashDiscount) || 0;
    const hasLineItemDiscount = items.some((i) => Number(i.cashDiscount || 0) > 0);
    if ((hasLineItemDiscount || invoiceCashDiscount > 0) && user.discountPermission === "none") {
      return res.status(403).json({ error: "You do not have permission to give discounts" });
    }
    if (hasLineItemDiscount && user.discountPermission === "invoice") {
      return res.status(403).json({ error: "You can only give invoice-level discounts" });
    }
    if (invoiceCashDiscount > 0 && user.discountPermission === "lineItem") {
      return res.status(403).json({ error: "You can only give line item discounts" });
    }
    if (user.discountPermission === "managerApproval") {
      // In a full implementation, this would check for manager approval token
      // For now, we allow it but log it
    }

    const saleItems = await checkedSaleItems(items, scope);
    const subtotal = saleItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const lineDiscount = saleItems.reduce((sum, i) => sum + i.discount + i.cashDiscount, 0);
    const totalDiscount = lineDiscount + invoiceCashDiscount;

    // Fetch tenant tax settings
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { taxEnabled: true, taxRate: true } });
    const taxRate = (tenant?.taxEnabled && tenant?.taxRate) ? tenant.taxRate / 100 : 0;
    const taxableAmount = Math.max(0, subtotal - totalDiscount);
    const tax = Math.round(taxableAmount * taxRate * 100) / 100;
    const total = Math.max(0, subtotal - totalDiscount + tax);

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          receiptNo: `RCP-${Date.now()}`,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId,
          total,
          subtotal,
          tax,
          discount: lineDiscount,
          cashDiscount: invoiceCashDiscount,
          paymentMethod,
          mobileProvider: paymentMethod === "mobile_money" ? mobileProvider : null,
          phoneNumber: paymentMethod === "mobile_money" ? phoneNumber : null,
          transactionId: ["mobile_money", "card"].includes(paymentMethod) ? transactionId : null,
          notes,
          items: { create: saleItems.map(({ baseQty, itemType, ...rest }) => rest) },
        },
        include: { items: true, branch: true },
      });

      // Deduct stock in base units (skip service items)
      for (const item of saleItems) {
        if (item.itemType === "service") continue;
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.baseQty } },
        });
      }

      return created;
    });

    res.status(201).json({ message: "Sale recorded", sale });
  } catch (err) {
    console.error("Sale create error:", err);
    handleBranchError(res, err);
  }
});

// Checkout multiple items
router.post("/checkout", authenticateToken, requirePermission("canCreateSale"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { cart = [], paymentMethod = "cash", cashDiscount = 0, mobileProvider, phoneNumber, transactionId, amountPaid, changeGiven } = req.body;
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    // Check discount permission
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const invoiceCashDiscount = Number(cashDiscount) || 0;
    const hasLineItemDiscount = cart.some((i) => Number(i.cashDiscount || 0) > 0);
    if ((hasLineItemDiscount || invoiceCashDiscount > 0) && user.discountPermission === "none") {
      return res.status(403).json({ error: "You do not have permission to give discounts" });
    }
    if (hasLineItemDiscount && user.discountPermission === "invoice") {
      return res.status(403).json({ error: "You can only give invoice-level discounts" });
    }
    if (invoiceCashDiscount > 0 && user.discountPermission === "lineItem") {
      return res.status(403).json({ error: "You can only give line item discounts" });
    }

    const saleItems = await checkedSaleItems(cart, scope);
    const subtotal = saleItems.reduce((sum, c) => sum + c.price * c.quantity, 0);
    const lineDiscount = saleItems.reduce((sum, c) => sum + c.discount + c.cashDiscount, 0);
    const totalDiscount = lineDiscount + invoiceCashDiscount;

    // Fetch tenant tax settings
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { taxEnabled: true, taxRate: true } });
    const taxRate = (tenant?.taxEnabled && tenant?.taxRate) ? tenant.taxRate / 100 : 0;
    const taxableAmount = Math.max(0, subtotal - totalDiscount);
    const tax = Math.round(taxableAmount * taxRate * 100) / 100;
    const total = Math.max(0, subtotal - totalDiscount + tax);

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          receiptNo: `RCP-${Date.now()}`,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          userId,
          total,
          subtotal,
          tax,
          discount: lineDiscount,
          cashDiscount: invoiceCashDiscount,
          paymentMethod,
          mobileProvider: paymentMethod === "mobile_money" ? mobileProvider : null,
          phoneNumber: paymentMethod === "mobile_money" ? phoneNumber : null,
          transactionId: ["mobile_money", "card"].includes(paymentMethod) ? transactionId : null,
          amountPaid: amountPaid != null ? Number(amountPaid) : null,
          changeGiven: changeGiven != null ? Number(changeGiven) : null,
          items: { create: saleItems.map(({ baseQty, itemType, ...rest }) => rest) },
        },
        include: { items: true, branch: true },
      });

      // Deduct stock in base units (skip service items)
      for (const item of saleItems) {
        if (item.itemType === "service") continue;
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.baseQty } },
        });
      }

      return created;
    });

    res.status(201).json({ message: "Checkout successful", count: cart.length, total, sale });
  } catch (err) {
    console.error("Sales checkout error:", err);
    handleBranchError(res, err);
  }
});

// List sales
router.get("/", authenticateToken, requirePermission("canViewSale"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { from, to, page = 1, limit = 50 } = req.query;
    const where = scopedWhere(scope);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const sales = await prisma.sale.findMany({ where, include: { items: true, branch: true, user: { select: { id: true, fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const count = await prisma.sale.count({ where });
    res.json({ sales, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List sales error:", err);
    handleBranchError(res, err);
  }
});

export default router;
