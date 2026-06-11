import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import { sendMail } from "../../mailer.js";

const router = Router();

// Helper: generate 6-digit OTP
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Helper: generate temp password
function generateTempPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// Helper: email content
function getEmailContent(locale, { ownerFname, businessName, businessId, tempPassword, otp, loginUrl }) {
  const subject = `Your business account is ready - ${businessName}`;
  const html = `
    <p>Hello ${ownerFname},</p>
    <p>Your business <b>${businessName}</b> has been provisioned.</p>
    <p><b>Business ID:</b> ${businessId}</p>
    <p><b>Temporary Password:</b> ${tempPassword}</p>
    <p>Use this OTP to set your password before first login: <b>${otp}</b> (expires in 24 hours).</p>
    <p>Account link: <a href="${loginUrl}">${loginUrl}</a></p>
    <p>Regards,<br/>SaaS Admin</p>`;
  return { subject, html };
}

// List businesses
router.get("/businesses", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
    res.json(tenants);
  } catch (err) {
    console.error("List businesses error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create business
router.post("/businesses", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, planId } = req.body;
    if (!name) return res.status(400).json({ error: "Business name required" });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const tenant = await prisma.tenant.create({ data: { name, slug, email: email || `${slug}@placeholder.com`, phone, address, planId, status: "active" } });
    res.status(201).json({ message: "Business created", tenant });
  } catch (err) {
    console.error("Create business error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List owners
router.get("/owners", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const where = { role: "owner" };
    if (search) {
      where.OR = [
        { fname: { contains: search, mode: "insensitive" } },
        { lname: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: "desc" },
    });
    const owners = users.map(u => ({
      id: u.id,
      name: `${u.fname || ""} ${u.lname || ""}`.trim() || u.email,
      email: u.email,
      role: u.role,
      isActive: true,
      lastLogin: null,
      createdAt: u.createdAt,
      tenant: u.tenant,
    }));
    res.json({ owners });
  } catch (err) {
    console.error("List owners error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset owner password
router.post("/owners/:id/reset-password", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id }, data: { password: hashed } });
    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create owner
router.post("/owners", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { email, password, fname, lname, phone, tenantId } = req.body;
    if (!email || !password || !fname || !lname || !tenantId) {
      return res.status(400).json({ error: "email, password, fname, lname, tenantId required" });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, password: hashed, fname, lname, phone, tenantId, role: "owner" } });
    res.status(201).json({ message: "Owner created", userId: user.id, email, tenantId });
  } catch (err) {
    console.error("Create owner error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin metrics
router.get("/metrics", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalBusinesses, recentBusinesses, activeTenants] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()) } } }),
      prisma.tenant.count({ where: { status: "active" } }),
    ]);

    const plans = await prisma.plan.findMany({ include: { tenants: true } });
    const planCounts = {};
    plans.forEach((p) => { planCounts[p.name] = p.tenants.length; });

    const months = [];
    const revenueByMonth = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
      revenueByMonth.push(0); // TODO: calculate from subscription payments
    }

    const recent = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { name: true, slug: true, status: true, createdAt: true } });
    const uptimeHours = +(process.uptime() / 3600).toFixed(2);

    res.json({
      cards: { totalBusinesses, totalRegistered: recentBusinesses, activeSubscriptions: activeTenants, monthlyRevenue: 0 },
      charts: { revenue: { labels: months, data: revenueByMonth }, plans: { labels: Object.keys(planCounts), data: Object.values(planCounts) } },
      recent,
      uptimeHours,
    });
  } catch (err) {
    console.error("Admin metrics error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subscription upgrade
router.post("/subscription/upgrade", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, planId } = req.body;
    if (!tenantId || !planId) return res.status(400).json({ error: "tenantId and planId required" });
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId, status: "active" } });
    res.json({ message: "Subscription upgraded" });
  } catch (err) {
    console.error("Upgrade error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subscription downgrade
router.post("/subscription/downgrade", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, planId } = req.body;
    if (!tenantId || !planId) return res.status(400).json({ error: "tenantId and planId required" });
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId } });
    res.json({ message: "Subscription downgraded" });
  } catch (err) {
    console.error("Downgrade error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subscription edit
router.post("/subscription/edit", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, planId, status } = req.body;
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    const data = {};
    if (planId) data.planId = planId;
    if (status) data.status = status;
    await prisma.tenant.update({ where: { id: tenantId }, data });
    res.json({ message: "Subscription updated" });
  } catch (err) {
    console.error("Edit subscription error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List subscriptions
router.get("/subscriptions", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    const subscriptions = tenants.map(t => ({
      id: t.id,
      status: t.status || "active",
      startDate: t.createdAt,
      endDate: null,
      tenant: { id: t.id, name: t.name, status: t.status },
      plan: t.plan ? { id: t.plan.id, name: t.plan.name, price: t.plan.price, currency: t.plan.currency || "UGX", billingCycle: t.plan.billingCycle || "monthly" } : null,
    }));

    res.json({ subscriptions });
  } catch (err) {
    console.error("List subscriptions error:", err);
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

// My subscription
router.get("/subscription", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.json({ plan: "free", cycle: "monthly", renews_on: null });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    res.json({ plan: tenant?.plan?.name || "free", cycle: tenant?.plan?.billingCycle || "monthly", renews_on: null });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Renewal status
router.get("/renewal-status", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    res.json({ state: "active", days_left: 30 });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Payment methods (static)
router.get("/payment-methods", authenticateToken, requirePlatformAdmin, (req, res) => {
  res.json([
    { id: "cash", name: "Cash" },
    { id: "mobile_money", name: "Mobile Money" },
    { id: "card", name: "Visa / MasterCard" },
  ]);
});

// Invite owner
router.post("/invite-owner", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId, email, fname, lname, phone, locale } = req.body;
    if (!tenantId || !email || !fname || !lname) return res.status(400).json({ error: "tenantId, email, fname, lname required" });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: "Business not found" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const tempPassword = generateTempPassword(12);
    const hashed = await bcrypt.hash(tempPassword, 12);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: { email, password: hashed, fname, lname, phone, tenantId, role: "owner", otpCode: otp, otpExpires },
    });

    try {
      const frontUrl = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      const { subject, html } = getEmailContent(locale, { ownerFname: fname, businessName: tenant.name, businessId: tenantId, tempPassword, otp, loginUrl: `${frontUrl}/` });
      await sendMail(email, subject, html);
    } catch (e) {
      console.warn("invite-owner: email send failed:", e?.message);
    }

    res.status(201).json({ message: "Owner invited", email, tenantId });
  } catch (err) {
    console.error("Invite owner error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Re-invite owner
router.post("/reinvite-owner/:tenantId", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const owner = await prisma.user.findFirst({ where: { tenantId, role: "owner" } });
    if (!owner) return res.status(404).json({ error: "Owner not found for business" });

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: owner.id }, data: { otpCode: otp, otpExpires } });

    try {
      await sendMail(owner.email, "Password reset code (OTP)", `<p>Hello ${owner.fname || ""},</p><p>Your reset code: <b>${otp}</b></p><p>Expires in 24 hours.</p>`);
    } catch (e) {
      console.warn("reinvite-owner: email send failed:", e?.message);
    }

    res.json({ message: "Owner re-invited", email: owner.email });
  } catch (err) {
    console.error("Reinvite owner error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Provision tenant (business + owner)
router.post(["/create-tenant", "/provision-tenant"], authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { business, owner } = req.body;
    if (!business?.name) return res.status(400).json({ error: "Business name required" });
    if (!owner?.email || !owner?.fname || !owner?.lname) return res.status(400).json({ error: "owner.email, owner.fname, owner.lname required" });

    const existingUser = await prisma.user.findUnique({ where: { email: owner.email } });
    if (existingUser) return res.status(409).json({ error: "Owner email already exists" });

    const slug = business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const tenant = await prisma.tenant.create({
      data: { name: business.name, slug, email: owner.email, phone: owner.phone, status: "active", planId: business.planId },
    });

    const tempPassword = generateTempPassword(12);
    const hashed = await bcrypt.hash(tempPassword, 12);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: { email: owner.email, password: hashed, fname: owner.fname, lname: owner.lname, phone: owner.phone, tenantId: tenant.id, role: "owner", otpCode: otp, otpExpires },
    });

    try {
      const frontUrl = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
      const { subject, html } = getEmailContent(owner.locale, { ownerFname: owner.fname, businessName: business.name, businessId: tenant.id, tempPassword, otp, loginUrl: `${frontUrl}/` });
      await sendMail(owner.email, subject, html);
    } catch (e) {
      console.warn("Provision tenant: email send failed:", e?.message);
    }

    res.status(201).json({ message: "Tenant provisioned", tenantId: tenant.id, slug: tenant.slug, ownerEmail: owner.email });
  } catch (err) {
    console.error("Provision tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Me/features
router.get("/me/features", authenticateToken, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role === "saas_admin") return res.json({ features: [] });

    let roleBaseline = [];
    if (role === "owner") roleBaseline = ["inventory", "sales", "reports"];
    else if (role === "accountant") roleBaseline = ["reports"];
    else if (role === "attendant") roleBaseline = ["sales"];

    const tenantId = req.user?.tenantId;
    let planCodes = [];
    if (tenantId) {
      const tenantFeatures = await prisma.tenantFeature.findMany({ where: { tenantId, enabled: true }, include: { feature: true } });
      planCodes = tenantFeatures.map((tf) => tf.feature.name);
    }

    const effective = planCodes.length ? planCodes : roleBaseline;
    res.json({ features: effective });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Me/profile
router.get("/me/profile", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { tenant: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
