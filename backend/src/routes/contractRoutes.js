import express from 'express';
import contractService from '../services/employeeContractService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /contracts - Create contract
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_CONTRACT_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const contract = await contractService.createContract(tenantId, {
      ...req.body,
      createdBy: userId,
    });

    res.status(201).json({ success: true, data: contract });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /contracts/employee/:employeeId - Get employee contracts
 */
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;
    const { skip, take, status } = req.query;

    const contracts = await contractService.getEmployeeContracts(tenantId, employeeId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      status,
    });

    res.json({ success: true, data: contracts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /contracts/:id - Get contract
 */
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const contract = await contractService.getContractById(tenantId, req.params.id);
    res.json({ success: true, data: contract });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /contracts/:id - Update contract
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_CONTRACT_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const contract = await contractService.updateContract(tenantId, req.params.id, req.body);
    res.json({ success: true, data: contract });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /contracts/:id/terminate - Terminate contract
 */
router.post('/:id/terminate', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { terminationDate } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_CONTRACT_TERMINATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const contract = await contractService.terminateContract(tenantId, req.params.id, terminationDate);
    res.json({ success: true, data: contract });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /contracts/active/list - Get active contracts
 */
router.get('/active/list', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { skip, take } = req.query;

    const contracts = await contractService.getActiveContracts(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
    });

    res.json({ success: true, data: contracts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /contracts/expiring/list - Get expiring contracts
 */
router.get('/expiring/list', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { days = 30 } = req.query;

    const contracts = await contractService.getExpiringContracts(tenantId, parseInt(days));
    res.json({ success: true, data: contracts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /contracts/:id/renew - Renew contract
 */
router.post('/:id/renew', async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, userId, 'HR_CONTRACT_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const contract = await contractService.updateContract(tenantId, req.params.id, {
      status: 'renewed',
      renewalStatus: 'renewed',
      ...req.body,
    });

    res.json({ success: true, data: contract });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
