/**
 * Attendance Configuration Service - Manages attendance system settings
 */

const db = require('../../config/db');

class AttendanceConfigService {
  /**
   * Get configuration for tenant/branch
   */
  async getConfig(tenantId, branchId = null) {
    try {
      let config = await db.attendance_configurations.findUnique({
        where: {
          tenantId_branchId: { tenantId, branchId },
        },
      });

      // Create default if not exists
      if (!config) {
        config = await db.attendance_configurations.create({
          data: {
            tenantId,
            branchId,
            workingHoursPerDay: 8.0,
            overtimeStartHour: 8.0,
            lateTolerance: 0,
            methods: ['MANUAL'],
            isActive: true,
          },
        });
      }

      return config;
    } catch (error) {
      throw new Error(`Failed to get config: ${error.message}`);
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(tenantId, branchId, updates) {
    try {
      const validated = this.validateSettings({
        workingHoursPerDay: updates.workingHoursPerDay,
        overtimeStartHour: updates.overtimeStartHour,
        lateTolerance: updates.lateTolerance,
        methods: updates.methods,
      });

      if (!validated.valid) {
        throw new Error(`Validation failed: ${validated.errors.join(', ')}`);
      }

      const config = await db.attendance_configurations.update({
        where: {
          tenantId_branchId: { tenantId, branchId },
        },
        data: updates,
      });

      return config;
    } catch (error) {
      throw new Error(`Failed to update config: ${error.message}`);
    }
  }

  /**
   * Validate configuration settings
   */
  validateSettings(config) {
    const errors = [];

    if (config.workingHoursPerDay && (config.workingHoursPerDay < 1 || config.workingHoursPerDay > 24)) {
      errors.push('Working hours must be between 1 and 24');
    }

    if (config.overtimeStartHour && config.overtimeStartHour > config.workingHoursPerDay) {
      errors.push('Overtime threshold cannot exceed working hours');
    }

    if (config.lateTolerance && config.lateTolerance < 0) {
      errors.push('Late tolerance cannot be negative');
    }

    if (config.methods && !Array.isArray(config.methods)) {
      errors.push('Methods must be an array');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Set working hours for tenant
   */
  async setWorkingHours(tenantId, branchId, hours) {
    if (hours < 1 || hours > 24) {
      throw new Error('Working hours must be between 1 and 24');
    }

    return this.updateConfig(tenantId, branchId, { workingHoursPerDay: hours });
  }

  /**
   * Set overtime threshold
   */
  async setOvertimeThreshold(tenantId, branchId, hours) {
    const config = await this.getConfig(tenantId, branchId);

    if (hours > config.workingHoursPerDay) {
      throw new Error('Overtime threshold cannot exceed working hours');
    }

    return this.updateConfig(tenantId, branchId, { overtimeStartHour: hours });
  }

  /**
   * Enable biometric attendance
   */
  async enableBiometric(tenantId, branchId = null) {
    const config = await this.getConfig(tenantId, branchId);
    const methods = [...(config.methods || []), 'BIOMETRIC'];

    return this.updateConfig(tenantId, branchId, {
      biometricRequired: true,
      methods: [...new Set(methods)],
    });
  }

  /**
   * Enable QR code attendance
   */
  async enableQRCode(tenantId, branchId = null) {
    const config = await this.getConfig(tenantId, branchId);
    const methods = [...(config.methods || []), 'QR_CODE'];

    return this.updateConfig(tenantId, branchId, {
      qrCodeRequired: true,
      methods: [...new Set(methods)],
    });
  }

  /**
   * Enable geofencing
   */
  async enableGeofencing(tenantId, branchId = null) {
    return this.updateConfig(tenantId, branchId, { geofencingEnabled: true });
  }
}

module.exports = new AttendanceConfigService();
