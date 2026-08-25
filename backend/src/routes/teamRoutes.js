import express from 'express';
import teamService from '../services/teamService.js';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

/**
 * POST /teams - Create team
 */
router.post('/', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { departmentId, unitId, name, code, description, leaderId, size } = req.body;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_CREATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const team = await teamService.createTeam(tenantId, {
      departmentId,
      unitId,
      name,
      code,
      description,
      leaderId,
      size,
    });

    res.status(201).json({ success: true, data: team });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /teams - List teams
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.user.tenantId || req.user.tenant_id || req.user.business_id;
    const { skip, take, search, departmentId, unitId, isActive } = req.query;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const teams = await teamService.getTeams(tenantId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 100,
      search,
      departmentId,
      unitId,
      isActive: isActive === 'all' ? null : isActive === 'false' ? false : true,
    });

    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /teams/:departmentId - Get teams by department
 */
router.get('/:departmentId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { departmentId } = req.params;
    const { skip, take, search, unitId } = req.query;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const teams = await teamService.getTeamsByDepartment(tenantId, departmentId, {
      skip: parseInt(skip) || 0,
      take: parseInt(take) || 50,
      search,
      unitId,
    });

    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /teams/:id/detail - Get team details
 */
router.get('/:id/detail', async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const team = await teamService.getTeamById(tenantId, req.params.id);
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /teams/:id - Update team
 */
router.put('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const team = await teamService.updateTeam(tenantId, req.params.id, req.body);
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /teams/:id - Delete team
 */
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_DELETE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const team = await teamService.deleteTeam(tenantId, req.params.id);
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /teams/:teamId/members/:employeeId - Add employee to team
 */
router.post('/:teamId/members/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { teamId, employeeId } = req.params;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const team = await teamService.addEmployeeToTeam(tenantId, teamId, employeeId);
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /teams/:teamId/members/:employeeId - Remove employee from team
 */
router.delete('/:teamId/members/:employeeId', async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { employeeId } = req.params;

    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_UPDATE'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const team = await teamService.removeEmployeeFromTeam(tenantId, employeeId);
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /teams/:id/stats - Get team statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!(await hrPermissionService.hasPermission(tenantId, req.user.id, 'HR_TEAM_VIEW'))) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const stats = await teamService.getTeamStats(tenantId, req.params.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
