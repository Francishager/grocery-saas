import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requireTenant, requirePlatformAdmin } from "../../middleware/auth.js";

const router = Router();

// Default reward config
const DEFAULT_REWARD = {
  type: "subscription_discount",
  value: 10, // 10% discount
};

const EXPIRY_DAYS = 90;

// Generate a unique referral code
function generateCode(name) {
  const prefix = (name || "REF").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "REF";
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

// =====================================================
// TENANT ROUTES
// =====================================================

// Get or create referral code for the authenticated tenant
router.get("/my-code", authenticateToken, requireTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

    let code = await prisma.referralCode.findUnique({
      where: { tenantId },
      include: {
        referrals: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            referredTenant: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
    });

    if (!code) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });

      let codeStr = generateCode(tenant.name);
      // Ensure uniqueness
      while (await prisma.referralCode.findUnique({ where: { code: codeStr } })) {
        codeStr = generateCode(tenant.name);
      }

      code = await prisma.referralCode.create({
        data: { code: codeStr, tenantId },
        include: { referrals: true },
      });
    }

    // Stats
    const stats = {
      totalReferrals: code.referrals.length,
      pending: code.referrals.filter((r) => r.status === "pending" || r.status === "invited").length,
      signedUp: code.referrals.filter((r) => r.status === "signed_up").length,
      subscribed: code.referrals.filter((r) => r.status === "subscribed" || r.status === "completed").length,
      completed: code.referrals.filter((r) => r.status === "completed").length,
      rewardsClaimed: code.referrals.filter((r) => r.rewardStatus === "claimed").length,
      rewardsPending: code.referrals.filter((r) => r.rewardStatus === "unclaimed" && r.status === "completed").length,
    };

    res.json({ code: code.code, referrals: code.referrals, stats });
  } catch (err) {
    console.error("Get referral code error:", err);
    res.status(500).json({ error: "Failed to get referral code" });
  }
});

// Regenerate referral code
router.post("/regenerate-code", authenticateToken, requireTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    let codeStr = generateCode(tenant.name);
    while (await prisma.referralCode.findUnique({ where: { code: codeStr } })) {
      codeStr = generateCode(tenant.name);
    }

    await prisma.referralCode.upsert({
      where: { tenantId },
      update: { code: codeStr },
      create: { code: codeStr, tenantId },
    });

    res.json({ code: codeStr });
  } catch (err) {
    console.error("Regenerate referral code error:", err);
    res.status(500).json({ error: "Failed to regenerate code" });
  }
});

// Refer someone by email
router.post("/refer", authenticateToken, requireTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    const { email, rewardType, rewardValue } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.trim().toLowerCase();

    // Get or create referral code
    let code = await prisma.referralCode.findUnique({ where: { tenantId } });
    if (!code) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      let codeStr = generateCode(tenant.name);
      while (await prisma.referralCode.findUnique({ where: { code: codeStr } })) {
        codeStr = generateCode(tenant.name);
      }
      code = await prisma.referralCode.create({ data: { code: codeStr, tenantId } });
    }

    // Check if already referred
    const existing = await prisma.referral.findFirst({
      where: { referralCodeId: code.id, referredEmail: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: "This email has already been referred" });
    }

    // Check if email is the referrer's own
    const referrerTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (referrerTenant.email.toLowerCase() === normalizedEmail) {
      return res.status(400).json({ error: "You cannot refer yourself" });
    }

    // Check if email is already a tenant owner
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser && existingUser.role === "owner") {
      return res.status(400).json({ error: "This email is already a business owner" });
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + EXPIRY_DAYS);

    const referral = await prisma.referral.create({
      data: {
        referralCodeId: code.id,
        referrerTenantId: tenantId,
        referredEmail: normalizedEmail,
        status: "invited",
        rewardType: rewardType || DEFAULT_REWARD.type,
        rewardValue: rewardValue || DEFAULT_REWARD.value,
      },
    });

    res.status(201).json({
      message: "Referral created successfully",
      referral: {
        id: referral.id,
        referredEmail: referral.referredEmail,
        status: referral.status,
        rewardType: referral.rewardType,
        rewardValue: referral.rewardValue,
        createdAt: referral.createdAt,
      },
    });
  } catch (err) {
    console.error("Create referral error:", err);
    res.status(500).json({ error: "Failed to create referral" });
  }
});

// Claim a reward
router.post("/claim-reward/:referralId", authenticateToken, requireTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    const { referralId } = req.params;

    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      include: { referralCode: true },
    });

    if (!referral) return res.status(404).json({ error: "Referral not found" });
    if (referral.referralCode.tenantId !== tenantId) {
      return res.status(403).json({ error: "Not authorized to claim this reward" });
    }
    if (referral.rewardStatus === "claimed") {
      return res.status(400).json({ error: "Reward already claimed" });
    }
    if (referral.status !== "completed") {
      return res.status(400).json({ error: "Referral not yet completed" });
    }

    const [updatedReferral, reward] = await prisma.$transaction([
      prisma.referral.update({
        where: { id: referralId },
        data: { rewardStatus: "claimed" },
      }),
      prisma.referralReward.create({
        data: {
          referralId,
          tenantId,
          type: referral.rewardType,
          value: referral.rewardValue,
          description: `Referral reward for ${referral.referredEmail}`,
        },
      }),
    ]);

    res.json({
      message: "Reward claimed successfully",
      reward: {
        id: reward.id,
        type: reward.type,
        value: reward.value,
        description: reward.description,
        claimedAt: reward.claimedAt,
      },
    });
  } catch (err) {
    console.error("Claim reward error:", err);
    res.status(500).json({ error: "Failed to claim reward" });
  }
});

// Get referral rewards history
router.get("/rewards", authenticateToken, requireTenant, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    const rewards = await prisma.referralReward.findMany({
      where: { tenantId },
      include: {
        referral: {
          select: { referredEmail: true, status: true },
        },
      },
      orderBy: { claimedAt: "desc" },
    });
    res.json({ rewards });
  } catch (err) {
    console.error("Get rewards error:", err);
    res.status(500).json({ error: "Failed to get rewards" });
  }
});

// =====================================================
// PUBLIC ROUTE — Track referral signup
// =====================================================

// When a new tenant signs up with a referral code, link them
router.post("/track-signup", async (req, res) => {
  try {
    const { code, email, tenantId } = req.body;
    if (!code || !email || !tenantId) {
      return res.status(400).json({ error: "code, email, and tenantId are required" });
    }

    const referralCode = await prisma.referralCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!referralCode) return res.status(404).json({ error: "Invalid referral code" });

    const referral = await prisma.referral.findFirst({
      where: { referralCodeId: referralCode.id, referredEmail: email.trim().toLowerCase() },
    });

    if (referral) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: { status: "signed_up", referredTenantId: tenantId, appliedAt: new Date() },
      });
    } else {
      // Create a new referral record if someone signed up with a code but wasn't explicitly invited
      await prisma.referral.create({
        data: {
          referralCodeId: referralCode.id,
          referrerTenantId: referralCode.tenantId,
          referredTenantId: tenantId,
          referredEmail: email.trim().toLowerCase(),
          status: "signed_up",
          appliedAt: new Date(),
        },
      });
    }

    res.json({ message: "Referral tracked successfully" });
  } catch (err) {
    console.error("Track referral signup error:", err);
    res.status(500).json({ error: "Failed to track referral" });
  }
});

// Mark referral as completed (called when referred tenant subscribes)
router.post("/complete/:referralId", authenticateToken, async (req, res) => {
  try {
    const { referralId } = req.params;
    const referral = await prisma.referral.findUnique({ where: { id: referralId } });
    if (!referral) return res.status(404).json({ error: "Referral not found" });

    const updated = await prisma.referral.update({
      where: { id: referralId },
      data: { status: "completed", completedAt: new Date() },
    });

    res.json({ message: "Referral completed", referral: updated });
  } catch (err) {
    console.error("Complete referral error:", err);
    res.status(500).json({ error: "Failed to complete referral" });
  }
});

// =====================================================
// SaaS ADMIN ROUTES
// =====================================================

// Platform-wide referral stats
router.get("/admin/stats", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const [
      totalCodes,
      totalReferrals,
      pendingReferrals,
      signedUpReferrals,
      completedReferrals,
      claimedRewards,
      totalRewards,
    ] = await Promise.all([
      prisma.referralCode.count(),
      prisma.referral.count(),
      prisma.referral.count({ where: { status: { in: ["pending", "invited"] } } }),
      prisma.referral.count({ where: { status: "signed_up" } }),
      prisma.referral.count({ where: { status: "completed" } }),
      prisma.referralReward.count(),
      prisma.referral.count({ where: { rewardStatus: "claimed" } }),
    ]);

    // Top referrers
    const topReferrers = await prisma.referralCode.findMany({
      include: {
        tenant: { select: { id: true, name: true, slug: true, email: true } },
        referrals: {
          select: { id: true, status: true, rewardStatus: true },
        },
      },
      orderBy: { referrals: { _count: "desc" } },
      take: 10,
    });

    const topReferrerStats = topReferrers.map((rc) => ({
      tenant: rc.tenant,
      code: rc.code,
      totalReferrals: rc.referrals.length,
      completed: rc.referrals.filter((r) => r.status === "completed").length,
      rewardsClaimed: rc.referrals.filter((r) => r.rewardStatus === "claimed").length,
    }));

    // Recent referrals
    const recentReferrals = await prisma.referral.findMany({
      include: {
        referrerTenant: { select: { id: true, name: true } },
        referredTenant: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      stats: {
        totalCodes,
        totalReferrals,
        pendingReferrals,
        signedUpReferrals,
        completedReferrals,
        conversionRate: totalReferrals > 0 ? ((completedReferrals / totalReferrals) * 100).toFixed(1) : 0,
        claimedRewards,
        totalRewards,
      },
      topReferrers: topReferrerStats,
      recentReferrals,
    });
  } catch (err) {
    console.error("Admin referral stats error:", err);
    res.status(500).json({ error: "Failed to get referral stats" });
  }
});

// Get all referrals (admin)
router.get("/admin/all", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [referrals, total] = await Promise.all([
      prisma.referral.findMany({
        include: {
          referrerTenant: { select: { id: true, name: true, slug: true } },
          referredTenant: { select: { id: true, name: true, status: true } },
          referralCode: { select: { code: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.referral.count(),
    ]);

    res.json({
      referrals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Admin get all referrals error:", err);
    res.status(500).json({ error: "Failed to get referrals" });
  }
});

export default router;
