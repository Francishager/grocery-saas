import { Router } from "express";
import crypto from "crypto";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import { sendMail } from "../../mailer.js";

const router = Router();

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
    res.json({ invitations, total, page: Number(page), limit: Number(limit) });
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.invitation.create({
      data: { email, name, phone, token, expiresAt, tenantId, planId, message, createdById: req.user.id, status: "pending" },
    });

    // Send invitation email
    try {
      const frontUrl = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      const acceptUrl = `${frontUrl}/accept-invitation?token=${token}`;
      await sendMail(email, "You're invited to join", `<p>You've been invited to join the platform.</p><p><a href="${acceptUrl}">Accept Invitation</a></p><p>This invitation expires in 7 days.</p>`);
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
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.invitation.update({ where: { id: inv.id }, data: { token: newToken, expiresAt: newExpiry, status: "pending" } });

    try {
      const frontUrl = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      await sendMail(inv.email, "Invitation resent", `<p><a href="${frontUrl}/accept-invitation?token=${newToken}">Accept Invitation</a></p>`);
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
    const { token, password, fname, lname, phone } = req.body;
    if (!token || !password) return res.status(400).json({ error: "token and password required" });

    const inv = await prisma.invitation.findUnique({ where: { token } });
    if (!inv) return res.status(404).json({ error: "Invalid invitation token" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invitation already used" });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ error: "Invitation expired" });

    const existingUser = await prisma.user.findUnique({ where: { email: inv.email } });
    if (existingUser) return res.status(409).json({ error: "User already exists" });

    const hashed = await (await import("bcryptjs")).default.hash(password, 12);

    const user = await prisma.user.create({
      data: { email: inv.email, password: hashed, fname: fname || inv.name, lname, phone: phone || inv.phone, tenantId: inv.tenantId, role: "owner" },
    });

    await prisma.invitation.update({ where: { id: inv.id }, data: { status: "accepted", acceptedAt: new Date() } });

    res.status(201).json({ message: "Invitation accepted", userId: user.id });
  } catch (err) {
    console.error("Accept invitation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Validate token (public)
router.get("/validate/:token", async (req, res) => {
  try {
    const inv = await prisma.invitation.findUnique({ where: { token: req.params.token } });
    if (!inv) return res.status(404).json({ error: "Invalid token" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invitation already used", status: inv.status });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ error: "Invitation expired" });
    res.json({ valid: true, email: inv.email, name: inv.name, tenantId: inv.tenantId });
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
