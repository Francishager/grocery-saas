import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../src/utils/branchAccess.js";

const router = Router();
const prisma = new PrismaClient();

const toMoney = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const userSelect = { select: { id: true, fname: true, lname: true } };

const withUser = (record) => {
  if (!record) return record;
  const { User, ...rest } = record;
  return { ...rest, user: User || record.user || null };
};

// List rentals with filters
router.get("/", authenticateToken, requirePermission("canViewRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { page = 1, limit = 50, status, customerId, startDate, endDate } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = scopedWhere(scope, {
      ...(status && { status }),
      ...(customerId && { customerId }),
      ...(startDate && endDate && {
        hireDate: { gte: new Date(startDate), lte: new Date(endDate) },
      }),
    });

    const [rentals, total] = await Promise.all([
      prisma.rental.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.rental.count({ where }),
    ]);

    res.json({
      rentals: rentals.map(withUser),
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error("Rentals list error:", err);
    handleBranchError(res, err, "Failed to fetch rentals");
  }
});

// Get single rental
router.get("/:id", authenticateToken, requirePermission("canViewRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id: req.params.id }),
      include: {
        customer: true,
        branch: true,
        User: userSelect,
        items: { include: { product: { select: { id: true, name: true, sku: true, rentalPrice: true, replacementValue: true } } } },
      },
    });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    res.json(withUser(rental));
  } catch (err) {
    console.error("Rental get error:", err);
    handleBranchError(res, err, "Failed to fetch rental");
  }
});

// Create new rental (hire out items)
router.post("/", authenticateToken, requirePermission("canCreateRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", requireBranch: true, allowOwnerAll: false });
    const {
      customerId,
      items,
      expectedReturnDate,
      paymentMethod = "cash",
      amountPaid = 0,
      depositAmount = 0,
      notes,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "At least one rental item is required" });
    if (!expectedReturnDate) return res.status(400).json({ error: "Expected return date is required" });

    // Verify customer if provided
    let customer = null;
    if (customerId) {
      customer = await prisma.customer.findFirst({ where: scopedWhere(scope, { id: customerId }) });
      if (!customer) return res.status(404).json({ error: "Customer not found" });
    }

    // Verify products are rental type and have stock
    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    const products = await prisma.product.findMany({
      where: scopedWhere(scope, { id: { in: productIds }, isActive: { not: false } }),
    });
    const productsById = new Map(products.map((p) => [p.id, p]));

    if (products.length !== productIds.length) return res.status(400).json({ error: "One or more items were not found" });

    const rentalItems = items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
      if (product.itemType !== "rental") throw Object.assign(new Error(`${product.name} is not a rental item`), { statusCode: 400 });

      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
      if (product.quantity < quantity) {
        throw Object.assign(new Error(`${product.name} has only ${product.quantity} available`), { statusCode: 400 });
      }

      const unitHirePrice = toMoney(item.unitHirePrice, product.rentalPrice || product.price || 0);
      const periods = Math.max(1, Number.parseInt(item.periods, 10) || 1);
      const totalAmount = unitHirePrice * quantity * periods;

      return {
        productId: item.productId,
        quantity,
        unitHirePrice,
        rentalPeriod: item.rentalPeriod || product.rentalPeriod || "daily",
        periods,
        totalAmount,
        conditionOut: item.conditionOut || "good",
        notes: item.notes || null,
      };
    });

    const totalAmount = rentalItems.reduce((sum, i) => sum + i.totalAmount, 0);
    const deposit = toMoney(depositAmount);
    const paid = Math.min(toMoney(amountPaid), totalAmount);
    const balance = Math.max(0, totalAmount - paid);
    const paymentStatus = paid >= totalAmount ? "paid" : paid > 0 ? "partial" : "unpaid";
    const rentalNo = `HIRE-${Date.now()}`;

    const rental = await prisma.$transaction(async (tx) => {
      const created = await tx.rental.create({
        data: {
          rentalNo,
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          customerId: customerId || null,
          userId: req.user.id,
          expectedReturnDate: new Date(expectedReturnDate),
          totalAmount,
          depositAmount: deposit,
          depositStatus: deposit > 0 ? "collected" : "collected",
          amountPaid: paid,
          balance,
          paymentStatus,
          paymentMethod,
          status: "active",
          notes,
          items: {
            create: rentalItems.map(({ ...rest }) => rest),
          },
        },
        include: {
          customer: true,
          branch: true,
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
      });

      // Decrement stock for each rental item (items are going out)
      for (const item of rentalItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      return created;
    });

    res.status(201).json(withUser(rental));
  } catch (err) {
    console.error("Create rental error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    handleBranchError(res, err, "Failed to create rental");
  }
});

// Process return of rental items
router.post("/:id/return", authenticateToken, requirePermission("canProcessRentalReturn"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { id } = req.params;
    const { items: returnItems, depositStatus = "refunded", damageFees = {} } = req.body;

    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id }),
      include: { items: { include: { product: true } }, customer: true },
    });

    if (!rental) return res.status(404).json({ error: "Rental not found" });
    if (rental.status === "returned") return res.status(400).json({ error: "Rental already returned" });
    if (rental.status === "cancelled") return res.status(400).json({ error: "Rental was cancelled" });

    const updated = await prisma.$transaction(async (tx) => {
      let totalDamageFee = 0;

      // Process each returned item
      for (const rentalItem of rental.items) {
        const returnInfo = returnItems?.find((ri) => ri.rentalItemId === rentalItem.id);
        const conditionReturn = returnInfo?.conditionReturn || "good";
        const damageFee = toMoney(damageFees[rentalItem.id] || returnInfo?.damageFee || 0);

        if (damageFee > 0) totalDamageFee += damageFee;

        // Update rental item with return condition and damage fee
        await tx.rentalItem.update({
          where: { id: rentalItem.id },
          data: {
            conditionReturn,
            damageFee: damageFee > 0 ? damageFee : null,
          },
        });

        // Increment stock back (item returned)
        // If condition is "broken", don't return to stock
        if (conditionReturn !== "broken") {
          await tx.product.update({
            where: { id: rentalItem.productId },
            data: { quantity: { increment: rentalItem.quantity } },
          });
        }
      }

      // Update rental status
      const finalDepositStatus = depositStatus;
      const updatedRental = await tx.rental.update({
        where: { id },
        data: {
          status: "returned",
          actualReturnDate: new Date(),
          depositStatus: finalDepositStatus,
          balance: rental.balance + totalDamageFee,
          totalAmount: rental.totalAmount + totalDamageFee,
        },
        include: {
          customer: true,
          branch: true,
          User: userSelect,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
      });

      return updatedRental;
    });

    res.json(withUser(updated));
  } catch (err) {
    console.error("Return rental error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    handleBranchError(res, err, "Failed to process rental return");
  }
});

// Update rental (before items go out)
router.put("/:id", authenticateToken, requirePermission("canEditRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "body", allowOwnerAll: true });
    const { id } = req.params;
    const { expectedReturnDate, notes, paymentMethod, amountPaid } = req.body;

    const rental = await prisma.rental.findFirst({ where: scopedWhere(scope, { id }) });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    if (rental.status === "returned") return res.status(400).json({ error: "Cannot edit a returned rental" });

    const data = {};
    if (expectedReturnDate) data.expectedReturnDate = new Date(expectedReturnDate);
    if (notes !== undefined) data.notes = notes;
    if (paymentMethod) data.paymentMethod = paymentMethod;
    if (amountPaid !== undefined) {
      const paid = toMoney(amountPaid);
      data.amountPaid = Math.min(paid, rental.totalAmount);
      data.balance = Math.max(0, rental.totalAmount - data.amountPaid);
      data.paymentStatus = data.amountPaid >= rental.totalAmount ? "paid" : data.amountPaid > 0 ? "partial" : "unpaid";
    }

    const updated = await prisma.rental.update({
      where: { id },
      data,
      include: { customer: true, branch: true, User: userSelect, items: { include: { product: { select: { id: true, name: true } } } } },
    });

    res.json(withUser(updated));
  } catch (err) {
    console.error("Update rental error:", err);
    handleBranchError(res, err, "Failed to update rental");
  }
});

// Cancel rental (before items go out — stock was already decremented, so restore it)
router.delete("/:id", authenticateToken, requirePermission("canDeleteRental"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const { id } = req.params;

    const rental = await prisma.rental.findFirst({
      where: scopedWhere(scope, { id }),
      include: { items: true },
    });
    if (!rental) return res.status(404).json({ error: "Rental not found" });
    if (rental.status === "returned") return res.status(400).json({ error: "Cannot delete a returned rental" });

    await prisma.$transaction(async (tx) => {
      // Restore stock for all items
      for (const item of rental.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }

      await tx.rental.update({
        where: { id },
        data: { status: "cancelled" },
      });
    });

    res.json({ message: "Rental cancelled and stock restored" });
  } catch (err) {
    console.error("Cancel rental error:", err);
    handleBranchError(res, err, "Failed to cancel rental");
  }
});

// Rentals summary/report
router.get("/report/summary", authenticateToken, requirePermission("canViewRentalReport"), async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });

    const [activeRentals, overdueRentals, totalRevenue, totalDeposits] = await Promise.all([
      prisma.rental.count({ where: scopedWhere(scope, { status: "active" }) }),
      prisma.rental.count({
        where: scopedWhere(scope, {
          status: "active",
          expectedReturnDate: { lt: new Date() },
        }),
      }),
      prisma.rental.aggregate({
        where: scopedWhere(scope, { status: "returned" }),
        _sum: { totalAmount: true },
      }),
      prisma.rental.aggregate({
        where: scopedWhere(scope, { status: "active", depositStatus: "collected" }),
        _sum: { depositAmount: true },
      }),
    ]);

    res.json({
      activeRentals,
      overdueRentals,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalDepositsHeld: totalDeposits._sum.depositAmount || 0,
    });
  } catch (err) {
    console.error("Rental summary error:", err);
    handleBranchError(res, err, "Failed to fetch rental summary");
  }
});

export default router;
