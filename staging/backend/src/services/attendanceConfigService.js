import prisma from '../db.js';

class AttendanceConfigService {
  async getConfig(tenantId, branchId = null) {
    let config = await prisma.attendanceConfiguration.findFirst({
      where: { tenantId, branchId },
    });

    if (!config) {
      config = await prisma.attendanceConfiguration.create({
        data: {
          tenantId,
          branchId,
          workingHoursPerDay: 8,
          overtimeStartHour: 8,
          lateTolerance: 0,
          methods: ['MANUAL'],
          isActive: true,
        },
      });
    }

    return config;
  }

  async updateConfig(tenantId, branchId, updates) {
    const validated = this.validateSettings(updates);
    if (!validated.valid) throw new Error(`Validation failed: ${validated.errors.join(', ')}`);

    const config = await this.getConfig(tenantId, branchId);
    return prisma.attendanceConfiguration.update({
      where: { id: config.id },
      data: {
        ...(updates.workingHoursPerDay !== undefined && { workingHoursPerDay: Number(updates.workingHoursPerDay) }),
        ...(updates.workWeekDays !== undefined && { workWeekDays: updates.workWeekDays }),
        ...(updates.overtimeStartHour !== undefined && { overtimeStartHour: Number(updates.overtimeStartHour) }),
        ...(updates.lateTolerance !== undefined && { lateTolerance: Number(updates.lateTolerance) }),
        ...(updates.earlyCheckoutAllowed !== undefined && { earlyCheckoutAllowed: Boolean(updates.earlyCheckoutAllowed) }),
        ...(updates.geofencingEnabled !== undefined && { geofencingEnabled: Boolean(updates.geofencingEnabled) }),
        ...(updates.biometricRequired !== undefined && { biometricRequired: Boolean(updates.biometricRequired) }),
        ...(updates.qrCodeRequired !== undefined && { qrCodeRequired: Boolean(updates.qrCodeRequired) }),
        ...(updates.methods !== undefined && { methods: updates.methods }),
        ...(updates.isActive !== undefined && { isActive: Boolean(updates.isActive) }),
      },
    });
  }

  validateSettings(config = {}) {
    const errors = [];
    const workingHours = config.workingHoursPerDay !== undefined ? Number(config.workingHoursPerDay) : null;
    const overtimeStart = config.overtimeStartHour !== undefined ? Number(config.overtimeStartHour) : null;
    const lateTolerance = config.lateTolerance !== undefined ? Number(config.lateTolerance) : null;

    if (workingHours !== null && (!Number.isFinite(workingHours) || workingHours < 1 || workingHours > 24)) {
      errors.push('Working hours must be between 1 and 24');
    }
    if (overtimeStart !== null && workingHours !== null && overtimeStart > workingHours) {
      errors.push('Overtime threshold cannot exceed working hours');
    }
    if (lateTolerance !== null && (!Number.isFinite(lateTolerance) || lateTolerance < 0)) {
      errors.push('Late tolerance cannot be negative');
    }
    if (config.methods !== undefined && !Array.isArray(config.methods)) {
      errors.push('Methods must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  async setWorkingHours(tenantId, branchId, hours) {
    return this.updateConfig(tenantId, branchId, { workingHoursPerDay: hours });
  }

  async setOvertimeThreshold(tenantId, branchId, hours) {
    return this.updateConfig(tenantId, branchId, { overtimeStartHour: hours });
  }

  async enableBiometric(tenantId, branchId = null) {
    const config = await this.getConfig(tenantId, branchId);
    return this.updateConfig(tenantId, branchId, {
      biometricRequired: true,
      methods: [...new Set([...(config.methods || []), 'BIOMETRIC'])],
    });
  }

  async enableQRCode(tenantId, branchId = null) {
    const config = await this.getConfig(tenantId, branchId);
    return this.updateConfig(tenantId, branchId, {
      qrCodeRequired: true,
      methods: [...new Set([...(config.methods || []), 'QR_CODE'])],
    });
  }

  async enableGeofencing(tenantId, branchId = null) {
    return this.updateConfig(tenantId, branchId, { geofencingEnabled: true });
  }
}

export default new AttendanceConfigService();
