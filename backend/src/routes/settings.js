import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePermission } from "../../middleware/auth.js";
import { tenantIdFromUser } from "../utils/branchAccess.js";
import multer from "multer";
import cloudinary from "cloudinary";

const router = Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Get tenant settings
router.get("/", authenticateToken, requirePermission("canViewSettings"), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, slug: true, email: true, phone: true, address: true,
        logo: true, status: true, currency: true, timezone: true, taxRate: true,
        taxEnabled: true, taxId: true, receiptHeader: true, receiptFooter: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json(tenant);
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// Update tenant settings
router.put("/", authenticateToken, requirePermission("canEditSettings"), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const { name, email, phone, address, currency, timezone, taxRate, taxEnabled, taxId, receiptHeader, receiptFooter } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone || null;
    if (address !== undefined) data.address = address || null;
    if (currency !== undefined) data.currency = currency;
    if (timezone !== undefined) data.timezone = timezone;
    if (taxRate !== undefined) data.taxRate = parseFloat(taxRate) || 0;
    if (taxEnabled !== undefined) data.taxEnabled = Boolean(taxEnabled);
    if (taxId !== undefined) data.taxId = taxId || null;
    if (receiptHeader !== undefined) data.receiptHeader = receiptHeader || null;
    if (receiptFooter !== undefined) data.receiptFooter = receiptFooter || null;

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        id: true, name: true, slug: true, email: true, phone: true, address: true,
        logo: true, status: true, currency: true, timezone: true, taxRate: true,
        taxEnabled: true, taxId: true, receiptHeader: true, receiptFooter: true,
        createdAt: true, updatedAt: true,
      },
    });
    res.json({ message: "Settings updated", tenant });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Email already in use" });
    console.error("Update settings error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Upload logo to Cloudinary
router.post("/logo", authenticateToken, requirePermission("canEditSettings"), upload.single("logo"), async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: `jibusales/logos/${tenantId}`, public_id: `logo-${Date.now()}`, overwrite: true },
      async (error, cloudResult) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json({ error: "Failed to upload logo" });
        }
        const logoUrl = cloudResult.secure_url;
        await prisma.tenant.update({ where: { id: tenantId }, data: { logo: logoUrl } });
        res.json({ message: "Logo uploaded", logo: logoUrl });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    console.error("Upload logo error:", err);
    res.status(500).json({ error: "Failed to upload logo" });
  }
});

export default router;
