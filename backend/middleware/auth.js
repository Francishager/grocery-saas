import jwt from 'jsonwebtoken';
import prisma from '../src/db.js';
import { resolveEffectivePermissions } from '../src/utils/permissions.js';
import { getTenantFeatures, hasFeatureAccess } from './featureCheck.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Platform admin roles
const PLATFORM_ROLES = ['saas_admin', 'platform_admin', 'super_admin'];

export const canUseCashTransactions = (user, hasAssignedCashAccount) => {
  if (!user) return false;

  if (PLATFORM_ROLES.includes(user.role) || user.isPlatformUser || user.is_platform_user) {
    return true;
  }

  return Boolean(hasAssignedCashAccount);
};

/**
 * Authenticate JWT token middleware
 */
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(403).json({ message: 'Invalid token' });
  }

  try {
    // Resolve permissions from the single source of truth.
    // - saas_admin: wildcard "*" (bypasses all checks)
    // - owner: feature-aware access based on the tenant subscription and overrides
    // - other roles: explicit grants from the UserPermission table plus any inherited permissions.
    const userPerm = await prisma.userPermission.findUnique({ where: { userId: decoded.id } });
    const tenantId = decoded.tenantId || decoded.tenant_id || decoded.business_id;
    const tenantFeatures = tenantId ? await getTenantFeatures(tenantId) : new Set();
    const permissions = resolveEffectivePermissions(decoded, userPerm, [], tenantFeatures);

    req.user = { ...decoded, permissions, tenantFeatures };
    req.tenantFeatures = tenantFeatures;
  } catch (fetchErr) {
    console.error('Permission lookup error:', fetchErr);
    // Fall back to decoded token permissions if available
    req.user = decoded;
  }

  next();
};

/**
 * Require specific role(s)
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Insufficient role permissions',
        required: allowedRoles,
        current: req.user.role,
      });
    }
    
    next();
  };
};

/**
 * Require platform admin role (SaaS Admin only)
 */
export const requirePlatformAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  // Check if user is platform admin
  const isPlatformAdmin = 
    PLATFORM_ROLES.includes(req.user.role) || 
    req.user.isPlatformUser === true ||
    req.user.is_platform_user === true;
  
  if (!isPlatformAdmin) {
    return res.status(403).json({ 
      message: 'Platform administrator access required',
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
  }
  
  next();
};

/**
 * Require tenant access (non-platform users must have tenant)
 */
export const requireTenant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  // Platform admins don't need tenant
  if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
    return next();
  }
  
  // Business users must have tenant
  if (!req.user.tenantId && !req.user.business_id && !req.user.tenant_id) {
    return res.status(403).json({ 
      message: 'Tenant access required',
      code: 'TENANT_REQUIRED',
    });
  }

  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  req.tenant = { id: tenantId };
  req.tenantId = tenantId;
  
  next();
};

/**
 * Block platform admins from accessing business data
 */
export const blockPlatformAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  const isPlatformAdmin = 
    PLATFORM_ROLES.includes(req.user.role) || 
    req.user.isPlatformUser === true ||
    req.user.is_platform_user === true;
  
  if (isPlatformAdmin) {
    return res.status(403).json({ 
      message: 'Platform administrators cannot access business data',
      code: 'PLATFORM_ADMIN_BLOCKED',
    });
  }
  
  next();
};

/**
 * Optional authentication - attach user if token present
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return next();
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err) {
      req.user = decoded;
    }
    next();
  });
};

/**
 * Check specific permission
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const permissions = req.user.permissions || [];
    if (permissions.includes(permission) || permissions.includes('*')) {
      return next();
    }

    return res.status(403).json({ 
      message: 'Permission denied',
      required: permission,
    });
  };
};

/**
 * Tenant isolation - ensure user can only access their own tenant's data
 */
export const enforceTenantIsolation = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  // Platform admins bypass tenant isolation
  if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
    return next();
  }
  
  // Attach tenant filter to request for use in controllers
  req.tenantFilter = {
    tenant_id: req.user.tenantId || req.user.tenant_id || req.user.business_id,
    business_id: req.user.business_id || req.user.tenantId || req.user.tenant_id,
  };
  
  next();
};

/**
 * Require a feature to be enabled for the tenant.
 * Usage: router.get("/", authenticateToken, requireFeature("inventory"), handler)
 * Platform admins bypass. When offline or no tenant, access is allowed (graceful degradation).
 */
export const requireFeature = (featureName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    if (!tenantId) {
      return res.status(403).json({
        message: 'Tenant access required',
        code: 'TENANT_REQUIRED',
      });
    }

    try {
      const features = await getTenantFeatures(tenantId);
      if (!hasFeatureAccess(features, featureName)) {
        return res.status(403).json({
          message: 'This feature is not available on your current subscription plan.',
          feature: featureName,
          code: 'FEATURE_NOT_ENABLED',
        });
      }

      req.tenantFeatures = features;
      next();
    } catch (err) {
      console.error('requireFeature error:', err);
      return res.status(500).json({ message: 'Failed to verify feature access' });
    }
  };
};

/**
 * Require the authenticated user to have a cash account assigned.
 * Enforces cash-handling accountability — no user can record sales,
 * receive payments, or make payments without being assigned to a
 * cash account.
 *
 * Business owner accounts are explicitly blocked from performing
 * cash transactions and must instead use a staff account when
 * handling money. Platform admins still bypass this check.
 * Also loads the user's permissions for payment method gating.
 */
export const requireCashAccount = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Platform admins bypass
  if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
    return next();
  }

  // Check if user has a cash account assigned
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      cashAccountId: true,
      isActive: true,
      cashAccount: { select: { id: true, name: true, type: true, balance: true, accountNumber: true, bankName: true } },
      permissions: true,
    },
  });

  if (!user) {
    return res.status(403).json({
      error: 'User account not found. Please contact your administrator.',
      code: 'NO_CASH_ACCOUNT',
    });
  }

  if (!canUseCashTransactions(req.user, Boolean(user.cashAccountId))) {
    return res.status(403).json({
      error: req.user.role === 'owner'
        ? 'No cash account assigned. Assign a cash account to this owner account before recording sales or payments.'
        : 'No cash account assigned. You cannot handle cash, record sales, or make payments until an administrator assigns you a cash account.',
      code: 'NO_CASH_ACCOUNT',
    });
  }

  // Attach the cash account and permissions for downstream use
  req.userCashAccountId = user.cashAccountId;
  req.userCashAccount = user.cashAccount;
  req.userPermissions = user.permissions;
  next();
};

/**
 * Check if the user has permission to use a specific payment method.
 * Must be called after requireCashAccount.
 */
export const checkPaymentMethodPermission = (req, paymentMethod) => {
  // Platform admins can use all payment methods
  if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
    return true;
  }

  const perms = req.userPermissions;
  if (!perms) return false;

  const permMap = {
    cash: 'canUseCash',
    mobile_money: 'canUseMobileMoney',
    bank_transfer: 'canUseBank',
    bank: 'canUseBank',
    card: 'canUseCard',
  };

  const permKey = permMap[paymentMethod];
  if (!permKey) return false;

  return Boolean(perms[permKey]);
};

export default {
  authenticateToken,
  requireRole,
  requirePlatformAdmin,
  requireTenant,
  blockPlatformAdmin,
  optionalAuth,
  requirePermission,
  requireFeature,
  enforceTenantIsolation,
  requireCashAccount,
  checkPaymentMethodPermission,
  canUseCashTransactions,
};
