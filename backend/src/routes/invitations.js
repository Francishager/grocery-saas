import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import { sendMail } from "../../mailer.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateTempPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function createTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, isPlatformUser: user.role === "saas_admin" },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
  const refreshToken = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken, expiresIn: 86400, tokenType: "Bearer" };
}

// List invitations
router.get("/", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;

    const invitations = await prisma.invitation.findMany({
      where,
      include: { tenant: { select: { name: true, slug: true } }, createdBy: { select: { fname: true, lname: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.invitation.count({ where });

    const [pending, accepted, expired, cancelled] = await Promise.all([
      prisma.invitation.count({ where: { status: "pending" } }),
      prisma.invitation.count({ where: { status: "accepted" } }),
      prisma.invitation.count({ where: { status: "expired" } }),
      prisma.invitation.count({ where: { status: "cancelled" } }),
    ]);

    res.json({ invitations, total, stats: { pending, accepted, expired, cancelled, total: pending + accepted + expired + cancelled } });
  } catch (err) {
    console.error("List invitations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create invitation
router.post("/", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { email, name, phone, tenantId, planId, message } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const token = crypto.randomBytes(32).toString("hex");
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.invitation.create({
      data: { email, name, phone, token, otpCode, expiresAt, tenantId, planId, message, createdById: req.user.id, status: "pending" },
    });

    try {
      const frontUrl = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      const acceptUrl = `${frontUrl}/accept-invitation/${token}`;
      await sendMail(email, "You're invited to join",
        `<p>Hello ${name || ""},</p>
         <p>You've been invited to join the platform.</p>
         <p><b>Your verification code (OTP):</b> ${otpCode}</p>
         <p><a href="${acceptUrl}">Accept Invitation</a></p>
         <p>This invitation expires in 7 days.</p>`);
    } catch (e) {
      console.warn("Invitation email send failed:", e?.message);
    }

    res.status(201).json({ message: "Invitation created", invitation });
  } catch (err) {
    console.error("Create invitation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancel invitation
router.post("/:id/cancel", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const invitation = await prisma.invitation.update({ where: { id: req.params.id }, data: { status: "cancelled" } });
    res.json({ message: "Invitation cancelled", invitation });
  } catch (err) {
    console.error("Cancel invitation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Resend invitation
router.post("/:id/resend", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const inv = await prisma.invitation.findUnique({ where: { id: req.params.id } });
    if (!inv) return res.status(404).json({ error: "Invitation not found" });

    const newToken = crypto.randomBytes(32).toString("hex");
    const newOtp = generateOTP();
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.invitation.update({ where: { id: inv.id }, data: { token: newToken, otpCode: newOtp, expiresAt: newExpiry, status: "pending" } });

    try {
      const frontUrl = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      await sendMail(inv.email, "Invitation resent",
        `<p>Hello ${inv.name || ""},</p>
         <p>Your invitation has been resent.</p>
         <p><b>Your new verification code (OTP):</b> ${newOtp}</p>
         <p><a href="${frontUrl}/accept-invitation/${newToken}">Accept Invitation</a></p>`);
    } catch (e) {
      console.warn("Resend email failed:", e?.message);
    }

    res.json({ message: "Invitation resent" });
  } catch (err) {
    console.error("Resend invitation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Accept invitation (public - token based)
router.post("/accept", async (req, res) => {
  try {
    const { token, otp, password, fname, lname, phone, businessName } = req.body;
    if (!token || !otp || !password) return res.status(400).json({ error: "token, otp and password required" });

    const inv = await prisma.invitation.findUnique({ where: { token } });
    if (!inv) return res.status(404).json({ error: "Invalid invitation token" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invitation already used" });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ error: "Invitation expired" });
    if (inv.otpCode !== otp) return res.status(400).json({ error: "Invalid OTP" });

    const existingUser = await prisma.user.findUnique({ where: { email: inv.email } });
    if (existingUser) return res.status(409).json({ error: "User already exists" });

    let tenantId = inv.tenantId;
    if (!tenantId && businessName) {
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const tenant = await prisma.tenant.create({
        data: { name: businessName, slug, email: inv.email, phone: phone || inv.phone, status: "active", planId: inv.planId },
      });
      tenantId = tenant.id;
    }

    const hashed = await (await import("bcryptjs")).default.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: inv.email,
        password: hashed,
        fname: fname || inv.name || inv.email.split("@")[0],
        lname,
        phone: phone || inv.phone,
        tenantId,
        role: "owner",
      },
    });

    await prisma.invitation.update({ where: { id: inv.id }, data: { status: "accepted", acceptedAt: new Date(), tenantId } });

    const tokens = createTokens(user);
    const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null;

    res.status(201).json({
      message: "Invitation accepted",
      user: { id: user.id, email: user.email, name: `${user.fname || ""} ${user.lname || ""}`.trim(), role: user.role, tenantId: user.tenantId },
      tokens,
      tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
    });
  } catch (err) {
    console.error("Accept invitation error:", err);
    res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

// Validate token (public) - frontend compatible alias
router.get("/token/:token", async (req, res) => {
  try {
    const inv = await prisma.invitation.findUnique({ where: { token: req.params.token } });
    if (!inv) return res.status(404).json({ error: "Invalid token" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invitation already used", status: inv.status });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ error: "Invitation expired" });
    res.json({ valid: true, email: inv.email, name: inv.name, tenantId: inv.tenantId, planId: inv.planId });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Validate token (public) - original endpoint
router.get("/validate/:token", async (req, res) => {
  try {
    const inv = await prisma.invitation.findUnique({ where: { token: req.params.token } });
    if (!inv) return res.status(404).json({ error: "Invalid token" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invitation already used", status: inv.status });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ error: "Invitation expired" });
    res.json({ valid: true, email: inv.email, name: inv.name, tenantId: inv.tenantId, planId: inv.planId });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Invitation stats
router.get("/stats", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const [pending, accepted, expired, cancelled] = await Promise.all([
      prisma.invitation.count({ where: { status: "pending" } }),
      prisma.invitation.count({ where: { status: "accepted" } }),
      prisma.invitation.count({ where: { status: "expired" } }),
      prisma.invitation.count({ where: { status: "cancelled" } }),
    ]);
    res.json({ pending, accepted, expired, cancelled, total: pending + accepted + expired + cancelled });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
