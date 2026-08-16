/**
 * Shift Service - Manages shift templates and assignments
 */

const db = require('../../config/db');

class ShiftService {
  /**
   * Create shift template
   */
  async createTemplate(tenantId, branchId, data) {
    try {
      const template = await db.shift_templates.create({
        data: {
          tenantId,
          branchId,
          name: data.name,
          code: data.code,
          description: data.description,
          startTime: data.startTime, // "09:00"
          endTime: data.endTime, // "17:00"
          breakDuration: data.breakDuration || 60,
          workingHours: this.calculateWorkingHours(data.startTime, data.endTime, data.breakDuration || 60),
          isDefault: data.isDefault || false,
          isActive: true,
        },
      });

      return template;
    } catch (error) {
      throw new Error(`Failed to create template: ${error.message}`);
    }
  }

  /**
   * Update shift template
   */
  async updateTemplate(tenantId, templateId, updates) {
    try {
      const template = await db.shift_templates.findUniqueOrThrow({
        where: { id: templateId },
      });

      if (template.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      const data = {
        name: updates.name || template.name,
        description: updates.description,
        startTime: updates.startTime || template.startTime,
        endTime: updates.endTime || template.endTime,
        breakDuration: updates.breakDuration !== undefined ? updates.breakDuration : template.breakDuration,
      };

      // Recalculate working hours if times changed
      if (updates.startTime || updates.endTime || updates.breakDuration) {
        data.workingHours = this.calculateWorkingHours(data.startTime, data.endTime, data.breakDuration);
      }

      return db.shift_templates.update({
        where: { id: templateId },
        data,
      });
    } catch (error) {
      throw new Error(`Failed to update template: ${error.message}`);
    }
  }

  /**
   * Get all shift templates for tenant/branch
   */
  async getTemplates(tenantId, branchId = null) {
    try {
      return db.shift_templates.findMany({
        where: {
          tenantId,
          branchId,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      throw new Error(`Failed to get templates: ${error.message}`);
    }
  }

  /**
   * Assign shift to employee
   */
  async assignShift(tenantId, employeeId, templateId, startDate, endDate = null) {
    try {
      const template = await db.shift_templates.findUniqueOrThrow({
        where: { id: templateId },
      });

      if (template.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      // Check for overlapping assignments
      const existing = await db.shift_assignments.findFirst({
        where: {
          tenantId,
          employeeId,
          assignmentStartDate: { lte: endDate || startDate },
          assignmentEndDate: { gte: startDate },
          isActive: true,
        },
      });

      if (existing) {
        throw new Error('Overlapping shift assignment exists');
      }

      const assignment = await db.shift_assignments.create({
        data: {
          tenantId,
          employeeId,
          shiftTemplateId: templateId,
          shiftTemplateName: template.name,
          assignmentStartDate: new Date(startDate),
          assignmentEndDate: endDate ? new Date(endDate) : null,
          status: 'pending',
          isActive: true,
        },
      });

      return assignment;
    } catch (error) {
      throw new Error(`Failed to assign shift: ${error.message}`);
    }
  }

  /**
   * Update shift assignment
   */
  async updateAssignment(tenantId, assignmentId, updates) {
    try {
      const assignment = await db.shift_assignments.findUniqueOrThrow({
        where: { id: assignmentId },
      });

      if (assignment.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      return db.shift_assignments.update({
        where: { id: assignmentId },
        data: {
          status: updates.status || assignment.status,
          approvedBy: updates.approvedBy,
          approvedAt: updates.approvedBy ? new Date() : null,
          rotationType: updates.rotationType || assignment.rotationType,
          reason: updates.reason,
        },
      });
    } catch (error) {
      throw new Error(`Failed to update assignment: ${error.message}`);
    }
  }

  /**
   * Get current shift for employee
   */
  async getCurrentShift(tenantId, employeeId) {
    try {
      const today = new Date();

      const assignment = await db.shift_assignments.findFirst({
        where: {
          tenantId,
          employeeId,
          assignmentStartDate: { lte: today },
          OR: [
            { assignmentEndDate: null },
            { assignmentEndDate: { gte: today } },
          ],
          isActive: true,
          status: 'active',
        },
      });

      if (!assignment) return null;

      const template = await db.shift_templates.findUnique({
        where: { id: assignment.shiftTemplateId },
      });

      return { assignment, template };
    } catch (error) {
      throw new Error(`Failed to get current shift: ${error.message}`);
    }
  }

  /**
   * Get shift history for employee
   */
  async getShiftHistory(tenantId, employeeId) {
    try {
      return db.shift_assignments.findMany({
        where: {
          tenantId,
          employeeId,
          isActive: true,
        },
        orderBy: { assignmentStartDate: 'desc' },
      });
    } catch (error) {
      throw new Error(`Failed to get shift history: ${error.message}`);
    }
  }

  /**
   * End shift assignment
   */
  async endAssignment(tenantId, assignmentId) {
    try {
      return db.shift_assignments.update({
        where: { id: assignmentId },
        data: {
          assignmentEndDate: new Date(),
          status: 'ended',
        },
      });
    } catch (error) {
      throw new Error(`Failed to end assignment: ${error.message}`);
    }
  }

  /**
   * Calculate working hours between two times
   */
  calculateWorkingHours(startTime, endTime, breakDuration) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    const totalMinutes = endMinutes - startMinutes;
    const hours = totalMinutes / 60 - breakDuration / 60;

    return Math.round(hours * 100) / 100;
  }
}

module.exports = new ShiftService();
