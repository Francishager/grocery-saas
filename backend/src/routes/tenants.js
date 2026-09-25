import { Router } from "express";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../db.js";
import { authenticateToken, requirePlatformAdmin, tenantAccountAccessPayload } from "../../middleware/auth.js";
import { tenantIdFromUser } from "../utils/branchAccess.js";
import { resolveSubscriptionCharge, calculateBillingReminder } from "../utils/subscriptionPricing.js";
import { buildBillingPaymentRequest, getBillingGatewaySummary, processTenantBillingPayment, normalizeRelworxStatus, verifyRelworxWebhookSignature } from "../services/paymentGateway.js";
import { invalidateFeatureCache } from "../../middleware/featureCheck.js";
import { getPesapalCallbackUrl, getPesapalTransactionStatus, normalizePesapalStatus, submitPesapalOrder } from "../services/pesapal.js";
import { normalizeSubscriptionPaymentAmount, syncPesapalSubscriptionPayment } from "../utils/subscriptionPayments.js";

const router = Router();
const VALID_TENANT_STATUSES = new Set(["active", "suspended", "cancelled", "trial"]);

async function startPesapalSubscriptionPayment({ tenant, amount, currency, paymentMethod, phone, email, payerName, firstName, lastName, returnPath, recordedBy }) {
  const merchantReference = `JS-${tenant.id.slice(0, 18)}-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const normalizedAmount = normalizeSubscriptionPaymentAmount(amount);
  const attempt = await prisma.subscriptionPayment.create({
    data: {
      tenantId: tenant.id,
      amount: new Prisma.Decimal(normalizedAmount),
      currency,
      paymentMethod,
      provider: "pesapal",
      merchantReference,
      checkoutReturnPath: returnPath,
      payerName: payerName || null,
      payerPhone: phone || null,
      payerEmail: email || null,
      recordedById: recordedBy?.id || null,
      recordedByEmail: recordedBy?.email || null,
      status: "pending",
      notes: "Pesapal checkout initiated",
    },
  });

  try {
    const order = await submitPesapalOrder({
      merchantReference,
      amount: normalizedAmount,
      currency,
      description: `JibuSales subscription for ${tenant.name}`,
      callbackUrl: getPesapalCallbackUrl(),
      phone,
      email,
      firstName,
      lastName,
    });
    const payment = await prisma.subscriptionPayment.update({
      where: { id: attempt.id },
      data: { gatewayTrackingId: order.trackingId, checkoutUrl: order.checkoutUrl },
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        billingPaymentMethod: paymentMethod,
        billingPaymentReference: merchantReference,
        paymentReminderStatus: "due_soon",
        paymentReminderSentAt: new Date(),
      },
    });
    return payment;
  } catch (error) {
    await prisma.subscriptionPayment.update({ where: { id: attempt.id }, data: { status: "failed", notes: String(error?.message || "Pesapal order setup failed").slice(0, 2000) } });
    throw error;
  }
}

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
    if (status) {
      const normalizedStatus = String(status).trim().toLowerCase();
      if (!VALID_TENANT_STATUSES.has(normalizedStatus)) {
        return res.status(400).json({ error: "Invalid tenant status" });
      }
      where.status = normalizedStatus;
    }
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

    const reference = String(req.query.reference || tenant.billingPaymentReference || "");
    let payment = reference ? await prisma.subscriptionPayment.findFirst({ where: { tenantId, merchantReference: reference } }) : null;
    if (req.query.reference && !payment) return res.status(404).json({ error: "Subscription payment attempt not found" });
    if (payment?.provider === "pesapal" && payment.gatewayTrackingId && !["completed", "failed", "reversed"].includes(payment.status)) {
      try {
        const gatewayStatus = await getPesapalTransactionStatus(payment.gatewayTrackingId);
        payment = await syncPesapalSubscriptionPayment(prisma, payment, gatewayStatus);
      } catch (error) {
        console.warn("Pesapal billing status refresh failed:", error.message);
      }
    }
    const status = payment?.status?.toUpperCase() || (tenant.paymentReminderStatus === "paid" ? "COMPLETED" : tenant.billingPaymentReference ? "PENDING" : "NOT_STARTED");

    res.json({
      status,
      payment: {
        status,
        reference: payment?.merchantReference || tenant.billingPaymentReference,
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

    const { networkProvider, phoneNumber, paymentMethod = "mobile_money", gateway = "pesapal", email } = req.body || {};

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

    if (String(gateway).toLowerCase() === "pesapal") {
      const method = String(paymentMethod).toLowerCase();
      if (!["mobile_money", "card"].includes(method)) return res.status(400).json({ error: "Pesapal supports mobile money and card checkout here" });
      const payerPhone = String(phoneNumber || req.user?.phone || "").trim();
      const payerEmail = String(email || req.user?.email || "").trim();
      if (!payerPhone && !payerEmail) return res.status(400).json({ error: "Enter a phone number or email for Pesapal checkout" });
      const names = String(tenant.name || "Business").trim().split(/\s+/);
      const payment = await startPesapalSubscriptionPayment({
        tenant,
        amount: amountDue,
        currency: charge.currency,
        paymentMethod: method,
        phone: payerPhone,
        email: payerEmail,
        payerName: [req.user?.fname, req.user?.lname].filter(Boolean).join(" ") || tenant.name,
        firstName: names[0],
        lastName: names.slice(1).join(" ") || "Business",
        returnPath: "/tenant/dashboard",
        recordedBy: req.user,
      });
      return res.status(201).json({
        message: "Pesapal checkout is ready",
        status: "PENDING",
        amountDue,
        payment: { id: payment.id, reference: payment.merchantReference, status: payment.status, checkoutUrl: payment.checkoutUrl },
        gateway: { provider: "pesapal", mode: String(process.env.PESAPAL_ENV || "sandbox").toLowerCase() },
      });
    }

    if (String(gateway).toLowerCase() !== "relworx") return res.status(400).json({ error: "Choose Pesapal or Relworx" });
    if (!networkProvider || !phoneNumber) return res.status(400).json({ error: "Network provider and phone number are required for Relworx" });
    if (!getBillingGatewaySummary().configured) {
      return res.status(503).json({ error: "Relworx is not configured, so no payment was taken. Select Pesapal or contact the administrator." });
    }

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

async function processPesapalNotification(req, res, isIpn) {
  const payload = { ...(req.body || {}), ...(req.query || {}) };
  const trackingId = String(payload.OrderTrackingId || payload.orderTrackingId || "");
  const merchantReference = String(payload.OrderMerchantReference || payload.merchantReference || "");
  const payment = trackingId && merchantReference
    ? await prisma.subscriptionPayment.findFirst({ where: { provider: "pesapal", gatewayTrackingId: trackingId, merchantReference } })
    : null;
  if (!trackingId || !merchantReference) return res.status(400).json({ error: "Pesapal tracking ID and merchant reference are required" });
  if (!payment) {
    if (isIpn) return res.status(200).json({ orderNotificationType: payload.OrderNotificationType || "IPNCHANGE", orderTrackingId: trackingId, orderMerchantReference: merchantReference, status: 200 });
    const origin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(302, `${origin.replace(/\/$/, "")}/tenant/dashboard?billingError=payment_not_found`);
  }
  if (payment) {
    const gatewayStatus = await getPesapalTransactionStatus(trackingId);
    await syncPesapalSubscriptionPayment(prisma, payment, gatewayStatus);
  }
  if (isIpn) {
    return res.status(200).json({ orderNotificationType: payload.OrderNotificationType || "IPNCHANGE", orderTrackingId: trackingId, orderMerchantReference: merchantReference, status: 200 });
  }
  const origin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || "http://localhost:5173";
  const returnPath = payment?.checkoutReturnPath === "/saas/subscriptions" ? "/saas/subscriptions" : "/tenant/dashboard";
  return res.redirect(302, `${origin.replace(/\/$/, "")}${returnPath}?billingRef=${encodeURIComponent(merchantReference)}`);
}

router.get("/billing-reminder/pesapal/callback", async (req, res) => {
  try {
    return await processPesapalNotification(req, res, false);
  } catch (err) {
    console.error("Pesapal callback verification failed:", err);
    const origin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || "http://localhost:5173";
    const paymentReference = String(req.query.OrderMerchantReference || req.query.merchantReference || "");
    const payment = paymentReference ? await prisma.subscriptionPayment.findUnique({ where: { merchantReference: paymentReference }, select: { checkoutReturnPath: true } }).catch(() => null) : null;
    const path = payment?.checkoutReturnPath === "/saas/subscriptions" ? "/saas/subscriptions" : "/tenant/dashboard";
    return res.redirect(302, `${origin.replace(/\/$/, "")}${path}?billingError=verification&billingRef=${encodeURIComponent(paymentReference)}`);
  }
});

router.get("/billing-reminder/pesapal/ipn", async (req, res) => {
  try {
    return await processPesapalNotification(req, res, true);
  } catch (err) {
    console.error("Pesapal IPN verification failed:", err);
    return res.status(500).json({ status: 500, message: "IPN verification failed" });
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
    const existing = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Tenant not found" });
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
    const existing = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Tenant not found" });
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status: "suspended" } });
    const blockPayload = tenantAccountAccessPayload(tenant, { role: "owner" });
    res.json({ message: blockPayload?.message || "Tenant suspended", code: blockPayload?.code, tenant });
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
    invalidateFeatureCache(req.params.id);
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
    const data = { ...req.body };
    if (data.status !== undefined) {
      const status = String(data.status).trim().toLowerCase();
      if (!VALID_TENANT_STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid tenant status" });
      }
      data.status = status;
    }
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data });
    const blockPayload = tenantAccountAccessPayload(tenant, { role: "owner" });
    res.json({ message: blockPayload?.message || "Tenant updated", code: blockPayload?.code, tenant });
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
      prisma.product.count({ where: { tenantId, isActive: { not: false } } }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.supplier.count({ where: { tenantId } }),
    ]);

    const limits = {
      maxUsers: tenant.usageLimit?.maxUsers || tenant.plan?.maxUsers || 5,
      maxProducts: tenant.usageLimit?.maxProducts ?? tenant.plan?.maxProducts ?? 100,
      maxBranches: tenant.usageLimit?.maxBranches || 3,
      maxCustomers: tenant.usageLimit?.maxCustomers || 100,
      maxSuppliers: tenant.usageLimit?.maxSuppliers || 50,
    };

    const usage = {
      users: { count: userCount, limit: limits.maxUsers, percentage: Math.round((userCount / limits.maxUsers) * 100) },
      products: { count: productCount, limit: limits.maxProducts, percentage: limits.maxProducts > 0 ? Math.round((productCount / limits.maxProducts) * 100) : 0 },
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
