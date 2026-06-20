import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Platform admin roles
const PLATFORM_ROLES = ['saas_admin', 'platform_admin', 'super_admin'];

/**
 * Authenticate JWT token middleware
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(403).json({ message: 'Invalid token' });
    }
    
    req.user = decoded;
    next();
  });
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
    
    if (!permissions.includes(permission) && !permissions.includes('*')) {
      return res.status(403).json({ 
        message: 'Permission denied',
        required: permission,
      });
    }
    
    next();
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

export default {
  authenticateToken,
  requireRole,
  requirePlatformAdmin,
  requireTenant,
  blockPlatformAdmin,
  optionalAuth,
  requirePermission,
  enforceTenantIsolation,
};
