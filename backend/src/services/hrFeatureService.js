import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * HRFeatureService - Manages SaaS feature toggles for HR module
 */

class HRFeatureService {
  /**
   * Enable feature for tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Feature data
   * @param {string} enabledBy - User enabling feature
   * @returns {Promise<object>} Enabled feature
   */
  async enableFeature(tenantId, data, enabledBy) {
    const { featureCode, featureName, description, module = 'HR', config = {} } = data;

    if (!featureCode || !featureName) {
      throw new Error('Feature code and name are required');
    }

    try {
      return await prisma.hRModuleFeature.create({
        data: {
          tenantId,
          featureCode,
          featureName,
          description,
          module,
          isEnabled: true,
          config,
          enabledDate: new Date(),
          enabledBy,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        // Feature already exists, enable it
        return await this.updateFeature(tenantId, featureCode, { isEnabled: true }, enabledBy);
      }
      throw error;
    }
  }

  /**
   * Disable feature for tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} featureCode - Feature code
   * @param {string} disabledBy - User disabling feature
   * @returns {Promise<object>} Disabled feature
   */
  async disableFeature(tenantId, featureCode, disabledBy) {
    const feature = await this.getFeatureByCode(tenantId, featureCode);

    return await prisma.hRModuleFeature.update({
      where: { id: feature.id },
      data: {
        isEnabled: false,
        disabledDate: new Date(),
        disabledBy,
      },
    });
  }

  /**
   * Get feature by code
   * @param {string} tenantId - Tenant ID
   * @param {string} featureCode - Feature code
   * @returns {Promise<object>} Feature
   */
  async getFeatureByCode(tenantId, featureCode) {
    const feature = await prisma.hRModuleFeature.findFirst({
      where: {
        tenantId,
        featureCode,
      },
    });

    if (!feature) {
      throw new Error(`Feature '${featureCode}' not found`);
    }

    return feature;
  }

  /**
   * Check if feature is enabled
   * @param {string} tenantId - Tenant ID
   * @param {string} featureCode - Feature code
   * @returns {Promise<boolean>} Is enabled
   */
  async isFeatureEnabled(tenantId, featureCode) {
    try {
      const feature = await this.getFeatureByCode(tenantId, featureCode);
      return feature.isEnabled;
    } catch {
      return false;
    }
  }

  /**
   * Get all features for tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Features list
   */
  async getFeatures(tenantId, options = {}) {
    const { skip = 0, take = 50, module = 'HR', isEnabled = null } = options;

    const where = {
      tenantId,
      module,
      ...(isEnabled !== null && { isEnabled }),
    };

    return prisma.hRModuleFeature.findMany({
      where,
      skip,
      take,
      orderBy: { featureCode: 'asc' },
    });
  }

  /**
   * Get enabled features for tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} module - Module name
   * @returns {Promise<array>} Enabled features
   */
  async getEnabledFeatures(tenantId, module = 'HR') {
    return prisma.hRModuleFeature.findMany({
      where: {
        tenantId,
        module,
        isEnabled: true,
      },
      orderBy: { featureCode: 'asc' },
    });
  }

  /**
   * Update feature config
   * @param {string} tenantId - Tenant ID
   * @param {string} featureCode - Feature code
   * @param {object} config - New config
   * @param {string} updatedBy - User updating
   * @returns {Promise<object>} Updated feature
   */
  async updateFeatureConfig(tenantId, featureCode, config, updatedBy) {
    const feature = await this.getFeatureByCode(tenantId, featureCode);

    return await prisma.hRModuleFeature.update({
      where: { id: feature.id },
      data: {
        config: {
          ...feature.config,
          ...config,
        },
        updatedDate: new Date(),
        updatedBy,
      },
    });
  }

  /**
   * Update feature
   * @param {string} tenantId - Tenant ID
   * @param {string} featureCode - Feature code
   * @param {object} data - Update data
   * @param {string} updatedBy - User updating
   * @returns {Promise<object>} Updated feature
   */
  async updateFeature(tenantId, featureCode, data, updatedBy) {
    const feature = await this.getFeatureByCode(tenantId, featureCode);

    const { isEnabled, description, config } = data;

    const updateData = {
      ...(isEnabled !== undefined && {
        isEnabled,
        ...(isEnabled ? { enabledDate: new Date() } : { disabledDate: new Date() }),
        updatedBy,
      }),
      ...(description !== undefined && { description }),
      ...(config !== undefined && { config: { ...feature.config, ...config } }),
      updatedDate: new Date(),
    };

    return await prisma.hRModuleFeature.update({
      where: { id: feature.id },
      data: updateData,
    });
  }

  /**
   * Get feature usage count
   * @param {string} tenantId - Tenant ID
   * @param {string} featureCode - Feature code
   * @returns {Promise<object>} Usage stats
   */
  async getFeatureUsage(tenantId, featureCode) {
    const feature = await this.getFeatureByCode(tenantId, featureCode);

    return {
      featureCode,
      isEnabled: feature.isEnabled,
      enabledDate: feature.enabledDate,
      disabledDate: feature.disabledDate,
      config: feature.config,
    };
  }
}

export default new HRFeatureService();
