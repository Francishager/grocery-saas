import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * PositionService - Manages job positions in the HR system
 * Independent service with no external dependencies
 */

class PositionService {
  /**
   * Create a new position
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Position data
   * @returns {Promise<object>} Created position
   */
  async createPosition(tenantId, data) {
    const {
      name,
      code,
      description,
      level,
      department,
      minSalary,
      maxSalary,
      isActive = true,
    } = data;

    // Validation
    if (!name || !code) {
      throw new Error('Position name and code are required');
    }

    if (minSalary && maxSalary && minSalary > maxSalary) {
      throw new Error('Minimum salary cannot exceed maximum salary');
    }

    try {
      const position = await prisma.position.create({
        data: {
          tenantId,
          name,
          code,
          description,
          level,
          department,
          minSalary: minSalary || 0,
          maxSalary: maxSalary || 0,
          isActive,
        },
      });

      return position;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Position with code '${code}' already exists for this tenant`);
      }
      throw error;
    }
  }

  /**
   * Get all positions for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter and pagination options
   * @returns {Promise<array>} Positions list
   */
  async getPositions(tenantId, options = {}) {
    const { skip = 0, take = 50, isActive = null, search = null } = options;

    const where = {
      tenantId,
      ...(isActive !== null && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.position.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get position count
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>} Position count
   */
  async getPositionCount(tenantId) {
    return prisma.position.count({
      where: { tenantId },
    });
  }

  /**
   * Get position by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} positionId - Position ID
   * @returns {Promise<object>} Position data
   */
  async getPositionById(tenantId, positionId) {
    const position = await prisma.position.findFirst({
      where: {
        id: positionId,
        tenantId,
      },
    });

    if (!position) {
      throw new Error('Position not found');
    }

    return position;
  }

  /**
   * Update position
   * @param {string} tenantId - Tenant ID
   * @param {string} positionId - Position ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated position
   */
  async updatePosition(tenantId, positionId, data) {
    // Verify position exists
    await this.getPositionById(tenantId, positionId);

    const { name, code, description, level, department, minSalary, maxSalary, isActive } = data;

    if (minSalary && maxSalary && minSalary > maxSalary) {
      throw new Error('Minimum salary cannot exceed maximum salary');
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (level !== undefined) updateData.level = level;
    if (department !== undefined) updateData.department = department;
    if (minSalary !== undefined) updateData.minSalary = minSalary;
    if (maxSalary !== undefined) updateData.maxSalary = maxSalary;
    if (isActive !== undefined) updateData.isActive = isActive;

    try {
      return await prisma.position.update({
        where: { id: positionId },
        data: updateData,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Position with code '${code}' already exists for this tenant`);
      }
      throw error;
    }
  }

  /**
   * Delete position (soft delete - mark as inactive)
   * @param {string} tenantId - Tenant ID
   * @param {string} positionId - Position ID
   * @returns {Promise<object>} Deleted position
   */
  async deletePosition(tenantId, positionId) {
    // Verify position exists
    await this.getPositionById(tenantId, positionId);

    // Check if position is in use
    const employeeCount = await prisma.employee.count({
      where: {
        tenantId,
        positionId,
      },
    });

    if (employeeCount > 0) {
      throw new Error(`Cannot delete position - ${employeeCount} employee(s) assigned to this position`);
    }

    // Soft delete
    return await prisma.position.update({
      where: { id: positionId },
      data: { isActive: false },
    });
  }

  /**
   * Get position salary range
   * @param {string} tenantId - Tenant ID
   * @param {string} positionId - Position ID
   * @returns {Promise<object>} Salary range
   */
  async getPositionSalaryRange(tenantId, positionId) {
    const position = await this.getPositionById(tenantId, positionId);
    return {
      min: position.minSalary,
      max: position.maxSalary,
    };
  }
}

export default new PositionService();
