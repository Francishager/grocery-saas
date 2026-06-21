import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../db.js";
import { authenticateToken } from "../../middleware/auth.js";
import { auditLog } from "../utils/audit.js";
import { handleBranchError, resolveBranchScope, scopedWhere } from "../utils/branchAccess.js";

const router = Router();

function authenticateReceipt(req, res, next) {
  if (!req.headers.authorization && req.query?.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return authenticateToken(req, res, next);
}

async function getReceiptData(req) {
  const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
  const sale = await prisma.sale.findFirst({
    where: scopedWhere(scope, { id: req.params.saleId }),
    include: {
      items: { include: { product: true } },
      user: { select: { fname: true, lname: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  if (!sale) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { name: true, email: true, phone: true, address: true },
  });

  return { scope, sale, tenant };
}

function receiptJson(data) {
  const { sale, tenant } = data;
  const cashier = `${sale.user?.fname || ""} ${sale.user?.lname || ""}`.trim();

  return {
    id: sale.id,
    receiptNo: sale.receiptNo,
    business: {
      name: tenant?.name || "JibuSales",
      email: tenant?.email || null,
      phone: tenant?.phone || null,
      address: tenant?.address || null,
    },
    branch: sale.branch || null,
    cashier,
    paymentMethod: sale.paymentMethod || "cash",
    createdAt: sale.createdAt,
    subtotal: sale.subtotal || 0,
    discount: sale.discount || 0,
    tax: sale.tax || 0,
    total: sale.total || 0,
    items: sale.items.map((item) => ({
      id: item.id,
      name: item.product?.name || "Item",
      sku: item.product?.sku || null,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    })),
  };
}

router.get("/:saleId", authenticateReceipt, async (req, res) => {
  try {
    const data = await getReceiptData(req);
    if (!data) return res.status(404).json({ error: "Sale not found" });

    res.json({ receipt: receiptJson(data) });

    auditLog({
      tenantId: data.scope.tenantId,
      userId: req.user.id,
      userEmail: req.user.email,
      action: "read",
      model: "Receipt",
      recordId: data.sale.id,
      ip: req.ip,
    });
  } catch (err) {
    console.error("Receipt data error:", err);
    handleBranchError(res, err, "Failed to load receipt");
  }
});

// Generate PDF receipt for a sale
router.get("/:saleId/pdf", authenticateReceipt, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const sale = await prisma.sale.findFirst({
      where: scopedWhere(scope, { id: req.params.saleId }),
      include: {
        items: { include: { product: true } },
        user: { select: { fname: true, lname: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    if (!sale) return res.status(404).json({ error: "Sale not found" });

    // Get tenant info for receipt header
    const tenant = await prisma.tenant.findUnique({
      where: { id: scope.tenantId },
      select: { name: true, email: true, phone: true, address: true },
    });

    const doc = new PDFDocument({ size: [226.77, 600], margin: 10 }); // 80mm thermal width
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="receipt-${sale.receiptNo}.pdf"`);
      res.send(pdf);
    });

    // Receipt Header
    doc.fontSize(14).font("Helvetica-Bold").text(tenant?.name || "JibuSales", { align: "center" });
    doc.moveDown(0.3);
    if (tenant?.address) doc.fontSize(8).font("Helvetica").text(tenant.address, { align: "center" });
    if (tenant?.phone) doc.fontSize(8).text(`Tel: ${tenant.phone}`, { align: "center" });
    if (tenant?.email) doc.fontSize(8).text(tenant.email, { align: "center" });
    doc.moveDown(0.3);

    // Divider
    doc.fontSize(8).text("-".repeat(40), { align: "center" });
    doc.moveDown(0.2);

    // Receipt info
    doc.fontSize(9).font("Helvetica-Bold").text(`RECEIPT: ${sale.receiptNo}`, { align: "center" });
    doc.fontSize(8).font("Helvetica").text(`Date: ${new Date(sale.createdAt).toLocaleString()}`, { align: "center" });
    doc.fontSize(8).text(`Cashier: ${sale.user?.fname || ""} ${sale.user?.lname || ""}`.trim(), { align: "center" });
    doc.fontSize(8).text(`Payment: ${(sale.paymentMethod || "cash").toUpperCase()}`, { align: "center" });
    doc.moveDown(0.3);

    // Divider
    doc.text("-".repeat(40), { align: "center" });
    doc.moveDown(0.2);

    // Items
    doc.fontSize(8).font("Helvetica-Bold");
    doc.text("ITEM                    QTY   PRICE   TOTAL", { align: "left" });
    doc.font("Helvetica");
    doc.moveDown(0.1);

    for (const item of sale.items) {
      const name = (item.product?.name || "Item").substring(0, 20).padEnd(20);
      const qty = String(item.quantity).padStart(4);
      const price = formatNum(item.price).padStart(7);
      const total = formatNum(item.total).padStart(8);
      doc.fontSize(8).text(`${name}${qty}${price}${total}`);
    }

    doc.moveDown(0.2);
    doc.text("-".repeat(40), { align: "center" });
    doc.moveDown(0.2);

    // Totals
    doc.fontSize(8).font("Helvetica");
    doc.text(`Subtotal:${formatNum(sale.subtotal).padStart(32)}`);
    if (sale.discount > 0) doc.text(`Discount:${formatNum(sale.discount).padStart(31)}`);
    if (sale.tax > 0) doc.text(`Tax:${formatNum(sale.tax).padStart(35)}`);
    doc.fontSize(10).font("Helvetica-Bold").text(`TOTAL:${formatNum(sale.total).padStart(33)}`);
    doc.moveDown(0.5);

    // Footer
    doc.fontSize(8).font("Helvetica").text("Thank you for your purchase!", { align: "center" });
    doc.moveDown(0.2);
    doc.text("Powered by JibuSales", { align: "center" });

    doc.end();

    // Audit
    auditLog({
      tenantId: scope.tenantId,
      userId: req.user.id,
      userEmail: req.user.email,
      action: "read",
      model: "Receipt",
      recordId: sale.id,
      ip: req.ip,
    });
  } catch (err) {
    console.error("Receipt PDF error:", err);
    handleBranchError(res, err, "Failed to generate receipt");
  }
});

// Get ESC/POS raw commands for thermal printing (sent via Web Serial API from frontend)
router.get("/:saleId/escpos", authenticateReceipt, async (req, res) => {
  try {
    const scope = await resolveBranchScope(prisma, req, { source: "query", allowOwnerAll: true });
    const sale = await prisma.sale.findFirst({
      where: scopedWhere(scope, { id: req.params.saleId }),
      include: {
        items: { include: { product: true } },
        user: { select: { fname: true, lname: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    const tenant = await prisma.tenant.findUnique({
      where: { id: scope.tenantId },
      select: { name: true, phone: true, address: true },
    });

    // Build ESC/POS command array (hex strings)
    const cmds = [];

    // Initialize printer
    cmds.push("1B40"); // ESC @

    // Center align
    cmds.push("1B6101"); // ESC a 1

    // Header
    cmds.push(escText(tenant?.name || "JibuSales", true));
    if (tenant?.address) cmds.push(escText(tenant.address));
    if (tenant?.phone) cmds.push(escText(`Tel: ${tenant.phone}`));
    cmds.push(escText(""));

    // Left align
    cmds.push("1B6100"); // ESC a 0

    // Receipt info
    cmds.push(escText(`Receipt: ${sale.receiptNo}`));
    cmds.push(escText(`Date: ${new Date(sale.createdAt).toLocaleString()}`));
    cmds.push(escText(`Cashier: ${sale.user?.fname || ""} ${sale.user?.lname || ""}`.trim()));
    cmds.push(escText(`Payment: ${(sale.paymentMethod || "cash").toUpperCase()}`));
    cmds.push(escText(""));

    // Separator
    cmds.push(escText("--------------------------------"));

    // Items header
    cmds.push(escText("Item               Qty  Price  Total"));

    for (const item of sale.items) {
      const name = (item.product?.name || "Item").substring(0, 18).padEnd(18);
      const qty = String(item.quantity).padStart(3);
      const price = formatNum(item.price).padStart(6);
      const total = formatNum(item.total).padStart(7);
      cmds.push(escText(`${name}${qty}${price}${total}`));
    }

    cmds.push(escText("--------------------------------"));

    // Totals
    cmds.push(escText(`Subtotal:${formatNum(sale.subtotal).padStart(27)}`));
    if (sale.discount > 0) cmds.push(escText(`Discount:${formatNum(sale.discount).padStart(26)}`));
    if (sale.tax > 0) cmds.push(escText(`Tax:${formatNum(sale.tax).padStart(30)}`));
    cmds.push(escDoubleText(`TOTAL:${formatNum(sale.total).padStart(28)}`));

    cmds.push(escText(""));
    cmds.push("1B6101"); // Center
    cmds.push(escText("Thank you for your purchase!"));
    cmds.push(escText("Powered by JibuSales"));

    // Feed and cut
    cmds.push("1B6100"); // Left align
    cmds.push("0A0A0A0A"); // Feed 4 lines
    cmds.push("1D564200"); // GS V 0 (full cut)

    res.json({ commands: cmds, receiptNo: sale.receiptNo });
  } catch (err) {
    console.error("ESC/POS error:", err);
    handleBranchError(res, err, "Failed to generate ESC/POS data");
  }
});

// Helpers
function formatNum(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escText(text, bold = false) {
  const prefix = bold ? "1B4501" : "1B4500"; // ESC E n (bold on/off)
  const suffix = bold ? "1B4500" : "";
  const hex = Buffer.from(text + "\n", "utf8").toString("hex");
  return prefix + hex + suffix;
}

function escDoubleText(text) {
  // Double height + bold
  const hex = Buffer.from(text + "\n", "utf8").toString("hex");
  return "1B2101" + "1B4501" + hex + "1B4500" + "1B2100"; // ESC ! double, ESC E bold, text, reset
}

export default router;
