import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from 'node:crypto';
import multer from "multer";
import cloudinary from "cloudinary";
import prisma from "../db.js";
import { authenticateToken, enforceTenantSubscriptionAccess, tenantAccountAccessPayload } from "../../middleware/auth.js";
import { sendMail } from "../../mailer.js";
import { resolveEffectivePermissions } from "../utils/permissions.js";
import { getTenantFeatures } from "../../middleware/featureCheck.js";
import { workingHoursAccessPayload, staffWorkingHoursAccess } from "../utils/workingHours.js";
import { auditLog } from "../utils/audit.js";
import { getJwtSecret } from "../utils/jwtSecret.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { createSessionTokens } from "../utils/sessionTokens.js";
import { authenticationOptions, hasBusinessSwitchSecuritySetup, registrationOptions, requiresBusinessSwitchSecurity, verifyBusinessSwitch, verifyRegistration } from '../services/userSecurity.js';

const router = Router();
const ipKey = (req) => req.headers?.['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress || 'unknown';
const identityKey = (req) => `${ipKey(req)}:${String(req.body?.email || '').trim().toLowerCase().slice(0, 254) || 'unknown'}`;
const loginIpLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 200, keyGenerator: ipKey, countStatusCodes: [401], policyName: 'login-ip' });
const loginIdentityLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 50, keyGenerator: identityKey, countStatusCodes: [401], policyName: 'login-identity' });
const refreshLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100, keyGenerator: ipKey });
const resetIpLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyGenerator: ipKey });
const resetIdentityLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15, keyGenerator: identityKey });
const securityActionLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12, keyGenerator: (req) => `security:${req.user?.id || ipKey(req)}`, countStatusCodes: [400, 401], policyName: 'account-security' });

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const supportedLanguages = new Set(["en", "sw", "lg", "nyn", "rw", "nyo", "ach"]);

function logAuthenticationEvent(req, action, user = null, statusCode = 200) {
  return auditLog({
    tenantId: user?.tenantId || "platform",
    targetTenantId: user?.tenantId || null,
    userId: user?.id || "unknown",
    userEmail: user?.email || String(req.body?.email || '').trim().toLowerCase().slice(0, 254),
    branchId: primaryBranchId(user),
    action,
    model: "Authentication",
    statusCode,
    severity: statusCode >= 400 ? "warning" : "info",
    ip: req.ip || req.connection?.remoteAddress,
  });
}

function primaryBranchId(user) {
  const branches = Array.isArray(user?.branches) ? user.branches : [];
  const primary = branches.find((item) => item.isPrimary) || branches[0];
  return primary?.branchId || null;
}

async function userPayload(user, userPerm, tenantFeatures = null) {
  const isPlatformUser = user.role === "saas_admin" || user.role === "platform_staff";
  const permissions = resolveEffectivePermissions(user, userPerm, [], tenantFeatures);
  const securitySetupRequired = await requiresBusinessSwitchSecurity(user) && !hasBusinessSwitchSecuritySetup(user);

  return {
    id: user.id,
    email: user.email,
    name: `${user.fname || ""} ${user.lname || ""}`.trim(),
    fname: user.fname,
    lname: user.lname,
    preferredLanguage: supportedLanguages.has(user.preferredLanguage) ? user.preferredLanguage : "en",
    theme: user.theme === "dark" || user.theme === "light" ? user.theme : null,
    avatar: user.avatar || null,
    role: user.role,
    tenantId: user.tenantId,
    tenantStatus: user.tenant?.status || null,
    branchId: primaryBranchId(user),
    cashAccountId: user.cashAccountId || null,
    cashAccount: user.cashAccount || null,
    isPlatformUser,
    securitySetupRequired,
    securityScopeVersion: 1,
    businessSwitchSecurityMethod: user.businessSwitchSecurityMethod || null,
    permissions,
    workingHoursAccess: staffWorkingHoursAccess(user, user.tenant),
  };
}

async function getTenantSessionContext(user, tenantId) {
  if (!tenantId) return { sessionUser: user, tenant: null, crossTenantOwner: false };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return null;
  let membership = null;
  if (tenantId !== user.tenantId) {
    membership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      select: { role: true, isActive: true },
    });
    if (!membership?.isActive || membership.role !== 'owner') return null;
  }
  const crossTenantOwner = tenantId !== user.tenantId;
  return {
    tenant,
    crossTenantOwner,
    sessionUser: {
      ...user,
      tenantId,
      tenant,
      role: crossTenantOwner ? 'owner' : user.role,
      branches: crossTenantOwner ? [] : (user.branches || []),
      cashAccountId: crossTenantOwner ? null : user.cashAccountId,
      cashAccount: crossTenantOwner ? null : user.cashAccount,
    },
  };
}

// Login
router.post("/login", loginIpLimiter, loginIdentityLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      await logAuthenticationEvent(req, "login_failed", null, 400);
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenant: true,
        cashAccount: { select: { id: true, name: true, type: true } },
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!user || !user.isActive) {
      await logAuthenticationEvent(req, "login_failed", user, 401);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await logAuthenticationEvent(req, "login_failed", user, 401);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const targetTenantId = user.tenantId;
    const context = await getTenantSessionContext(user, targetTenantId);
    if (!context) return res.status(403).json({ message: 'Business access has been removed.', code: 'TENANT_ACCESS_REVOKED' });
    const tenantBlock = await enforceTenantSubscriptionAccess(context.tenant, context.sessionUser);
    const subscriptionPaymentAccess = tenantBlock?.code === 'SUBSCRIPTION_PAYMENT_REQUIRED';
    if (tenantBlock && !subscriptionPaymentAccess) {
      await logAuthenticationEvent(req, "login_blocked_subscription", user, 403);
      return res.status(403).json(tenantBlock);
    }
    const hoursBlock = workingHoursAccessPayload(context.sessionUser, context.tenant);
    if (hoursBlock && !subscriptionPaymentAccess) {
      await logAuthenticationEvent(req, "login_blocked_schedule", user, 403);
      return res.status(403).json(hoursBlock);
    }

    // Force password reset if otpCode is present (first login after admin invite)
    if (user.otpCode && user.otpExpires && new Date(user.otpExpires) > new Date()) {
      await logAuthenticationEvent(req, "login_requires_reset", user, 200);
      return res.json({
        forceReset: true,
        email: user.email,
        message: "Please reset your password using the OTP sent to your email",
      });
    }

    const userPerm = context.crossTenantOwner ? null : await prisma.userPermission.findUnique({ where: { userId: user.id } });
    const tenantFeatures = targetTenantId ? await getTenantFeatures(targetTenantId) : new Set();

    const tokens = createSessionTokens(
      { id: user.id, email: user.email, role: context.sessionUser.role, tenantId: targetTenantId, activeTenantId: targetTenantId, branchId: context.crossTenantOwner ? null : primaryBranchId(user), isPlatformUser: user.role === "saas_admin" || user.role === "platform_staff" },
      getJwtSecret()
    );

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await logAuthenticationEvent(req, "login", user);

    res.json({
      user: await userPayload(context.sessionUser, userPerm, tenantFeatures),
      tokens,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get('/security/status', authenticateToken, async (req, res) => {
  try {
    const [user, passkeyCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { securitySetupCompletedAt: true, businessSwitchSecurityMethod: true } }),
      prisma.securityPasskey.count({ where: { userId: req.user.id } }),
    ])
    const setupRequired = Boolean(await requiresBusinessSwitchSecurity(req.user) && !hasBusinessSwitchSecuritySetup(user))
    res.json({
      setupRequired,
      method: user?.businessSwitchSecurityMethod || null,
      passkeyCount,
    })
  } catch (error) {
    console.error('Security status lookup failed:', error.code || error.message)
    res.status(503).json({ error: 'Account security status could not be verified.' })
  }
})

router.post('/security/password-method', authenticateToken, securityActionLimiter, async (req, res) => {
  try {
    const password = String(req.body?.password || '')
    if (!password) return res.status(400).json({ error: 'Enter your account password to enable password confirmation.' })
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, password: true } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      await logAuthenticationEvent(req, 'security_setup_failed', { id: req.user.id, email: req.user.email, tenantId: req.user.tenantId }, 401)
      return res.status(401).json({ error: 'Password confirmation failed.' })
    }
    await prisma.user.update({ where: { id: user.id }, data: { securitySetupCompletedAt: new Date(), businessSwitchSecurityMethod: 'password' } })
    await logAuthenticationEvent(req, 'security_setup_completed', { id: req.user.id, email: req.user.email, tenantId: req.user.tenantId })
    res.json({ setupRequired: false, method: 'password', passkeyCount: await prisma.securityPasskey.count({ where: { userId: user.id } }) })
  } catch (error) {
    console.error('Password security setup failed:', error.code || error.message)
    res.status(500).json({ error: 'Could not save your security choice.' })
  }
})

router.post('/security/passkey/register/options', authenticateToken, securityActionLimiter, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, fname: true, lname: true, password: true } })
    if (!user) return res.status(404).json({ error: 'User account not found.' })
    if (!req.body?.password || !(await bcrypt.compare(String(req.body.password), user.password))) return res.status(401).json({ error: 'Confirm your account password before enrolling a passkey.' })
    res.json(await registrationOptions(req, user))
  } catch (error) {
    console.error('Passkey registration options failed:', error.code || error.message)
    res.status(400).json({ error: error.message || 'Could not start passkey setup.' })
  }
})

router.post('/security/passkey/register/verify', authenticateToken, securityActionLimiter, async (req, res) => {
  try {
    const name = String(req.body?.name || 'This device')
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, fname: true, lname: true } })
    if (!user) return res.status(404).json({ error: 'User account not found.' })
    await verifyRegistration(req, user, req.body?.response, name)
    await logAuthenticationEvent(req, 'security_passkey_registered', { id: user.id, email: user.email, tenantId: req.user.tenantId })
    res.json({ setupRequired: false, method: 'passkey', passkeyCount: await prisma.securityPasskey.count({ where: { userId: user.id } }) })
  } catch (error) {
    console.error('Passkey registration verification failed:', error.code || error.message)
    res.status(400).json({ error: error.message || 'Passkey registration failed.' })
  }
})

router.post('/security/passkey/switch/options', authenticateToken, securityActionLimiter, async (req, res) => {
  try {
    if (req.user.businessSwitchSecurityMethod !== 'passkey') return res.status(409).json({ error: 'Passkey confirmation is not selected for this account.' })
    const targetTenantId = String(req.body?.tenantId || '').trim()
    if (!targetTenantId) return res.status(400).json({ error: 'Choose a business first.' })
    res.json(await authenticationOptions(req, { id: req.user.id }, targetTenantId))
  } catch (error) {
    console.error('Passkey switch challenge failed:', error.code || error.message)
    res.status(400).json({ error: error.message || 'Could not request passkey confirmation.' })
  }
})

router.get('/businesses', authenticateToken, async (req, res) => {
  try {
    let memberships = []
    try {
      memberships = await prisma.tenantMembership.findMany({ where: { userId: req.user.id, isActive: true, role: 'owner' }, include: { tenant: { select: { id: true, name: true, slug: true, businessType: true, status: true, logo: true } } } })
    } catch (membershipError) {
      // Keep the active business usable while startup repairs a legacy membership table.
      console.error('Business membership lookup failed; returning current business only:', membershipError.message)
    }
    const byId = new Map();
    for (const item of memberships.map((membership) => membership.tenant)) if (item) byId.set(item.id, item);
    if (req.user.tenantId && !byId.has(req.user.tenantId)) {
      const current = await prisma.tenant.findUnique({ where: { id: req.user.tenantId }, select: { id: true, name: true, slug: true, businessType: true, status: true, logo: true } });
      if (current) byId.set(current.id, current);
    }
    res.json({ businesses: [...byId.values()], activeTenantId: req.user.tenantId });
  } catch (error) {
    console.error('Accessible businesses lookup failed:', error.message);
    res.status(500).json({ error: 'Could not load your businesses.' });
  }
});

router.post('/switch-business', authenticateToken, securityActionLimiter, async (req, res) => {
  try {
    const targetTenantId = String(req.body?.tenantId || '').trim();
    if (!targetTenantId) return res.status(400).json({ error: 'Choose a business to switch to.' });
    const baseUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { tenant: true, cashAccount: { select: { id: true, name: true, type: true } }, branches: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
    });
    if (!baseUser?.isActive) return res.status(401).json({ error: 'User account is inactive.' });
    const context = await getTenantSessionContext(baseUser, targetTenantId);
    if (!context) return res.status(403).json({ error: 'You do not have access to that business.', code: 'TENANT_ACCESS_DENIED' });
    // Compare with the active session tenant, not the user's primary tenant: returning home is also a switch.
    const securityRequired = targetTenantId !== (req.user.activeTenantId || req.user.tenantId)
    try {
      if (securityRequired && !hasBusinessSwitchSecuritySetup(baseUser)) {
        return res.status(428).json({ error: 'Set up business-switch security before switching businesses.', code: 'SECURITY_SETUP_REQUIRED' })
      }
      if (securityRequired) {
        if (baseUser.businessSwitchSecurityMethod === 'passkey') {
          if (req.body?.securityAssertion) {
            await verifyBusinessSwitch(req, baseUser, targetTenantId, req.body.securityAssertion)
          } else if (req.body?.confirmationPassword && await bcrypt.compare(String(req.body.confirmationPassword), baseUser.password)) {
            await prisma.userSecurityChallenge.deleteMany({ where: { userId: baseUser.id, purpose: 'business-switch', targetTenantId } })
          } else {
            throw new Error('Passkey confirmation failed. Use your account password to recover this switch.')
          }
        } else if (baseUser.businessSwitchSecurityMethod === 'password') {
          if (!req.body?.confirmationPassword || !(await bcrypt.compare(String(req.body.confirmationPassword), baseUser.password))) {
            throw new Error('Password confirmation failed. The business was not switched.')
          }
        } else {
          return res.status(428).json({ error: 'Complete account security setup before switching businesses.', code: 'SECURITY_SETUP_REQUIRED' })
        }
      }
    } catch (verificationError) {
      await logAuthenticationEvent(req, 'business_switch_confirmation_failed', { ...baseUser, tenantId: targetTenantId }, 401)
      return res.status(401).json({ error: verificationError.message || 'Identity confirmation failed.' })
    }
    const tenantBlock = await enforceTenantSubscriptionAccess(context.tenant, context.sessionUser);
    const subscriptionPaymentAccess = tenantBlock?.code === 'SUBSCRIPTION_PAYMENT_REQUIRED';
    if (tenantBlock && !subscriptionPaymentAccess) return res.status(403).json(tenantBlock);
    const hoursBlock = workingHoursAccessPayload(context.sessionUser, context.tenant);
    if (hoursBlock && !subscriptionPaymentAccess) return res.status(403).json(hoursBlock);
    const userPerm = context.crossTenantOwner ? null : await prisma.userPermission.findUnique({ where: { userId: baseUser.id } });
    const tenantFeatures = await getTenantFeatures(targetTenantId);
    const tokens = createSessionTokens({
      id: baseUser.id, email: baseUser.email, role: context.sessionUser.role,
      tenantId: targetTenantId, activeTenantId: targetTenantId,
      branchId: context.crossTenantOwner ? null : primaryBranchId(baseUser),
      isPlatformUser: false,
    }, getJwtSecret());
    const responseUser = {
      ...(await userPayload(context.sessionUser, userPerm, tenantFeatures)),
      accessibleBusinesses: undefined,
    };
    await logAuthenticationEvent(req, 'business_switched', { ...baseUser, tenantId: targetTenantId });
    return res.json({ user: responseUser, tokens, activeTenantId: targetTenantId });
  } catch (error) {
    console.error('Business switch failed:', error.message);
    res.status(500).json({ error: 'Could not switch business. Please retry.' });
  }
});

// Register
router.post("/register", createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5, keyGenerator: ipKey }), (_req, res) => {
  res.status(410).json({ error: "Open registration is disabled. Create an account using a valid JibuSales invitation." });
});

// Refresh access token using refresh token
router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getJwtSecret());
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        tenant: true,
        cashAccount: { select: { id: true, name: true, type: true } },
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    const targetTenantId = decoded.activeTenantId || decoded.tenantId || user.tenantId;
    const context = await getTenantSessionContext(user, targetTenantId);
    if (!context) return res.status(403).json({ message: 'Business access has been removed.', code: 'TENANT_ACCESS_REVOKED' });
    const tenantBlock = await enforceTenantSubscriptionAccess(context.tenant, context.sessionUser);
    const subscriptionPaymentAccess = tenantBlock?.code === 'SUBSCRIPTION_PAYMENT_REQUIRED';
    if (tenantBlock && !subscriptionPaymentAccess) return res.status(403).json(tenantBlock);
    const hoursBlock = workingHoursAccessPayload(context.sessionUser, context.tenant);
    if (hoursBlock && !subscriptionPaymentAccess) return res.status(403).json(hoursBlock);

    const userPerm = context.crossTenantOwner ? null : await prisma.userPermission.findUnique({ where: { userId: user.id } });
    const tenantFeatures = targetTenantId ? await getTenantFeatures(targetTenantId) : new Set();

    const tokens = createSessionTokens(
      { id: user.id, email: user.email, role: context.sessionUser.role, tenantId: targetTenantId, activeTenantId: targetTenantId, branchId: context.crossTenantOwner ? null : primaryBranchId(user), isPlatformUser: user.role === "saas_admin" || user.role === "platform_staff" },
      getJwtSecret()
    );

    res.json({
      user: await userPayload(context.sessionUser, userPerm, tenantFeatures),
      tokens,
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        tenant: true,
        cashAccount: { select: { id: true, name: true, type: true } },
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const context = await getTenantSessionContext(user, req.user.tenantId || user.tenantId);
    if (!context) return res.status(403).json({ error: 'Business access has been removed.', code: 'TENANT_ACCESS_REVOKED' });
    const userPerm = context.crossTenantOwner ? null : await prisma.userPermission.findUnique({ where: { userId: user.id } });
    const tenantFeatures = context.sessionUser.tenantId ? await getTenantFeatures(context.sessionUser.tenantId) : new Set();
    const { password: _, ...safe } = user;
    const { password: __, ...safeContextUser } = context.sessionUser;
    res.json({ user: { ...safe, ...safeContextUser, ...(await userPayload(context.sessionUser, userPerm, tenantFeatures)) } });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Request password reset (OTP)
router.post("/request-reset", resetIpLimiter, resetIdentityLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
    if (!user) return res.json({ message: "If an account exists for that email, a reset code will be sent." });

    const otp = String(randomInt(100000, 1000000));
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.user.update({ where: { id: user.id }, data: { otpCode: otp, otpExpires } });

    try {
      await sendMail(
        user.email,
        "Password reset code",
        `<p>Hello ${user.fname || ""},</p><p>Your password reset code is <b>${otp}</b>.</p><p>This code expires in 15 minutes.</p>`
      );
    } catch (err) {
      console.warn("Password reset email failed:", err?.message || "Email failed");
    }

    res.json({ message: "If an account exists for that email, a reset code will be sent." });
  } catch (err) {
    console.error("Request reset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset password with OTP
router.post("/reset-password", resetIpLimiter, resetIdentityLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "email, otp, newPassword required" });
    if (String(newPassword).length < 12) return res.status(400).json({ error: "Password must be at least 12 characters" });

    const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
    if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });
    if (!user.otpCode || !user.otpExpires) return res.status(400).json({ error: "Invalid or expired reset code" });
    if (String(user.otpCode) !== String(otp) || new Date(user.otpExpires) < new Date()) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, otpCode: null, otpExpires: null } });
    res.json({ message: "Password updated" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update profile (name, phone, avatar)
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { fname, lname, phone, avatar, preferredLanguage, theme } = req.body;
    const data = {};
    const isBusinessOwner = req.user?.role === "owner";
    if (!isBusinessOwner && fname !== undefined) data.fname = fname;
    if (!isBusinessOwner && lname !== undefined) data.lname = lname;
    if (!isBusinessOwner && phone !== undefined) data.phone = phone || null;
    if (avatar !== undefined) data.avatar = avatar || null;
    if (preferredLanguage !== undefined) {
      if (!supportedLanguages.has(String(preferredLanguage))) {
        return res.status(400).json({ error: "Unsupported language" });
      }
      data.preferredLanguage = String(preferredLanguage);
    }
    if (theme !== undefined) {
      if (!['light', 'dark'].includes(String(theme))) return res.status(400).json({ error: "Unsupported theme" });
      data.theme = String(theme);
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      include: {
        tenant: true,
        branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    });

    const context = await getTenantSessionContext(user, req.user.tenantId || user.tenantId);
    const userPerm = context?.crossTenantOwner ? null : await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
    const tenantFeatures = context?.sessionUser.tenantId ? await getTenantFeatures(context.sessionUser.tenantId) : new Set();
    res.json({ message: "Profile updated", user: await userPayload(context?.sessionUser || user, userPerm, tenantFeatures) });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Change password (requires current password)
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new password required" });
    if (String(newPassword).length < 12) return res.status(400).json({ error: "New password must be at least 12 characters" });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(String(newPassword), 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Upload avatar
router.post("/avatar", authenticateToken, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: `jibusales/avatars/${req.user.id}`, public_id: `avatar-${Date.now()}`, overwrite: true },
      async (error, cloudResult) => {
        if (error) {
          console.error("Avatar upload error:", error);
          return res.status(500).json({ error: "Failed to upload avatar" });
        }
        const avatarUrl = cloudResult.secure_url;
        await prisma.user.update({ where: { id: req.user.id }, data: { avatar: avatarUrl } });

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          include: { tenant: true, branches: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
        });
        const context = await getTenantSessionContext(user, req.user.tenantId || user.tenantId);
        const userPerm = context?.crossTenantOwner ? null : await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
        const tenantFeatures = context?.sessionUser.tenantId ? await getTenantFeatures(context.sessionUser.tenantId) : new Set();
        res.json({ message: "Avatar uploaded", avatar: avatarUrl, user: await userPayload(context?.sessionUser || user, userPerm, tenantFeatures) });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    console.error("Upload avatar error:", err);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.json({ message: "Logged out" });
});

export default router;
