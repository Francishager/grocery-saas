import express from 'express';
import positionService from '../services/positionService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

// Middleware
router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /positions - Create position
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, code, description, level, department, minSalary, maxSalary } = req.body;

    // Check permission
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_POSITION_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const position = await positionService.createPosition(tenantId, {
      name,
      code,
      description,
      level,
      department,
      minSalary,
      maxSalary,
    });

    res.status(201).json({
      success: true,
      data: position,
      message: 'Position created successfully',
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /positions - List positions
 */
router.get('/', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { skip, take, search, isActive } = req.query;

    // Check permission
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_POSITION_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const positions = await positionService.getPositions(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      search: search || null,
      isActive: isActive === 'false' ? false : true,
    });

    const count = await positionService.getPositionCount(tenantId);

    res.json({
      success: true,
      data: positions,
      pagination: { skip: parseInt(skip) || 0, take: parseInt(take) || 50, total: count },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /positions/:id - Get position by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    // Check permission
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_POSITION_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const position = await positionService.getPositionById(tenantId, id);

    res.json({
      success: true,
      data: position,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /positions/:id - Update position
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, code, description, level, department, minSalary, maxSalary, isActive } = req.body;

    // Check permission
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_POSITION_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const position = await positionService.updatePosition(tenantId, id, {
      name,
      code,
      description,
      level,
      department,
      minSalary,
      maxSalary,
      isActive,
    });

    res.json({
      success: true,
      data: position,
      message: 'Position updated successfully',
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /positions/:id - Delete position
 */
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    // Check permission
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_POSITION_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const position = await positionService.deletePosition(tenantId, id);

    res.json({
      success: true,
      data: position,
      message: 'Position deleted successfully',
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /positions/:id/salary-range - Get salary range
 */
router.get('/:id/salary-range', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const salaryRange = await positionService.getPositionSalaryRange(tenantId, id);

    res.json({
      success: true,
      data: salaryRange,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
