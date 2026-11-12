import prisma from '../src/db.js';

const PLATFORM_ROLES = ['saas_admin', 'platform_admin', 'super_admin'];

// Cache tenant features in-memory for 60 seconds to avoid DB hit on every request
const featureCache = new Map(); // tenantId -> { features: Set, expiresAt: number }
const CACHE_TTL = 60_000;
const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)*$/i;

function featureAliases(featureName) {
  const aliases = new Set([
    String(featureName),
    String(featureName).replace(/_/g, '-'),
    String(featureName).replace(/-/g, '_'),
  ]);

  const equivalentFeatures = {
    'fuel_station.tanks': ['fuel_station.pumps'],
    'fuel_station.pumps': ['fuel_station.tanks'],
    'service.car_wash': ['fuel_station.car_wash'],
    'fuel_station.car_wash': ['service.car_wash'],
    'service.garage': ['fuel_station.garage'],
    'fuel_station.garage': ['service.garage'],
  };

  for (const equivalent of equivalentFeatures[String(featureName)] || []) {
    aliases.add(equivalent);
    aliases.add(equivalent.replace(/_/g, '-'));
    aliases.add(equivalent.replace(/-/g, '_'));
  }

  return aliases;
}

export function hasFeatureAccess(features, featureName) {
  if (!featureName) return false;
  return [...featureAliases(featureName)].some((name) => features.has(name));
}

export function explicitPlanFeatureNames(plan) {
  const featureList = Array.isArray(plan?.features) ? plan.features : [];
  const explicit = featureList
    .map((featureName) => String(featureName || "").trim())
    .filter((featureName) => FEATURE_KEY_PATTERN.test(featureName));

  return explicit.length > 0 ? new Set(explicit) : null;
}

export function planFeatureIsAllowedByPlanList(plan, featureName) {
  const explicit = explicitPlanFeatureNames(plan);
  if (!explicit) return true;
  return explicit.has(featureName);
}

export function filterPlanFeaturesByPlanList(plan, planFeatures = []) {
  return planFeatures.filter((planFeature) => {
    const featureName = planFeature?.feature?.name;
    return featureName && planFeatureIsAllowedByPlanList(plan, featureName);
  });
}

/**
 * Resolve the effective feature set for a tenant.
 * Plan features (PlanFeature) are the primary source.
 * Tenant overrides (TenantFeature) can enable/disable on top of plan features.
 * Returns a Set of enabled feature name strings.
 */
export async function getTenantFeatures(tenantId) {
  const now = Date.now();
  const cached = featureCache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.features;

  const effective = new Set();

  // 1. Plan-level features (primary source)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      planId: true,
      plan: {
        select: {
          features: true,
        },
      },
    },
  });

  if (tenant?.planId) {
    const planFeatures = await prisma.planFeature.findMany({
      where: { planId: tenant.planId, enabled: true, feature: { isActive: true } },
      include: { feature: true },
    });
    planFeatures.forEach((pf) => {
      if (pf.feature?.name && planFeatureIsAllowedByPlanList(tenant.plan, pf.feature.name)) {
        effective.add(pf.feature.name);
      }
    });
  }

  // 2. Tenant-level overrides (can enable/disable plan features or add extras)
  const tenantFeatures = await prisma.tenantFeature.findMany({
    where: { tenantId, feature: { isActive: true } },
    include: { feature: true },
  });
  tenantFeatures.forEach((tf) => {
    if (tf.feature?.name) {
      if (tf.enabled) {
        effective.add(tf.feature.name);
      } else {
        featureAliases(tf.feature.name).forEach((name) => effective.delete(name));
      }
    }
  });

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

    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    if (!tenantId) {
      return res.status(403).json({
        message: 'Tenant access required',
        code: 'TENANT_REQUIRED',
      });
    }

    try {
      const features = await getTenantFeatures(tenantId);

      const hasFeature = hasFeatureAccess(features, featureName);

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

      const missing = featureNames.find((fn) => !hasFeatureAccess(features, fn));

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

/**
 * Middleware factory: requireAnyFeature(['name.one', 'name.two'])
 * Passes if any of the provided feature names is enabled for the tenant.
 */
export function requireAnyFeature(featureNames) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
    if (!tenantId) return res.status(403).json({ message: 'Tenant access required', code: 'TENANT_REQUIRED' });

    try {
      const features = await getTenantFeatures(tenantId);
      const found = featureNames.find((fn) => hasFeatureAccess(features, fn));
      if (!found) {
        return res.status(403).json({ message: 'This feature is not available on your current subscription plan.', code: 'FEATURE_NOT_ENABLED', feature: featureNames[0] });
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
