import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * UnitService - Manages organizational units within departments
 */

class UnitService {
  /**
   * Create a new unit
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Unit data
   * @returns {Promise<object>} Created unit
   */
  async createUnit(tenantId, data) {
    const { departmentId, name, code, description, headId, isActive = true } = data;

    if (!departmentId || !name || !code) {
      throw new Error('Department ID, unit name, and code are required');
    }

    // Verify department exists
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, tenantId },
    });

    if (!dept) {
      throw new Error('Department not found');
    }

    try {
      return await prisma.unit.create({
        data: {
          tenantId,
          departmentId,
          name,
          code,
          description,
          headId,
          isActive,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Unit with code '${code}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Get units for a department
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Units list
   */
  async getUnitsByDepartment(tenantId, departmentId, options = {}) {
    const { skip = 0, take = 50, isActive = true, search = null } = options;

    const where = {
      tenantId,
      departmentId,
      ...(isActive !== null && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.unit.findMany({
      where,
      skip,
      take,
      include: {
        department: true,
        employees: { select: { id: true, firstName: true, lastName: true } },
        teams: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get unit by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} unitId - Unit ID
   * @returns {Promise<object>} Unit data
   */
  async getUnitById(tenantId, unitId) {
    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        tenantId,
      },
      include: {
        department: true,
        employees: true,
        teams: true,
      },
    });

    if (!unit) {
      throw new Error('Unit not found');
    }

    return unit;
  }

  /**
   * Update unit
   * @param {string} tenantId - Tenant ID
   * @param {string} unitId - Unit ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated unit
   */
  async updateUnit(tenantId, unitId, data) {
    await this.getUnitById(tenantId, unitId);

    const { name, code, description, headId, isActive } = data;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (headId !== undefined) updateData.headId = headId;
    if (isActive !== undefined) updateData.isActive = isActive;

    try {
      return await prisma.unit.update({
        where: { id: unitId },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Unit with code '${code}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Delete unit (soft delete)
   * @param {string} tenantId - Tenant ID
   * @param {string} unitId - Unit ID
   * @returns {Promise<object>} Deleted unit
   */
  async deleteUnit(tenantId, unitId) {
    const unit = await this.getUnitById(tenantId, unitId);

    if (unit.employees.length > 0 || unit.teams.length > 0) {
      throw new Error('Cannot delete unit with active employees or teams');
    }

    return await prisma.unit.update({
      where: { id: unitId },
      data: { isActive: false },
    });
  }

  /**
   * Get unit statistics
   * @param {string} tenantId - Tenant ID
   * @param {string} unitId - Unit ID
   * @returns {Promise<object>} Unit stats
   */
  async getUnitStats(tenantId, unitId) {
    const unit = await this.getUnitById(tenantId, unitId);

    return {
      totalEmployees: unit.employees.length,
      totalTeams: unit.teams.length,
    };
  }
}

export default new UnitService();
