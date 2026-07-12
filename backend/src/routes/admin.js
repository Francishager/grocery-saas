import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import { sendMail } from "../../mailer.js";
import { auditLog } from "../utils/audit.js";

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

function splitName(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    fname: parts[0] || "",
    lname: parts.slice(1).join(" "),
  };
}

function frontendOrigin() {
  return process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
}

function subscriptionPayload(tenant) {
  return {
    id: tenant.id,
    status: tenant.status || "active",
    startDate: tenant.subscriptionStart || tenant.createdAt,
    endDate: tenant.subscriptionEnd || null,
    trialEndsAt: tenant.trialEndsAt || null,
    tenant: { id: tenant.id, name: tenant.name, status: tenant.status },
    plan: tenant.plan ? {
      id: tenant.plan.id,
      name: tenant.plan.name,
      price: tenant.plan.price,
      currency: tenant.plan.currency || "UGX",
      billingCycle: tenant.plan.billingCycle || "monthly",
      maxUsers: tenant.plan.maxUsers || 0,
      maxProducts: tenant.plan.maxProducts || 0,
    } : null,
  };
}

async function updateSubscription(req, res) {
  try {
    const {
      planId,
      status,
      subscriptionStart,
      subscriptionEnd,
      trialEndsAt,
      price,
      billingCycle,
      maxUsers,
      maxProducts,
    } = req.body;

    if (!planId && !status && !subscriptionStart && !subscriptionEnd && !trialEndsAt && price === undefined && billingCycle === undefined && maxUsers === undefined && maxProducts === undefined) {
      return res.status(400).json({ error: "At least one subscription field is required" });
    }

    const targetPlanId = planId || req.body?.currentPlanId;

    if (targetPlanId) {
      const plan = await prisma.plan.findUnique({ where: { id: targetPlanId } });
      if (!plan) return res.status(404).json({ error: "Plan not found" });
    }

    if (status && !["active", "suspended", "cancelled", "trial"].includes(status)) {
      return res.status(400).json({ error: "Invalid subscription status" });
    }

    const data = {};
    const planUpdateData = {};

    if (targetPlanId) data.planId = targetPlanId;
    if (status) data.status = status;
    if (subscriptionStart) data.subscriptionStart = new Date(subscriptionStart);
    if (subscriptionEnd) data.subscriptionEnd = new Date(subscriptionEnd);
    if (trialEndsAt) data.trialEndsAt = new Date(trialEndsAt);

    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: "Price must be a non-negative number" });
      }
      planUpdateData.price = parsedPrice;
    }

    if (billingCycle) {
      if (!['monthly', 'yearly'].includes(String(billingCycle).toLowerCase())) {
        return res.status(400).json({ error: "Billing cycle must be monthly or yearly" });
      }
      planUpdateData.billingCycle = String(billingCycle).toLowerCase();
    }

    if (maxUsers !== undefined) {
      const parsedMaxUsers = Number(maxUsers);
      if (!Number.isInteger(parsedMaxUsers) || parsedMaxUsers < 1) {
        return res.status(400).json({ error: "Max users must be a positive integer" });
      }
      planUpdateData.maxUsers = parsedMaxUsers;
    }

    if (maxProducts !== undefined) {
      const parsedMaxProducts = Number(maxProducts);
      if (!Number.isInteger(parsedMaxProducts) || parsedMaxProducts < 1) {
        return res.status(400).json({ error: "Max products must be a positive integer" });
      }
      planUpdateData.maxProducts = parsedMaxProducts;
    }

    if (Object.keys(planUpdateData).length > 0 && targetPlanId) {
      await prisma.plan.update({ where: { id: targetPlanId }, data: planUpdateData });
    }

    if (targetPlanId && !subscriptionEnd) {
      const plan = await prisma.plan.findUnique({ where: { id: targetPlanId } });
      const startDate = subscriptionStart ? new Date(subscriptionStart) : new Date();
      const endDate = new Date(startDate);
      if (plan?.billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      data.subscriptionStart = startDate;
      data.subscriptionEnd = endDate;
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
      include: { plan: true },
    });

    res.json({
      message: "Subscription updated",
      subscription: subscriptionPayload(tenant),
    });
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Subscription not found" });
    console.error("Update subscription error:", err);
    res.status(500).json({ error: "Failed to update subscription" });
  }
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
    const { name, slug: requestedSlug, email, phone, address, planId } = req.body;
    if (!name) return res.status(400).json({ error: "Business name required" });

    const slug = (requestedSlug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const tenant = await prisma.tenant.create({ data: { name, slug, email: email || `${slug}@placeholder.com`, phone, address, planId, status: "active" } });
    res.status(201).json({ message: "Business created", tenant, id: tenant.id, tenantId: tenant.id });
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
    const user = await prisma.user.update({ where: { id }, data: { password: hashed } });

    // Audit log: password reset - track which tenant's owner was reset
    auditLog({
      tenantId: "platform",
      targetTenantId: user?.tenantId || null,
      userId: req.user?.id || "unknown",
      userEmail: req.user?.email || "",
      action: "reset_sensitive",
      model: "User",
      recordId: id,
      changes: { data: { action: "password_reset", targetTenant: user?.tenantId } },
      ip: req.ip || req.connection?.remoteAddress,
      severity: "critical",
    }).catch(() => {});

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create owner
router.post("/owners", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { email, password, name, fname, lname, phone, tenantId, locale } = req.body;
    if (!email || !tenantId) {
      return res.status(400).json({ error: "email and tenantId required" });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: "Business not found" });

    const existingOwner = await prisma.user.findFirst({ where: { tenantId, role: "owner" } });
    if (existingOwner) return res.status(409).json({ error: "Business already has an owner" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const parsedName = splitName(name);
    const ownerFname = fname || parsedName.fname || email.split("@")[0];
    const ownerLname = lname || parsedName.lname || "";
    const tempPassword = password || generateTempPassword(12);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const hashed = await bcrypt.hash(tempPassword, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, fname: ownerFname, lname: ownerLname, phone, tenantId, role: "owner", otpCode: otp, otpExpires },
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { ownerId: user.id } });

    let emailSent = false;
    let emailError = null;
    try {
      const { subject, html } = getEmailContent(locale, {
        ownerFname,
        businessName: tenant.name,
        businessId: tenantId,
        tempPassword,
        otp,
        loginUrl: `${frontendOrigin()}/login`,
      });
      await sendMail(email, subject, html);
      emailSent = true;
    } catch (e) {
      emailError = e?.message || "Email failed";
      console.warn("Create owner: email send failed:", emailError);
    }

    res.status(201).json({
      message: emailSent ? "Owner created and email sent" : "Owner created, but email failed",
      userId: user.id,
      email,
      tenantId,
      emailSent,
      emailError,
      tempPassword,
      otp,
    });
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
    
    const oldTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId, status: "active" } });

    // Audit log: subscription upgrade - track which tenant was upgraded
    auditLog({
      tenantId: "platform",
      targetTenantId: tenantId,
      userId: req.user?.id || "unknown",
      userEmail: req.user?.email || "",
      action: "upgrade_sensitive",
      model: "Subscription",
      recordId: tenantId,
      changes: { data: { planId, status: "active" }, oldPlanId: oldTenant?.planId },
      ip: req.ip || req.connection?.remoteAddress,
      severity: "critical",
    }).catch(() => {});

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

    const subscriptions = tenants.map(subscriptionPayload);

    res.json({ subscriptions });
  } catch (err) {
    console.error("List subscriptions error:", err);
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});
router.put("/subscriptions/:id", authenticateToken, requirePlatformAdmin, updateSubscription);
router.patch("/subscriptions/:id", authenticateToken, requirePlatformAdmin, updateSubscription);

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

    let emailError = null;
    try {
      const { subject, html } = getEmailContent(locale, { ownerFname: fname, businessName: tenant.name, businessId: tenantId, tempPassword, otp, loginUrl: `${frontendOrigin()}/login` });
      await sendMail(email, subject, html);
      await prisma.tenant.update({ where: { id: tenantId }, data: { ownerId: user.id } });
      return res.status(201).json({ message: "Owner invited and email sent", email, tenantId, emailSent: true });
    } catch (e) {
      emailError = e?.message || "Email failed";
      console.warn("invite-owner: email send failed:", emailError);
    }

    await prisma.tenant.update({ where: { id: tenantId }, data: { ownerId: user.id } });
    res.status(201).json({ message: "Owner invited, but email failed", email, tenantId, emailSent: false, emailError, tempPassword, otp });
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

    let emailSent = false;
    let emailError = null;
    try {
      await sendMail(owner.email, "Password reset code (OTP)", `<p>Hello ${owner.fname || ""},</p><p>Your reset code: <b>${otp}</b></p><p>Expires in 24 hours.</p>`);
      emailSent = true;
    } catch (e) {
      emailError = e?.message || "Email failed";
      console.warn("reinvite-owner: email send failed:", emailError);
    }

    res.json({
      message: emailSent ? "Owner re-invited and email sent" : "Owner re-invited, but email failed",
      email: owner.email,
      emailSent,
      emailError,
      otp: emailSent ? undefined : otp,
    });
  } catch (err) {
    console.error("Reinvite owner error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Provision tenant (business + owner)
router.post(["/create-tenant", "/provision-tenant"], authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { business, owner } = req.body;
    if (!business?.name?.trim()) return res.status(400).json({ error: "Business name is required" });
    if (!business?.businessType) return res.status(400).json({ error: "Business type is required" });
    if (!business?.planId) return res.status(400).json({ error: "Subscription plan is required" });
    if (!owner?.email?.trim()) return res.status(400).json({ error: "Owner email is required" });
    if (!owner?.name?.trim()) return res.status(400).json({ error: "Owner name is required" });
    if (owner?.password && owner.password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existingUser = await prisma.user.findUnique({ where: { email: owner.email } });
    if (existingUser) return res.status(409).json({ error: "Owner email already exists" });

    const slug = (business.slug || business.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const parsedName = splitName(owner.name);
    const ownerFname = owner.fname || parsedName.fname || owner.email.split("@")[0];
    const ownerLname = owner.lname || parsedName.lname || "";

    const tempPassword = owner.password || generateTempPassword(12);
    const hashed = await bcrypt.hash(tempPassword, 12);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { tenant } = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: { name: business.name, slug, email: business.email || owner.email, phone: business.phone || owner.phone, address: business.address, businessType: business.businessType || null, status: "active", planId: business.planId },
      });

      const user = await tx.user.create({
        data: { email: owner.email, password: hashed, fname: ownerFname, lname: ownerLname, phone: owner.phone, tenantId: createdTenant.id, role: "owner", otpCode: otp, otpExpires },
      });

      await tx.tenant.update({ where: { id: createdTenant.id }, data: { ownerId: user.id } });

      return { tenant: createdTenant, user };
    });

    let emailSent = false;
    let emailError = null;
    try {
      const { subject, html } = getEmailContent(owner.locale, { ownerFname, businessName: business.name, businessId: tenant.id, tempPassword, otp, loginUrl: `${frontendOrigin()}/login` });
      await sendMail(owner.email, subject, html);
      emailSent = true;
    } catch (e) {
      emailError = e?.message || "Email failed";
      console.warn("Provision tenant: email send failed:", emailError);
    }

    // Audit log: tenant provisioning (critical SaaS admin operation)
    auditLog({
      tenantId: "platform",
      targetTenantId: tenant.id,
      userId: req.user?.id || "unknown",
      userEmail: req.user?.email || "",
      action: "create_sensitive",
      model: "Tenant",
      recordId: tenant.id,
      changes: {
        data: {
          businessName: business.name,
          businessType: business.businessType,
          ownerEmail: owner.email,
          planId: business.planId,
          slug: tenant.slug,
        }
      },
      ip: req.ip || req.connection?.remoteAddress,
      severity: "critical",
    }).catch(() => {});

    res.status(201).json({
      message: emailSent ? "Tenant provisioned and owner email sent" : "Tenant provisioned, but owner email failed",
      tenantId: tenant.id,
      slug: tenant.slug,
      ownerEmail: owner.email,
      emailSent,
      emailError,
      tempPassword,
      otp,
    });
  } catch (err) {
    if (err?.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : err.meta?.target;
      return res.status(409).json({ error: `Duplicate value for ${target || "unique field"}` });
    }
    console.error("Provision tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Me/features — plan features + tenant overrides
router.get("/me/features", authenticateToken, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role === "saas_admin") return res.json({ features: [] });

    const tenantId = req.user?.tenantId;
    const featureMap = {};

    if (tenantId) {
      // 1. Plan-level features (primary source)
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { planId: true },
      });

      if (tenant?.planId) {
        const planFeatures = await prisma.planFeature.findMany({
          where: { planId: tenant.planId, enabled: true },
          include: { feature: true },
        });
        planFeatures.forEach((pf) => {
          if (pf.feature?.name) {
            featureMap[pf.feature.name] = { enabled: true, source: "plan" };
          }
        });
      }

      // 2. Tenant-level overrides (can enable/disable plan features or add extras)
      const tenantFeatures = await prisma.tenantFeature.findMany({
        where: { tenantId },
        include: { feature: true },
      });
      tenantFeatures.forEach((tf) => {
        if (tf.feature?.name) {
          featureMap[tf.feature.name] = {
            enabled: tf.enabled,
            source: "override",
          };
        }
      });
    }

    res.json({ features: featureMap });
  } catch (err) {
    console.error("Me/features error:", err);
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
