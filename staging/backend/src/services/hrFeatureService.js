import prisma from '../db.js';

class HRFeatureService {
  featureNameFrom(input = {}) {
    return String(input.featureName || input.featureCode || input.name || '').trim();
  }

  async enableFeature(tenantId, data, enabledBy) {
    const featureName = this.featureNameFrom(data);
    if (!featureName) throw new Error('Feature name is required');

    return prisma.hRModuleFeature.upsert({
      where: { tenantId_featureName: { tenantId, featureName } },
      create: {
        tenantId,
        featureName,
        isEnabled: true,
        config: { ...(data.config || {}), updatedBy: enabledBy || null },
      },
      update: {
        isEnabled: true,
        config: { ...(data.config || {}), updatedBy: enabledBy || null },
      },
    });
  }

  async disableFeature(tenantId, featureName, disabledBy) {
    const feature = await this.getFeatureByCode(tenantId, featureName);
    return prisma.hRModuleFeature.update({
      where: { id: feature.id },
      data: {
        isEnabled: false,
        config: { ...(feature.config || {}), updatedBy: disabledBy || null },
      },
    });
  }

  async getFeatureByCode(tenantId, featureName) {
    const feature = await prisma.hRModuleFeature.findFirst({
      where: { tenantId, featureName },
    });
    if (!feature) throw new Error(`Feature '${featureName}' not found`);
    return feature;
  }

  async isFeatureEnabled(tenantId, featureName) {
    const feature = await prisma.hRModuleFeature.findFirst({
      where: { tenantId, featureName },
      select: { isEnabled: true },
    });
    return Boolean(feature?.isEnabled);
  }

  async getFeatures(tenantId, options = {}) {
    const { skip = 0, take = 50, isEnabled = null } = options;
    return prisma.hRModuleFeature.findMany({
      where: {
        tenantId,
        ...(isEnabled !== null && { isEnabled }),
      },
      skip,
      take,
      orderBy: { featureName: 'asc' },
    });
  }

  async getEnabledFeatures(tenantId) {
    return prisma.hRModuleFeature.findMany({
      where: { tenantId, isEnabled: true },
      orderBy: { featureName: 'asc' },
    });
  }

  async updateFeatureConfig(tenantId, featureName, config, updatedBy) {
    const feature = await this.getFeatureByCode(tenantId, featureName);
    return prisma.hRModuleFeature.update({
      where: { id: feature.id },
      data: {
        config: {
          ...(feature.config || {}),
          ...(config || {}),
          updatedBy: updatedBy || null,
        },
      },
    });
  }

  async updateFeature(tenantId, featureName, data, updatedBy) {
    const feature = await this.getFeatureByCode(tenantId, featureName);
    return prisma.hRModuleFeature.update({
      where: { id: feature.id },
      data: {
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        ...(data.config !== undefined && {
          config: { ...(feature.config || {}), ...(data.config || {}), updatedBy: updatedBy || null },
        }),
      },
    });
  }

  async getFeatureUsage(tenantId, featureName) {
    const feature = await this.getFeatureByCode(tenantId, featureName);
    return {
      featureName,
      isEnabled: feature.isEnabled,
      config: feature.config,
    };
  }
}

export default new HRFeatureService();
