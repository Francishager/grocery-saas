import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireRole } from "../../middleware/auth.js";

const router = Router();

// Dashboard KPIs
router.get("/kpis", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [salesThisMonth, salesLastMonth, purchasesThisMonth, products, lowStockProducts, customers] = await Promise.all([
      prisma.sale.aggregate({ where: { tenantId, createdAt: { gte: startOfMonth } }, _sum: { total: true }, _count: true }),
      prisma.sale.aggregate({ where: { tenantId, createdAt: { gte: startOfLastMonth, lt: startOfMonth } }, _sum: { total: true } }),
      prisma.purchase.aggregate({ where: { tenantId, createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
      prisma.product.count({ where: { tenantId, isActive: true } }),
      prisma.product.count({ where: { tenantId, isActive: true, quantity: { lte: 10 } } }),
      prisma.customer.count({ where: { tenantId } }),
    ]);

    const revenueThisMonth = salesThisMonth._sum.total || 0;
    const revenueLastMonth = salesLastMonth._sum.total || 0;
    const revenueChange = revenueLastMonth ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100).toFixed(1) : 0;

    res.json({
      revenue: revenueThisMonth,
      revenueChange: Number(revenueChange),
      salesCount: salesThisMonth._count,
      purchases: purchasesThisMonth._sum.total || 0,
      productCount: products,
      lowStockCount: lowStockProducts,
      customerCount: customers,
    });
  } catch (err) {
    console.error("Dashboard KPIs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Sales chart data
router.get("/sales-chart", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const now = new Date();
    const months = [];
    const data = [];

    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      months.push(label);

      const result = await prisma.sale.aggregate({ where: { tenantId, createdAt: { gte: start, lt: end } }, _sum: { total: true } });
      data.push(result._sum.total || 0);
    }

    res.json({ labels: months, data });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
