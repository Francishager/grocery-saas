import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * DepartmentService - Manages organizational departments
 */

class DepartmentService {
  /**
   * Create a new department
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Department data
   * @returns {Promise<object>} Created department
   */
  async createDepartment(tenantId, data) {
    const { name, code, description, headId, branchId, isActive = true } = data;

    if (!name || !code) {
      throw new Error('Department name and code are required');
    }

    try {
      const department = await prisma.department.create({
        data: {
          tenantId,
          name,
          code,
          description,
          headId,
          branchId,
          isActive,
        },
      });

      return department;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Department with code '${code}' already exists for this tenant`);
      }
      throw error;
    }
  }

  /**
   * Get all departments for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Departments list
   */
  async getDepartments(tenantId, options = {}) {
    const { skip = 0, take = 50, branchId = null, isActive = true, search = null } = options;

    const where = {
      tenantId,
      isActive: isActive !== null ? isActive : undefined,
      ...(branchId && { branchId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.department.findMany({
      where,
      skip,
      take,
      include: {
        employees: { select: { id: true, firstName: true, lastName: true } },
        units: { select: { id: true, name: true } },
        teams: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get department by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<object>} Department data
   */
  async getDepartmentById(tenantId, departmentId) {
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        tenantId,
      },
      include: {
        employees: true,
        units: true,
        teams: true,
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    return department;
  }

  /**
   * Update department
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated department
   */
  async updateDepartment(tenantId, departmentId, data) {
    await this.getDepartmentById(tenantId, departmentId);

    const { name, code, description, headId, branchId, isActive } = data;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (headId !== undefined) updateData.headId = headId;
    if (branchId !== undefined) updateData.branchId = branchId;
    if (isActive !== undefined) updateData.isActive = isActive;

    try {
      return await prisma.department.update({
        where: { id: departmentId },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Department with code '${code}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Delete department (soft delete)
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<object>} Deleted department
   */
  async deleteDepartment(tenantId, departmentId) {
    const dept = await this.getDepartmentById(tenantId, departmentId);

    if (dept.employees.length > 0 || dept.units.length > 0 || dept.teams.length > 0) {
      throw new Error('Cannot delete department with active employees, units, or teams');
    }

    return await prisma.department.update({
      where: { id: departmentId },
      data: { isActive: false },
    });
  }

  /**
   * Get department with hierarchy
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<object>} Department with units and teams
   */
  async getDepartmentHierarchy(tenantId, departmentId) {
    const department = await this.getDepartmentById(tenantId, departmentId);

    const units = await prisma.unit.findMany({
      where: {
        tenantId,
        departmentId,
      },
      include: {
        teams: true,
      },
    });

    return {
      ...department,
      hierarchy: units,
    };
  }

  /**
   * Get department statistics
   * @param {string} tenantId - Tenant ID
   * @param {string} departmentId - Department ID
   * @returns {Promise<object>} Department stats
   */
  async getDepartmentStats(tenantId, departmentId) {
    const dept = await this.getDepartmentById(tenantId, departmentId);

    const stats = {
      totalEmployees: dept.employees.length,
      totalUnits: dept.units.length,
      totalTeams: dept.teams.length,
    };

    return stats;
  }
}

export default new DepartmentService();
