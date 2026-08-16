import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * EmploymentHistoryService - Tracks employment status changes
 */

class EmploymentHistoryService {
  /**
   * Record employment status change
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} data - Change data
   * @param {string} recordedBy - User recording change
   * @returns {Promise<object>} Created history record
   */
  async recordStatusChange(tenantId, employeeId, data, recordedBy) {
    const {
      previousStatus,
      newStatus,
      reason,
      effectiveDate = new Date(),
      notes = null,
    } = data;

    if (!previousStatus || !newStatus || !reason) {
      throw new Error('Previous status, new status, and reason are required');
    }

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const record = await prisma.employmentHistory.create({
      data: {
        tenantId,
        employeeId,
        previousStatus,
        newStatus,
        reason,
        effectiveDate: new Date(effectiveDate),
        recordedDate: new Date(),
        recordedBy,
        notes,
      },
    });

    // Update employee's current employment status
    await prisma.employee.update({
      where: { id: employeeId },
      data: { employmentStatus: newStatus },
    });

    return record;
  }

  /**
   * Get employment history for an employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} History records
   */
  async getEmploymentHistory(tenantId, employeeId, options = {}) {
    const { skip = 0, take = 50, fromDate = null, toDate = null } = options;

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const where = {
      tenantId,
      employeeId,
      ...(fromDate && { effectiveDate: { gte: new Date(fromDate) } }),
      ...(toDate && { effectiveDate: { lte: new Date(toDate) } }),
    };

    return prisma.employmentHistory.findMany({
      where,
      skip,
      take,
      orderBy: { effectiveDate: 'desc' },
    });
  }

  /**
   * Get history record by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} historyId - History record ID
   * @returns {Promise<object>} History record
   */
  async getHistoryById(tenantId, historyId) {
    const history = await prisma.employmentHistory.findFirst({
      where: {
        id: historyId,
        tenantId,
      },
      include: {
        employee: true,
      },
    });

    if (!history) {
      throw new Error('History record not found');
    }

    return history;
  }

  /**
   * Get status changes for a period
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @returns {Promise<array>} Status changes in period
   */
  async getStatusChangesBetween(tenantId, employeeId, fromDate, toDate) {
    return prisma.employmentHistory.findMany({
      where: {
        tenantId,
        employeeId,
        effectiveDate: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      },
      orderBy: { effectiveDate: 'asc' },
    });
  }

  /**
   * Get all status changes by reason
   * @param {string} tenantId - Tenant ID
   * @param {string} reason - Change reason
   * @param {object} options - Filter options
   * @returns {Promise<array>} Changes by reason
   */
  async getChangesByReason(tenantId, reason, options = {}) {
    const { skip = 0, take = 50 } = options;

    return prisma.employmentHistory.findMany({
      where: {
        tenantId,
        reason,
      },
      skip,
      take,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  /**
   * Get current status for employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Current status record
   */
  async getCurrentStatus(tenantId, employeeId) {
    const history = await prisma.employmentHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        effectiveDate: { lte: new Date() },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!history) {
      throw new Error('No employment status records found');
    }

    return history;
  }

  /**
   * Get status duration
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {string} status - Status to check
   * @returns {Promise<object>} Duration info
   */
  async getStatusDuration(tenantId, employeeId, status) {
    const records = await prisma.employmentHistory.findMany({
      where: {
        tenantId,
        employeeId,
        newStatus: status,
      },
      orderBy: { effectiveDate: 'desc' },
      take: 2,
    });

    if (records.length === 0) {
      throw new Error('No records found for this status');
    }

    const startDate = records[records.length - 1].effectiveDate;
    const endDate = records.length > 1 ? records[0].effectiveDate : new Date();

    return {
      status,
      startDate,
      endDate,
      durationDays: Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)),
    };
  }
}

export default new EmploymentHistoryService();
