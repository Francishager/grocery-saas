import express from 'express';
import departmentService from '../services/departmentService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /departments - Create department
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, code, description, headId, branchId } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_DEPARTMENT_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const department = await departmentService.createDepartment(tenantId, {
      name,
      code,
      description,
      headId,
      branchId,
    });

    res.status(201).json({ success: true, data: department });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /departments - List departments
 */
router.get('/', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { skip, take, search, branchId } = req.query;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_DEPARTMENT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const departments = await departmentService.getDepartments(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      search,
      branchId,
    });

    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /departments/:id - Get department
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_DEPARTMENT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const department = await departmentService.getDepartmentById(tenantId, req.params.id);
    res.json({ success: true, data: department });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /departments/:id - Update department
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_DEPARTMENT_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const department = await departmentService.updateDepartment(tenantId, req.params.id, req.body);
    res.json({ success: true, data: department });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /departments/:id - Delete department
 */
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_DEPARTMENT_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const department = await departmentService.deleteDepartment(tenantId, req.params.id);
    res.json({ success: true, data: department });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /departments/:id/hierarchy - Get department hierarchy
 */
router.get('/:id/hierarchy', async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_DEPARTMENT_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const hierarchy = await departmentService.getDepartmentHierarchy(tenantId, req.params.id);
    res.json({ success: true, data: hierarchy });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
