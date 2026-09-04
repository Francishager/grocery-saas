import jwt from 'jsonwebtoken';
import prisma from '../src/db.js';
import { resolveEffectivePermissions, ROLE_DEFAULTS } from '../src/utils/permissions.js';
import { getTenantFeatures, hasFeatureAccess } from './featureCheck.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Platform admin roles
const PLATFORM_ROLES = ['saas_admin', 'platform_admin', 'super_admin'];
const BLOCKED_TENANT_STATUSES = new Set(['suspended', 'cancelled']);
const TENANT_STATUS_MESSAGES = {
  suspended: 'This business account is suspended due to subscription. Contact JibuSales support or your SaaS administrator to reactivate it.',
  cancelled: 'This business account has been cancelled. Contact JibuSales support for help.',
};
const PAYMENT_METHOD_PERMISSION_MAP = {
  cash: 'canUseCash',
  safe: 'canUseCash',
  mobile_money: 'canUseMobileMoney',
  bank_transfer: 'canUseBank',
  bank: 'canUseBank',
  card: 'canUseCard',
};

export const isPlatformAdminUser = (user = {}) => (
  PLATFORM_ROLES.includes(user.role) ||
  user.isPlatformUser === true ||
  user.is_platform_user === true
);

export const tenantAccountAccessPayload = (tenant, user = {}) => {
  if (!tenant || isPlatformAdminUser(user)) return null;
  const status = String(tenant.status || '').trim().toLowerCase();
  if (!BLOCKED_TENANT_STATUSES.has(status)) return null;

  return {
    message: TENANT_STATUS_MESSAGES[status] || 'This business account is not active. Contact JibuSales support.',
    error: TENANT_STATUS_MESSAGES[status] || 'Business account is not active',
    code: status === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_CANCELLED',
    tenantStatus: status,
  };
};

export const canUseCashTransactions = (user, hasAssignedCashAccount) => {
  if (!user) return false;

  if (isPlatformAdminUser(user)) {
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
    const tenantId = decoded.tenantId || decoded.tenant_id || decoded.business_id;
    let tenant = null;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (!tenant && !isPlatformAdminUser(decoded)) {
        return res.status(403).json({
          message: 'Business account not found. Contact JibuSales support.',
          error: 'Business account not found',
          code: 'TENANT_NOT_FOUND',
        });
      }
      const tenantBlock = tenantAccountAccessPayload(tenant, decoded);
      if (tenantBlock) return res.status(403).json(tenantBlock);
    }

    let userPerm = await prisma.userPermission.findUnique({ where: { userId: decoded.id } });
    const tenantFeatures = tenantId ? await getTenantFeatures(tenantId) : new Set();

    if (!userPerm) {
      const defaultPermissions = ROLE_DEFAULTS[decoded.role] || ROLE_DEFAULTS.attendant || {};
      userPerm = await prisma.userPermission.create({
        data: {
          userId: decoded.id,
          ...defaultPermissions,
        },
      }).catch((createErr) => {
        console.error('Failed to create missing userPermission row:', createErr);
        return null;
      });
    }

    const permissions = resolveEffectivePermissions(decoded, userPerm, [], tenantFeatures);

    req.user = { ...decoded, permissions, tenantFeatures, tenantStatus: tenant?.status || decoded.tenantStatus || null };
    req.userPermissions = userPerm;
    req.tenantFeatures = tenantFeatures;
  } catch (fetchErr) {
    console.error('Permission lookup error:', fetchErr);
    const tenantId = decoded.tenantId || decoded.tenant_id || decoded.business_id;
    if (tenantId && !isPlatformAdminUser(decoded)) {
      return res.status(503).json({
        message: 'Unable to verify business account status. Please try again.',
        error: 'Unable to verify business account status',
        code: 'TENANT_STATUS_UNAVAILABLE',
      });
    }
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
  if (isPlatformAdminUser(req.user)) {
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
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const fallbackPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const hasDirectAccess = fallbackPermissions.includes(permission) || fallbackPermissions.includes('*');
    if (hasDirectAccess) {
      return next();
    }

    try {
      const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
      const tenantFeatures = tenantId ? await getTenantFeatures(tenantId) : new Set();
      const userPerm = await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
      const effectivePermissions = resolveEffectivePermissions(req.user, userPerm, [], tenantFeatures);

      req.user.permissions = effectivePermissions;
      req.userPermissions = userPerm;

      if (effectivePermissions.includes(permission) || effectivePermissions.includes('*')) {
        return next();
      }
    } catch (err) {
      console.error('requirePermission fallback error:', err);
    }

    return res.status(403).json({ 
      message: 'Permission denied',
      required: permission,
    });
  };
};

export const requireAnyPermission = (permissions = []) => {
  const requiredPermissions = Array.isArray(permissions) ? permissions.filter(Boolean) : [permissions].filter(Boolean);

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (requiredPermissions.length === 0) {
      return next();
    }

    const fallbackPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const hasDirectAccess = fallbackPermissions.includes('*') ||
      requiredPermissions.some((permission) => fallbackPermissions.includes(permission));
    if (hasDirectAccess) {
      return next();
    }

    try {
      const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
      const tenantFeatures = tenantId ? await getTenantFeatures(tenantId) : new Set();
      const userPerm = await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
      const effectivePermissions = resolveEffectivePermissions(req.user, userPerm, [], tenantFeatures);

      req.user.permissions = effectivePermissions;
      req.userPermissions = userPerm;

      if (effectivePermissions.includes('*') || requiredPermissions.some((permission) => effectivePermissions.includes(permission))) {
        return next();
      }
    } catch (err) {
      console.error('requireAnyPermission fallback error:', err);
    }

    return res.status(403).json({
      message: 'Permission denied',
      required: requiredPermissions,
    });
  };
};

export const hasAccountingPermission = (req) => {
  if (!req?.user) return false;
  const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

  if (permissions.includes('*')) return true;

  return [
    'canViewAccounting',
    'canCreateAccounting',
    'canEditAccounting',
    'canDeleteAccounting',
    'canViewTransactionAccount',
    'canUseAnyTransactionAccount',
    'canUseOtherCashAccount',
    'canCreateTransactionAccount',
    'canEditTransactionAccount',
    'canDeleteTransactionAccount',
  ].some((permission) => permissions.includes(permission));
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
  req.userPermissions = Array.isArray(user.permissions) ? user.permissions[0] : user.permissions;
  next();
};

/**
 * Resolve payment-method permissions from either the JWT effective
 * permission list or Prisma's UserPermission relation.
 */
export const getPaymentMethodPermissions = (req, permissionRecordOrList = null) => {
  if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
    return { canUseCash: true, canUseMobileMoney: true, canUseBank: true, canUseCard: true };
  }

  const hasPermission = (key) => hasResolvedPermission(req, key, permissionRecordOrList);

  return {
    canUseCash: hasPermission('canUseCash'),
    canUseMobileMoney: hasPermission('canUseMobileMoney'),
    canUseBank: hasPermission('canUseBank'),
    canUseCard: hasPermission('canUseCard'),
  };
};

const hasResolvedPermission = (req, key, permissionRecordOrList = null) => {
  if (PLATFORM_ROLES.includes(req.user?.role) || req.user?.isPlatformUser) return true;

  const effectivePermissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  const rawPermissionRecord = permissionRecordOrList || req.userPermissions;
  const permissionRecord = Array.isArray(rawPermissionRecord) ? rawPermissionRecord[0] : rawPermissionRecord;

  return (
    effectivePermissions.includes('*') ||
    effectivePermissions.includes(key) ||
    Boolean(permissionRecord?.[key])
  );
};

export const resolveReqPermissions = async (req) => {
  if (!req?.user) return [];
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const tenantFeatures = tenantId ? await getTenantFeatures(tenantId) : new Set();
  const userPerm = await prisma.userPermission.findUnique({ where: { userId: req.user.id } });
  const effectivePermissions = resolveEffectivePermissions(req.user, userPerm, [], tenantFeatures);
  req.user.permissions = effectivePermissions;
  req.userPermissions = userPerm;
  return effectivePermissions;
};

/**
 * Check if the user has permission to use a specific payment method.
 * Must be called after requireCashAccount or loadUserPermissions.
 */
export const checkPaymentMethodPermission = (req, paymentMethod) => {
  const permKey = PAYMENT_METHOD_PERMISSION_MAP[String(paymentMethod || '').trim().toLowerCase()];
  if (!permKey) return false;

  return Boolean(getPaymentMethodPermissions(req)[permKey]);
};

export const canUsePaymentMethodOrAssignedCash = (req, paymentMethod, cashAccountId = null) => {
  const normalizedMethod = String(paymentMethod || '').trim().toLowerCase();
  const assignedCashAccountId = req.userCashAccountId || req.user?.cashAccountId;
  const hasPaymentMethod = checkPaymentMethodPermission(req, normalizedMethod);

  if (!['cash', 'safe'].includes(normalizedMethod)) {
    return hasPaymentMethod;
  }

  if (!hasPaymentMethod) return false;

  const selectedCashAccountId = cashAccountId || assignedCashAccountId;
  const isOwnCashAccount = selectedCashAccountId && assignedCashAccountId &&
    String(selectedCashAccountId) === String(assignedCashAccountId);

  return Boolean(
    isOwnCashAccount ||
    hasResolvedPermission(req, 'canUseOtherCashAccount') ||
    hasResolvedPermission(req, 'canUseAnyTransactionAccount')
  );
};

/**
 * Load user permissions without requiring a cash account.
 * Used when cash account is optional (e.g., expenses with fallback account resolution).
 * Loads userPermissions for payment method gating in routes.
 */
export const loadUserPermissions = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Platform admins bypass
  if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        cashAccountId: true,
        permissions: true,
      },
    });

    if (user) {
      req.userCashAccountId = user.cashAccountId;
      req.userPermissions = Array.isArray(user.permissions) ? user.permissions[0] : user.permissions;
    }
  } catch (err) {
    console.error('loadUserPermissions error:', err);
  }

  next();
};

export default {
  authenticateToken,
  requireRole,
  requirePlatformAdmin,
  requireTenant,
  blockPlatformAdmin,
  optionalAuth,
  requirePermission,
  requireAnyPermission,
  requireFeature,
  enforceTenantIsolation,
  requireCashAccount,
  loadUserPermissions,
  checkPaymentMethodPermission,
  canUsePaymentMethodOrAssignedCash,
  getPaymentMethodPermissions,
  canUseCashTransactions,
  isPlatformAdminUser,
  tenantAccountAccessPayload,
};
