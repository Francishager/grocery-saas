import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * HRPermissionService - Manages RBAC permissions for HR module
 */

class HRPermissionService {
  /**
   * Grant permission to user/role
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Permission data
   * @returns {Promise<object>} Created permission
   */
  async grantPermission(tenantId, data) {
    const {
      userId,
      roleId,
      permissionCode,
      permissionName,
      description,
      module = 'HR',
      grantedBy,
    } = data;

    if (!permissionCode || !permissionName || (!userId && !roleId)) {
      throw new Error('Permission code, name, and either user ID or role ID are required');
    }

    try {
      return await prisma.hRPermission.create({
        data: {
          tenantId,
          userId,
          roleId,
          permissionCode,
          permissionName,
          description,
          module,
          grantedDate: new Date(),
          grantedBy,
          status: 'active',
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error('Permission already granted to this user/role');
      }
      throw error;
    }
  }

  /**
   * Revoke permission
   * @param {string} tenantId - Tenant ID
   * @param {string} permissionId - Permission ID
   * @param {string} revokedBy - User revoking
   * @returns {Promise<object>} Revoked permission
   */
  async revokePermission(tenantId, permissionId, revokedBy) {
    const permission = await this.getPermissionById(tenantId, permissionId);

    return await prisma.hRPermission.update({
      where: { id: permissionId },
      data: {
        status: 'revoked',
        revokedDate: new Date(),
        revokedBy,
      },
    });
  }

  /**
   * Get permission by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} permissionId - Permission ID
   * @returns {Promise<object>} Permission
   */
  async getPermissionById(tenantId, permissionId) {
    const permission = await prisma.hRPermission.findFirst({
      where: {
        id: permissionId,
        tenantId,
      },
    });

    if (!permission) {
      throw new Error('Permission not found');
    }

    return permission;
  }

  /**
   * Get permissions for user
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {string} module - Module name
   * @returns {Promise<array>} User permissions
   */
  async getPermissionsByUser(tenantId, userId, module = 'HR') {
    return prisma.hRPermission.findMany({
      where: {
        tenantId,
        userId,
        module,
        status: 'active',
      },
      orderBy: { permissionCode: 'asc' },
    });
  }

  /**
   * Get permissions for role
   * @param {string} tenantId - Tenant ID
   * @param {string} roleId - Role ID
   * @param {string} module - Module name
   * @returns {Promise<array>} Role permissions
   */
  async getPermissionsByRole(tenantId, roleId, module = 'HR') {
    return prisma.hRPermission.findMany({
      where: {
        tenantId,
        roleId,
        module,
        status: 'active',
      },
      orderBy: { permissionCode: 'asc' },
    });
  }

  /**
   * Check if user has permission
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {string} permissionCode - Permission code
   * @returns {Promise<boolean>} Has permission
   */
  async hasPermission(tenantId, userId, permissionCode) {
    const permission = await prisma.hRPermission.findFirst({
      where: {
        tenantId,
        userId,
        permissionCode,
        status: 'active',
      },
    });

    return !!permission;
  }

  /**
   * Check if user has all permissions
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {array} permissionCodes - Permission codes
   * @returns {Promise<boolean>} Has all permissions
   */
  async hasAllPermissions(tenantId, userId, permissionCodes) {
    const permissions = await this.getPermissionsByUser(tenantId, userId);
    const userPermissions = new Set(permissions.map(p => p.permissionCode));

    return permissionCodes.every(code => userPermissions.has(code));
  }

  /**
   * Check if user has any permission
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {array} permissionCodes - Permission codes
   * @returns {Promise<boolean>} Has any permission
   */
  async hasAnyPermission(tenantId, userId, permissionCodes) {
    const permissions = await this.getPermissionsByUser(tenantId, userId);
    const userPermissions = new Set(permissions.map(p => p.permissionCode));

    return permissionCodes.some(code => userPermissions.has(code));
  }

  /**
   * Update permissions
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {array} permissionCodes - New permission codes
   * @param {string} updatedBy - User updating
   * @returns {Promise<array>} Updated permissions
   */
  async updateUserPermissions(tenantId, userId, permissionCodes, updatedBy) {
    // Get current permissions
    const currentPermissions = await this.getPermissionsByUser(tenantId, userId);

    // Revoke removed permissions
    const currentCodes = new Set(currentPermissions.map(p => p.permissionCode));
    const newCodes = new Set(permissionCodes);

    for (const perm of currentPermissions) {
      if (!newCodes.has(perm.permissionCode)) {
        await this.revokePermission(tenantId, perm.id, updatedBy);
      }
    }

    // Grant new permissions
    for (const code of permissionCodes) {
      if (!currentCodes.has(code)) {
        await this.grantPermission(tenantId, {
          userId,
          permissionCode: code,
          permissionName: code,
          grantedBy: updatedBy,
        });
      }
    }

    return this.getPermissionsByUser(tenantId, userId);
  }

  /**
   * Get all permissions for tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} All permissions
   */
  async getAllPermissions(tenantId, options = {}) {
    const { module = 'HR', status = 'active' } = options;

    return prisma.hRPermission.findMany({
      where: {
        tenantId,
        module,
        ...(status && { status }),
      },
      orderBy: [{ permissionCode: 'asc' }],
      distinct: ['permissionCode'],
    });
  }
}

export default new HRPermissionService();
