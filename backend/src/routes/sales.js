import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission, requireCashAccount } from "../../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";
import { notifyOwnerOfLowStock, notifyOwnerOfSale } from "../utils/notifications.js";
import { syncLinkedTransactionAccountBalance } from "../utils/accountingSync.js";

const router = Router();

const saleRoles = ["owner", "manager", "attendant"];

const toMoney = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

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

function userHasEffectivePermission(req, permission) {
  const permissions = req.user?.permissions || [];
  return permissions.includes(permission) || permissions.includes("*");
}

async function checkDiscountPermission(req, userId, saleItems, cashDiscount = 0) {
  const invoiceCashDiscount = Number(cashDiscount) || 0;
  const hasLineItemDiscount = saleItems.some((item) =>
    Number(item.discount || 0) > 0 || Number(item.cashDiscount || 0) > 0
  );
  const hasAnyDiscount = hasLineItemDiscount || invoiceCashDiscount > 0;

  if (!hasAnyDiscount) {
    return { allowed: true, invoiceCashDiscount };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      discountPermission: true,
      permissions: { select: { canGiveDiscount: true } },
    },
  });

  const canGiveDiscount =
    userHasEffectivePermission(req, "canGiveDiscount") ||
    Boolean(user?.permissions?.canGiveDiscount);
  const discountPermission = user?.discountPermission || "none";

  if (!canGiveDiscount && discountPermission === "none") {
    return { allowed: false, invoiceCashDiscount, error: "You do not have permission to give discounts" };
  }

  if (!canGiveDiscount) {
    if (hasLineItemDiscount && discountPermission === "invoice") {
      return { allowed: false, invoiceCashDiscount, error: "You can only give invoice-level discounts" };
    }
    if (invoiceCashDiscount > 0 && discountPermission === "lineItem") {
      return { allowed: false, invoiceCashDiscount, error: "You can only give line item discounts" };
    }
  }

  return { allowed: true, invoiceCashDiscount };
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

    const costPerBaseUnit = Number(product.cost || 0);
    const costConversionFactor = Number(conversionFactor || 1);
    const effectiveCost = costPerBaseUnit * (Number.isFinite(costConversionFactor) && costConversionFactor > 0 ? costConversionFactor : 1);
    const lineTotal = effectivePrice * item.quantity;
    const totalDiscount = item.discount + item.cashDiscount;
    return {
      productId: item.productId,
      quantity: item.quantity, // quantity in selling units
      baseQty, // quantity in base units (for stock deduction)
      price: effectivePrice,
      cost: effectiveCost,
      discount: item.discount,
      cashDiscount: item.cashDiscount,
      unitName,
      conversionFactor,
      itemType: product.itemType || "product",
      productName: product.name,
      total: Math.max(0, lineTotal - totalDiscount),
    };
  });
}

async function getCustomerCreditInfo(scope, customerId) {
  const customer = await prisma.customer.findFirst({
    where: scopedWhere(scope, { id: customerId }),
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      creditLimit: true,
      balance: true,
      openingBalance: true,
      openingBalanceDate: true,
      openingBalanceNote: true,
      status: true,
    },
  });

  if (!customer) return null;

  const [outstandingSales, recentPayments] = await Promise.all([
    prisma.saleRecord.findMany({
      where: scopedWhere(scope, {
        customerId,
        balance: { gt: 0 },
        status: { not: "cancelled" },
      }),
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, itemType: true, baseUnit: true } },
          },
        },
        User: { select: { id: true, fname: true, lname: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.customerPayment.findMany({
      where: scopedWhere(scope, { customerId }),
      include: {
        sale: { select: { id: true, receiptNo: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const saleItems = (sale) =>
    sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name || "Item",
      itemType: item.product?.itemType || "product",
      quantity: item.quantity,
      unitName: item.unitName || item.product?.baseUnit || "",
      unitPrice: item.price,
      discount: toMoney(item.discount) + toMoney(item.cashDiscount),
      total: item.total,
    }));

  const outstandingItems = outstandingSales.flatMap((sale) =>
    saleItems(sale).map((item) => ({
      ...item,
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      date: sale.createdAt,
      dueDate: sale.dueDate,
      saleTotal: sale.total,
      amountPaid: sale.amountPaid,
      saleBalance: sale.balance,
      paymentStatus: sale.paymentStatus,
      staff: [sale.User?.fname, sale.User?.lname].filter(Boolean).join(" ") || "Staff",
      branch: sale.branch?.name || "",
    }))
  );

  return {
    customer,
    summary: {
      balance: toMoney(customer.balance),
      creditLimit: toMoney(customer.creditLimit),
      openingBalance: toMoney(customer.openingBalance),
      outstandingSalesCount: outstandingSales.length,
      outstandingItemsCount: outstandingItems.length,
      overdueSalesCount: outstandingSales.filter((sale) => sale.dueDate && sale.dueDate < new Date()).length,
      oldestOutstandingDate: outstandingSales[0]?.createdAt || customer.openingBalanceDate || null,
    },
    outstandingSales: outstandingSales.map((sale) => ({
      id: sale.id,
      receiptNo: sale.receiptNo,
      date: sale.createdAt,
      dueDate: sale.dueDate,
      total: sale.total,
      amountPaid: sale.amountPaid,
      balance: sale.balance,
      paymentStatus: sale.paymentStatus,
      paymentMethod: sale.paymentMethod,
      staff: [sale.User?.fname, sale.User?.lname].filter(Boolean).join(" ") || "Staff",
      branch: sale.branch?.name || "",
      items: saleItems(sale),
    })),
    outstandingItems,
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      saleId: payment.saleId,
      receiptNo: payment.sale?.receiptNo || "",
      date: payment.createdAt,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference || payment.transactionId || "",
      notes: payment.notes || "",
      branch: payment.branch?.name || "",
    })),
  };
}

router.get("/customers/credit-options", authenticateToken, requirePermission("canCreateSale"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 10000);
    const search = String(req.query.search || "").trim();
    const where = scopedWhere(scope, {
      status: "active",
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    });
    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true, balance: true, creditLimit: true },
      orderBy: { name: "asc" },
      take: limit,
    });
    res.json({ customers });
  } catch (err) {
    console.error("Sales customer credit options error:", err);
    handleBranchError(res, err, "Failed to fetch customer credit options");
  }
});

router.get("/customers/:id/credit-info", authenticateToken, requirePermission("canCreateSale"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const payload = await getCustomerCreditInfo(scope, req.params.id);
    if (!payload) return res.status(404).json({ error: "Customer not found" });
    res.json(payload);
  } catch (err) {
    console.error("Sales customer credit info error:", err);
    handleBranchError(res, err, "Failed to fetch customer credit information");
  }
});

// Create single sale
router.post("/", authenticateToken, requirePermission("canCreateSale"), requireCashAccount, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { items = [], paymentMethod = "cash", notes, cashDiscount = 0, mobileProvider, phoneNumber, transactionId } = req.body;
    if (!items.length) return res.status(400).json({ error: "Items required" });

    const discountCheck = await checkDiscountPermission(req, userId, items, cashDiscount);
    if (!discountCheck.allowed) {
      return res.status(403).json({ error: discountCheck.error });
    }
    const { invoiceCashDiscount } = discountCheck;

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
          items: { create: saleItems.map(({ baseQty, itemType, productName, ...rest }) => rest) },
        },
        include: { items: true, branch: true },
      });

      // Deduct stock in base units (skip service items)
      for (const item of saleItems) {
        if (item.itemType === "service") continue;
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.baseQty } },
        });
        if (updatedProduct && updatedProduct.quantity <= (updatedProduct.minStock || 0)) {
          await notifyOwnerOfLowStock({ prismaClient: tx, tenantId: scope.tenantId, product: updatedProduct });
        }
      }

      // Add sale total to user's assigned cash account (money coming in)
      if (req.userCashAccountId) {
        const updatedAccount = await tx.cashAccount.update({
          where: { id: req.userCashAccountId },
          data: { balance: { increment: total } },
        });

        await tx.cashTransaction.create({
          data: {
            tenantId: scope.tenantId,
            accountId: req.userCashAccountId,
            type: "sale",
            amount: total,
            balanceAfter: updatedAccount.balance,
            reference: created.receiptNo,
            description: `Sale: ${created.receiptNo}`,
            userId,
          },
        });

        await syncLinkedTransactionAccountBalance(tx, scope.tenantId, req.userCashAccountId);
      }

      return created;
    });

    await notifyOwnerOfSale({
      tenantId: scope.tenantId,
      sale,
      user: await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null),
      itemDetails: saleItems.map((item) => ({
        name: item.productName || item.productId,
        price: item.price,
      })),
      branchName: sale.branch?.name || null,
    });

    res.status(201).json({ message: "Sale recorded", sale });
  } catch (err) {
    console.error("Sale create error:", err);
    handleBranchError(res, err);
  }
});

// Checkout multiple items
router.post("/checkout", authenticateToken, requirePermission("canCreateSale"), requireCashAccount, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, {
      source: "body",
      requireBranch: true,
      allowOwnerAll: false,
    });
    const userId = req.user?.id;
    const { cart = [], paymentMethod = "cash", cashDiscount = 0, mobileProvider, phoneNumber, transactionId, customerName, amountPaid, changeGiven } = req.body;
    if (!cart.length) return res.status(400).json({ error: "Cart is empty" });

    const discountCheck = await checkDiscountPermission(req, userId, cart, cashDiscount);
    if (!discountCheck.allowed) {
      return res.status(403).json({ error: discountCheck.error });
    }
    const { invoiceCashDiscount } = discountCheck;

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
          customerName: customerName?.trim() || null,
          amountPaid: amountPaid != null ? Number(amountPaid) : null,
          changeGiven: changeGiven != null ? Number(changeGiven) : null,
          items: { create: saleItems.map(({ baseQty, itemType, productName, ...rest }) => rest) },
        },
        include: { items: true, branch: true },
      });

      // Deduct stock in base units (skip service items)
      for (const item of saleItems) {
        if (item.itemType === "service") continue;
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.baseQty } },
        });
        if (updatedProduct && updatedProduct.quantity <= (updatedProduct.minStock || 0)) {
          await notifyOwnerOfLowStock({ prismaClient: tx, tenantId: scope.tenantId, product: updatedProduct });
        }
      }

      // Add sale total to user's assigned cash account (money coming in)
      if (req.userCashAccountId) {
        const updatedAccount = await tx.cashAccount.update({
          where: { id: req.userCashAccountId },
          data: { balance: { increment: total } },
        });

        await tx.cashTransaction.create({
          data: {
            tenantId: scope.tenantId,
            accountId: req.userCashAccountId,
            type: "sale",
            amount: total,
            balanceAfter: updatedAccount.balance,
            reference: created.receiptNo,
            description: `Sale: ${created.receiptNo}`,
            userId,
          },
        });

        await syncLinkedTransactionAccountBalance(tx, scope.tenantId, req.userCashAccountId);
      }

      return created;
    });

    await notifyOwnerOfSale({
      tenantId: scope.tenantId,
      sale,
      user: await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null),
      itemDetails: saleItems.map((item) => ({
        name: item.productName || item.productId,
        price: item.price,
      })),
      branchName: sale.branch?.name || null,
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
    const sales = await prisma.sale.findMany({ where, include: { items: { include: { product: { select: { id: true, name: true } } } }, branch: true, user: { select: { id: true, fname: true, lname: true } } }, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) });
    const count = await prisma.sale.count({ where });
    res.json({ sales, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List sales error:", err);
    handleBranchError(res, err);
  }
});

export default router;
