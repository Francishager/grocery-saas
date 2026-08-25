import express from 'express';
import multer from 'multer';
import employeeService from '../services/employeeService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';
import { safeCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinaryUpload.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const tenantIdFromRequest = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id || req.tenantId;

router.use(requireAuth);
router.use(requireTenant);

async function attachProfilePhoto(req) {
  if (!req.file) return req.body;
  if (!String(req.file.mimetype || '').startsWith('image/')) {
    const error = new Error('Passport photo must be an image file');
    error.status = 400;
    throw error;
  }

  const tenantId = tenantIdFromRequest(req);
  const cloudResult = await uploadBufferToCloudinary(req.file.buffer, {
    folder: `jibusales/hr/${tenantId}/employees`,
    publicId: `${Date.now()}-${safeCloudinaryId(req.file.originalname)}`,
    resourceType: 'image',
  });

  return {
    ...req.body,
    profilePhoto: cloudResult.secure_url,
  };
}

/**
 * POST /employees - Create employee
 */
router.post('/', upload.single('profilePhoto'), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const body = await attachProfilePhoto(req);
    const canManageHROpeningBalances = await hrPermissionService.hasPermission(tenantId, userId, 'HR_PAYROLL_MANAGE');
    const employee = await employeeService.createEmployee(tenantId, {
      ...body,
      createdBy: userId,
      canManageHROpeningBalances,
    });
    res.status(201).json({ success: true, data: employee });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

/**
 * GET /employees - List employees
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { skip, take, departmentId, unitId, teamId, positionId, status, search } = req.query;

    const employees = await employeeService.getEmployees(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      departmentId,
      unitId,
      teamId,
      positionId,
      status: status || null,
      search,
    });

    const count = await employeeService.getEmployeeCount(tenantId, status && status !== 'all' ? { status } : {});
    res.json({ success: true, data: employees, pagination: { skip: parseInt(skip) || 0, take: parseInt(take) || 50, total: count } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employees/:id - Get employee
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_EMPLOYEE_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const employee = await employeeService.getEmployeeById(tenantId, req.params.id);
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /employees/:id - Update employee
 */
router.put('/:id', upload.single('profilePhoto'), async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const body = await attachProfilePhoto(req);
    const canManageHROpeningBalances = await hrPermissionService.hasPermission(tenantId, userId, 'HR_PAYROLL_MANAGE');
    const employee = await employeeService.updateEmployee(tenantId, req.params.id, {
      ...body,
      updatedBy: userId,
      canManageHROpeningBalances,
    });
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

/**
 * DELETE /employees/:id - Delete employee (soft)
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const employee = await employeeService.softDeleteEmployee(tenantId, req.params.id);
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /employees/:id/transfer - Transfer employee
 */
router.post('/:id/transfer', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_TRANSFER'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const employee = await employeeService.transferEmployee(tenantId, req.params.id, req.body, userId);
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /employees/:id/promote - Promote employee
 */
router.post('/:id/promote', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_PROMOTE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const employee = await employeeService.promoteEmployee(tenantId, req.params.id, req.body, userId);
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /employees/:id/supervisor - Assign supervisor
 */
router.post('/:id/supervisor', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const { id: userId } = req.user;
    const { supervisorId } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_EMPLOYEE_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const employee = await employeeService.assignSupervisor(tenantId, req.params.id, supervisorId);
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employees/:id/subordinates - Get subordinates
 */
router.get('/:id/subordinates', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_EMPLOYEE_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const subordinates = await employeeService.getSubordinates(tenantId, req.params.id);
    res.json({ success: true, data: subordinates });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employees/:id/reporting-structure - Get reporting structure
 */
router.get('/:id/reporting-structure', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const structure = await employeeService.getReportingStructure(tenantId, req.params.id);
    res.json({ success: true, data: structure });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /employees/:id/profile - Get full profile
 */
router.get('/:id/profile', async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const profile = await employeeService.getFullEmployeeProfile(tenantId, req.params.id);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
