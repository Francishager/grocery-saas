import express from 'express';
import hrPermissionService from '../services/hrPermissionService.js';
import hrFeatureService from '../services/hrFeatureService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

// ============================================
// PERMISSION MANAGEMENT ROUTES
// ============================================

/**
 * POST /hr-settings/permissions - Grant permission
 */
router.post('/permissions', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_PERMISSION_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const permission = await hrPermissionService.grantPermission(tenantId, {
      ...req.body,
      grantedBy: userId,
    });

    res.status(201).json({ success: true, data: permission });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/permissions/user/:userId - Get user permissions
 */
router.get('/permissions/user/:userId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { userId } = req.params;

    const permissions = await hrPermissionService.getPermissionsByUser(tenantId, userId);
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/permissions/role/:roleId - Get role permissions
 */
router.get('/permissions/role/:roleId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { roleId } = req.params;

    const permissions = await hrPermissionService.getPermissionsByRole(tenantId, roleId);
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/permissions/:id - Get permission
 */
router.get('/permissions/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const permission = await hrPermissionService.getPermissionById(tenantId, req.params.id);
    res.json({ success: true, data: permission });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /hr-settings/permissions/:id/revoke - Revoke permission
 */
router.post('/permissions/:id/revoke', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_PERMISSION_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const permission = await hrPermissionService.revokePermission(tenantId, req.params.id, userId);
    res.json({ success: true, data: permission });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /hr-settings/permissions/user/:userId/update - Update user permissions
 */
router.post('/permissions/user/:userId/update', async (req, res) => {
  try {
    const { tenantId, id: currentUserId } = req.user;
    const { userId } = req.params;
    const { permissionCodes } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, currentUserId, 'HR_PERMISSION_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const permissions = await hrPermissionService.updateUserPermissions(tenantId, userId, permissionCodes, currentUserId);
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/permissions/all - Get all permissions
 */
router.get('/permissions/all', async (req, res) => {
  try {
    const { tenantId } = req.user;

    const permissions = await hrPermissionService.getAllPermissions(tenantId);
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// FEATURE MANAGEMENT ROUTES
// ============================================

/**
 * POST /hr-settings/features - Enable feature
 */
router.post('/features', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_FEATURE_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const feature = await hrFeatureService.enableFeature(tenantId, req.body, userId);
    res.status(201).json({ success: true, data: feature });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/features - List features
 */
router.get('/features', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { skip, take, isEnabled } = req.query;

    const features = await hrFeatureService.getFeatures(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      isEnabled: isEnabled === 'true' ? true : isEnabled === 'false' ? false : null,
    });

    res.json({ success: true, data: features });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/features/:featureCode - Get feature
 */
router.get('/features/:featureCode', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const feature = await hrFeatureService.getFeatureByCode(tenantId, req.params.featureCode);
    res.json({ success: true, data: feature });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /hr-settings/features/:featureCode/enable - Enable feature
 */
router.post('/features/:featureCode/enable', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { featureCode } = req.params;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_FEATURE_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const feature = await hrFeatureService.updateFeature(tenantId, featureCode, { isEnabled: true }, userId);
    res.json({ success: true, data: feature });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /hr-settings/features/:featureCode/disable - Disable feature
 */
router.post('/features/:featureCode/disable', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { featureCode } = req.params;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_FEATURE_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const feature = await hrFeatureService.disableFeature(tenantId, featureCode, userId);
    res.json({ success: true, data: feature });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /hr-settings/features/:featureCode/config - Update feature config
 */
router.put('/features/:featureCode/config', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { featureCode } = req.params;
    const { config } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_FEATURE_MANAGE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const feature = await hrFeatureService.updateFeatureConfig(tenantId, featureCode, config, userId);
    res.json({ success: true, data: feature });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /hr-settings/features/enabled - Get enabled features
 */
router.get('/features/enabled', async (req, res) => {
  try {
    const { tenantId } = req.user;

    const features = await hrFeatureService.getEnabledFeatures(tenantId);
    res.json({ success: true, data: features });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
