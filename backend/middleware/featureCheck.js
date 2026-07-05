import prisma from '../src/db.js';

const PLATFORM_ROLES = ['saas_admin', 'platform_admin', 'super_admin'];

// Cache tenant features in-memory for 60 seconds to avoid DB hit on every request
const featureCache = new Map(); // tenantId -> { features: Set, expiresAt: number }
const CACHE_TTL = 60_000;

/**
 * Resolve the effective feature set for a tenant.
 * ONLY TenantFeature rows are used — features are NOT auto-inherited from plan.
 * SaaS admin must explicitly assign features to each tenant via TenantFeature.
 * Returns a Set of enabled feature name strings.
 */
async function getTenantFeatures(tenantId) {
  const now = Date.now();
  const cached = featureCache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.features;

  // Only TenantFeature rows — no plan-level auto-inheritance
  const tenantFeatures = await prisma.tenantFeature.findMany({
    where: { tenantId, enabled: true },
    include: { feature: true },
  });

  const effective = new Set(
    tenantFeatures.map((tf) => tf.feature?.name).filter(Boolean)
  );

  featureCache.set(tenantId, { features: effective, expiresAt: now + CACHE_TTL });
  return effective;
}

/**
 * Invalidate the feature cache for a tenant (call after feature/plan changes).
 */
export function invalidateFeatureCache(tenantId) {
  if (tenantId) {
    featureCache.delete(tenantId);
  } else {
    featureCache.clear();
  }
}

/**
 * Middleware factory: requireFeature('inventory.products')
 * Returns 403 if the tenant's plan does not include the feature.
 * Platform admins bypass the check.
 *
 * Usage:
 *   router.post('/', authenticateToken, requireFeature('inventory.products'), handler)
 */
export function requireFeature(featureName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Platform admins bypass feature checks
    if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
      return next();
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

      // Check exact feature only — no parent module auto-enabling
      const hasFeature = features.has(featureName);

      if (!hasFeature) {
        return res.status(403).json({
          message: 'This feature is not available on your current subscription plan.',
          code: 'FEATURE_NOT_ENABLED',
          feature: featureName,
        });
      }

      // Attach features set to req for downstream use
      req.tenantFeatures = features;
      next();
    } catch (err) {
      console.error('Feature check error:', err);
      return res.status(500).json({ message: 'Failed to verify feature access' });
    }
  };
}

/**
 * Middleware that checks multiple features (ALL must be enabled).
 */
export function requireAllFeatures(...featureNames) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (PLATFORM_ROLES.includes(req.user.role) || req.user.isPlatformUser) {
      return next();
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

      const missing = featureNames.find((fn) => !features.has(fn));

      if (missing) {
        return res.status(403).json({
          message: 'This feature is not available on your current subscription plan.',
          code: 'FEATURE_NOT_ENABLED',
          feature: missing,
        });
      }

      req.tenantFeatures = features;
      next();
    } catch (err) {
      console.error('Feature check error:', err);
      return res.status(500).json({ message: 'Failed to verify feature access' });
    }
  };
}

export default { requireFeature, requireAllFeatures, invalidateFeatureCache };
