import express from 'express';
import unitService from '../services/unitService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /units - Create unit
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { departmentId, name, code, description, headId } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const unit = await unitService.createUnit(tenantId, {
      departmentId,
      name,
      code,
      description,
      headId,
    });

    res.status(201).json({ success: true, data: unit });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /units - List units
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.user.tenantId || req.user.tenant_id || req.user.business_id;
    const { skip, take, search, departmentId, isActive } = req.query;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const units = await unitService.getUnits(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 100,
      search,
      departmentId,
      isActive: isActive === 'all' ? null : isActive === 'false' ? false : true,
    });

    res.json({ success: true, data: units });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /units/:departmentId - Get units in department
 */
router.get('/:departmentId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { departmentId } = req.params;
    const { skip, take, search } = req.query;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const units = await unitService.getUnitsByDepartment(tenantId, departmentId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      search,
    });

    res.json({ success: true, data: units });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /units/:id/detail - Get unit details
 */
router.get('/:id/detail', async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const unit = await unitService.getUnitById(tenantId, req.params.id);
    res.json({ success: true, data: unit });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /units/:id - Update unit
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const unit = await unitService.updateUnit(tenantId, req.params.id, req.body);
    res.json({ success: true, data: unit });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /units/:id - Delete unit
 */
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const unit = await unitService.deleteUnit(tenantId, req.params.id);
    res.json({ success: true, data: unit });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /units/:id/stats - Get unit statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_UNIT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const stats = await unitService.getUnitStats(tenantId, req.params.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
