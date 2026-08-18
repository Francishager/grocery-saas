import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * TeamService - Manages teams within units
 */

class TeamService {
  /**
   * Create a new team
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Team data
   * @returns {Promise<object>} Created team
   */
  async createTeam(tenantId, data) {
    const { departmentId, unitId, name, code, description, leaderId, size = 0, isActive = true } = data;

    if (!departmentId || !name || !code) {
      throw new Error('Department ID, team name, and code are required');
    }

    // Verify department exists
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, tenantId },
    });

    if (!dept) {
      throw new Error('Department not found');
    }

    // If unitId provided, verify it exists
    if (unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: unitId, tenantId, departmentId },
      });

      if (!unit) {
        throw new Error('Unit not found or does not belong to this department');
      }
    }

    try {
      return await prisma.team.create({
        data: {
          tenantId,
          departmentId,
          unitId,
          name,
          code,
          description,
          leaderId,
          size,
          isActive,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Team with code '${code}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Get all teams for a tenant.
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Teams list
   */
  async getTeams(tenantId, options = {}) {
    const { skip = 0, take = 100, departmentId = null, unitId = null, isActive = true, search = null } = options;

    const where = {
      tenantId,
      ...(departmentId && { departmentId }),
      ...(unitId && { unitId }),
      ...(isActive !== null && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.team.findMany({
      where,
      skip,
      take,
      include: {
        department: true,
        unit: true,
        employees: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  /**
   * Get teams in a department or unit
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Teams list
   */
  async getTeamsByDepartment(tenantId, departmentId, options = {}) {
    const { skip = 0, take = 50, unitId = null, isActive = true, search = null } = options;

    const where = {
      tenantId,
      departmentId,
      ...(unitId && { unitId }),
      ...(isActive !== null && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.team.findMany({
      where,
      skip,
      take,
      include: {
        department: true,
        unit: true,
        employees: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get team by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} teamId - Team ID
   * @returns {Promise<object>} Team data
   */
  async getTeamById(tenantId, teamId) {
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        tenantId,
      },
      include: {
        department: true,
        unit: true,
        employees: {
          include: {
            department: true,
            positionRole: true,
          },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    return team;
  }

  /**
   * Update team
   * @param {string} tenantId - Tenant ID
   * @param {string} teamId - Team ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated team
   */
  async updateTeam(tenantId, teamId, data) {
    await this.getTeamById(tenantId, teamId);

    const { name, code, description, leaderId, size, isActive } = data;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (leaderId !== undefined) updateData.leaderId = leaderId;
    if (size !== undefined) updateData.size = size;
    if (isActive !== undefined) updateData.isActive = isActive;

    try {
      return await prisma.team.update({
        where: { id: teamId },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Team with code '${code}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Delete team (soft delete)
   * @param {string} tenantId - Tenant ID
   * @param {string} teamId - Team ID
   * @returns {Promise<object>} Deleted team
   */
  async deleteTeam(tenantId, teamId) {
    const team = await this.getTeamById(tenantId, teamId);

    if (team.employees.length > 0) {
      throw new Error(`Cannot delete team with ${team.employees.length} active member(s)`);
    }

    return await prisma.team.update({
      where: { id: teamId },
      data: { isActive: false },
    });
  }

  /**
   * Add employee to team
   * @param {string} tenantId - Tenant ID
   * @param {string} teamId - Team ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Updated team
   */
  async addEmployeeToTeam(tenantId, teamId, employeeId) {
    const team = await this.getTeamById(tenantId, teamId);
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Update employee's team
    await prisma.employee.update({
      where: { id: employeeId },
      data: { teamId },
    });

    // Update team size
    const newSize = (team.employees.length || 0) + 1;
    return await prisma.team.update({
      where: { id: teamId },
      data: { size: newSize },
    });
  }

  /**
   * Remove employee from team
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Updated team
   */
  async removeEmployeeFromTeam(tenantId, employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee || !employee.teamId) {
      throw new Error('Employee not found or not assigned to any team');
    }

    const team = await this.getTeamById(tenantId, employee.teamId);

    await prisma.employee.update({
      where: { id: employeeId },
      data: { teamId: null },
    });

    const newSize = Math.max(0, (team.employees.length || 1) - 1);
    return await prisma.team.update({
      where: { id: employee.teamId },
      data: { size: newSize },
    });
  }

  /**
   * Get team statistics
   * @param {string} tenantId - Tenant ID
   * @param {string} teamId - Team ID
   * @returns {Promise<object>} Team stats
   */
  async getTeamStats(tenantId, teamId) {
    const team = await this.getTeamById(tenantId, teamId);

    return {
      totalMembers: team.employees.length,
      declaredSize: team.size,
      utilizationRate: team.size > 0 ? (team.employees.length / team.size) * 100 : 0,
    };
  }
}

export default new TeamService();
