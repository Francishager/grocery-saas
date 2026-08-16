import { Router } from "express";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin } from "../../middleware/auth.js";
import { tenantIdFromUser } from "../utils/branchAccess.js";
import { resolveSubscriptionCharge, calculateBillingReminder } from "../utils/subscriptionPricing.js";
import { buildBillingPaymentRequest, processTenantBillingPayment, normalizeRelworxStatus, verifyRelworxWebhookSignature } from "../services/paymentGateway.js";

const router = Router();

function withOwnerSummary(tenant) {
  const owner = tenant.users?.find((user) => user.role === "owner") || tenant.owner || null;
  const { owner: _owner, ...rest } = tenant;
  return {
    ...rest,
    planName: tenant.plan?.name || null,
    ownerName: owner ? `${owner.fname || ""} ${owner.lname || ""}`.trim() || owner.email : null,
    ownerEmail: owner?.email || null,
    subscriptionStart: tenant.subscriptionStart || null,
    subscriptionEnd: tenant.subscriptionEnd || null,
    trialEndsAt: tenant.trialEndsAt || null,
  };
}

function userSearch(search) {
  return [
    { fname: { contains: search, mode: "insensitive" } },
    { lname: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
  ];
}

// List tenants
router.get("/", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      const term = String(search);
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { slug: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { owner: { is: { OR: userSearch(term) } } },
        { users: { some: { role: "owner", OR: userSearch(term) } } },
      ];
    }

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        plan: true,
        owner: { select: { id: true, email: true, fname: true, lname: true, role: true } },
        users: { where: { role: "owner" }, select: { id: true, email: true, fname: true, lname: true, role: true }, take: 1 },
        _count: { select: { users: true, customers: true, suppliers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    const total = await prisma.tenant.count({ where });
    res.json({ tenants: tenants.map(withOwnerSummary), total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("List tenants error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single tenant
router.get("/me/billing-reminder", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const reminder = calculateBillingReminder({
      subscriptionEnd: tenant.subscriptionEnd,
      trialEndsAt: tenant.trialEndsAt,
      gracePeriodDays: tenant.gracePeriodDays,
      reminderDaysBeforeDue: tenant.reminderDaysBeforeDue,
    });

    const amountDue = resolveSubscriptionCharge(tenant.plan || {}, tenant).price;

    res.json({
      tenantId: tenant.id,
      name: tenant.name,
      currency: resolveSubscriptionCharge(tenant.plan || {}, tenant).currency,
      amountDue,
      subscriptionEnd: tenant.subscriptionEnd,
      trialEndsAt: tenant.trialEndsAt,
      gracePeriodDays: tenant.gracePeriodDays ?? 0,
      reminderDaysBeforeDue: tenant.reminderDaysBeforeDue ?? 10,
      billingReference: tenant.billingPaymentReference,
      paymentStatus: tenant.paymentReminderStatus,
      ...reminder,
    });
  } catch (err) {
    console.error("Billing reminder check error:", err);
    res.status(500).json({ error: "Failed to load billing reminder" });
  }
});

router.get("/me/billing-reminder/status", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        billingPaymentReference: true,
        paymentReminderStatus: true,
      },
    });

    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const status = tenant.paymentReminderStatus === "paid" ? "COMPLETED" : tenant.billingPaymentReference ? "PENDING" : "NOT_STARTED";

    res.json({
      status,
      payment: {
        status,
        reference: tenant.billingPaymentReference,
      },
    });
  } catch (err) {
    console.error("Billing reminder status check error:", err);
    res.status(500).json({ error: "Failed to check billing payment status" });
  }
});

router.post("/me/billing-reminder", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const { networkProvider, phoneNumber, paymentMethod } = req.body || {};
    if (!networkProvider || !phoneNumber) {
      return res.status(400).json({ error: "Network provider and phone number are required" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const charge = resolveSubscriptionCharge(tenant.plan || {}, tenant);
    const amountDue = Number(charge.price || 0);
    const provider = String(networkProvider).toUpperCase();

    const paymentRequest = buildBillingPaymentRequest({
      amount: amountDue,
      msisdn: phoneNumber,
      networkProvider: provider,
      tenantId: tenant.id,
    });

    const paymentResult = await processTenantBillingPayment({
      amount: paymentRequest.amount,
      msisdn: paymentRequest.msisdn,
      networkProvider: paymentRequest.networkProvider,
      tenantId: tenant.id,
      tenantName: tenant.name,
    });

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        billingPaymentMethod: paymentMethod || "mobile_money",
        billingPaymentReference: paymentResult.reference || `${provider}:${phoneNumber}`,
        paymentReminderStatus: paymentResult.status === "COMPLETED" ? "paid" : "due_soon",
        paymentReminderSentAt: new Date(),
      },
    });

    res.json({
      message: paymentResult.message || "Mobile money payment prompt confirmed",
      provider: paymentResult.networkProvider || provider,
      phoneNumber: paymentResult.msisdn || phoneNumber,
      status: updatedTenant.paymentReminderStatus,
      amountDue,
      payment: paymentResult,
      gateway: {
        configured: paymentResult.configured,
        mode: paymentResult.mode,
        provider: paymentResult.provider,
      },
    });
  } catch (err) {
    console.error("Billing reminder save error:", err);
    const message = err instanceof Error ? err.message : "Failed to save payment prompt";
    res.status(500).json({ error: message });
  }
});

router.post("/billing-reminder/relworx/webhook", async (req, res) => {
  try {
    const payload = req.body || {};
    const signatureHeader = req.headers["x-relworx-signature"] || req.headers["relworx-signature"];
    const webhookUrl = process.env.RELWORX_WEBHOOK_URL || `${process.env.BASE_URL || 'http://localhost:3000'}/api/tenants/billing-reminder/relworx/webhook`;

    if (process.env.RELWORX_WEBHOOK_KEY && signatureHeader && !verifyRelworxWebhookSignature(signatureHeader, payload, webhookUrl)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const reference = payload.customer_reference || payload.reference || payload.internal_reference || payload.external_reference;
    const requestStatus = normalizeRelworxStatus(payload.request_status || payload.status || payload.payment_status);

    if (!reference) {
      return res.status(400).json({ error: "Missing payment reference in webhook payload" });
    }

    const tenant = await prisma.tenant.findFirst({
      where: {
        billingPaymentReference: {
          contains: String(reference),
        },
      },
    });

    if (!tenant) {
      return res.status(200).json({ received: true, matched: false, reference });
    }

    const normalizedStatus = requestStatus === "COMPLETED" ? "paid" : "due_soon";

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        paymentReminderStatus: normalizedStatus,
        paymentReminderSentAt: new Date(),
      },
    });

    return res.status(200).json({
      received: true,
      matched: true,
      tenantId: tenant.id,
      status: normalizedStatus,
      reference,
    });
  } catch (err) {
    console.error("Relworx billing webhook error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.get("/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        plan: true,
        owner: { select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true } },
        users: { select: { id: true, email: true, fname: true, lname: true, role: true, isActive: true } },
        _count: { select: { customers: true, suppliers: true, users: true } },
      },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json(withOwnerSummary(tenant));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Activate tenant
router.post("/:id/activate", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status: "active" } });
    res.json({ message: "Tenant activated", tenant });
  } catch (err) {
    console.error("Activate tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Suspend tenant
router.post("/:id/suspend", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status: "suspended" } });
    res.json({ message: "Tenant suspended", tenant });
  } catch (err) {
    console.error("Suspend tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tenant plan (with subscription period)
router.put("/:id/plan", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const { planId, subscriptionStart, subscriptionEnd, trialEndsAt } = req.body;
    if (!planId) return res.status(400).json({ error: "planId required" });

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Build subscription data
    const data = { planId };

    // Set subscription start date — default to now if not provided
    const startDate = subscriptionStart ? new Date(subscriptionStart) : new Date();
    data.subscriptionStart = startDate;

    // Set subscription end date — explicit date wins, otherwise auto-calculate from billing cycle
    if (subscriptionEnd !== undefined && subscriptionEnd !== null && subscriptionEnd !== '') {
      data.subscriptionEnd = new Date(subscriptionEnd);
    } else {
      const endDate = new Date(startDate);
      if (plan.billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      data.subscriptionEnd = endDate;
    }

    // Set trial end date if provided
    if (trialEndsAt) {
      data.trialEndsAt = new Date(trialEndsAt);
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
      include: { plan: true },
    });
    res.json({ message: "Plan updated", tenant });
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Tenant not found" });
    console.error("Update tenant plan error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update tenant
router.put("/:id", authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Tenant updated", tenant });
  } catch (err) {
    console.error("Update tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get tenant usage limits
router.get("/:id/limits", authenticateToken, async (req, res) => {
  try {
    const tenantId = tenantIdFromUser(req.user);
    if (!tenantId) return res.status(403).json({ error: "Tenant access required" });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true, usageLimit: true },
    });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    // Get actual counts
    const [branchCount, userCount, productCount, customerCount, supplierCount] = await Promise.all([
      prisma.branch.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.product.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.supplier.count({ where: { tenantId } }),
    ]);

    const limits = {
      maxUsers: tenant.usageLimit?.maxUsers || tenant.plan?.maxUsers || 5,
      maxProducts: tenant.usageLimit?.maxProducts || tenant.plan?.maxProducts || 1000,
      maxBranches: tenant.usageLimit?.maxBranches || 3,
      maxCustomers: tenant.usageLimit?.maxCustomers || 100,
      maxSuppliers: tenant.usageLimit?.maxSuppliers || 50,
    };

    const usage = {
      users: { count: userCount, limit: limits.maxUsers, percentage: Math.round((userCount / limits.maxUsers) * 100) },
      products: { count: productCount, limit: limits.maxProducts, percentage: Math.round((productCount / limits.maxProducts) * 100) },
      branches: { count: branchCount, limit: limits.maxBranches, percentage: Math.round((branchCount / limits.maxBranches) * 100) },
      customers: { count: customerCount, limit: limits.maxCustomers, percentage: Math.round((customerCount / limits.maxCustomers) * 100) },
      suppliers: { count: supplierCount, limit: limits.maxSuppliers, percentage: Math.round((supplierCount / limits.maxSuppliers) * 100) },
    };

    res.json({ limits, usage });
  } catch (err) {
    console.error("Get tenant limits error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
