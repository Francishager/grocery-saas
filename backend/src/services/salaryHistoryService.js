import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * SalaryHistoryService - Manages immutable salary history (CRITICAL - NO EDITS ALLOWED)
 * This service ONLY allows inserts, never updates or deletes
 * Each salary change creates a new immutable record
 */

class SalaryHistoryService {
  /**
   * Record a salary change (CREATE ONLY - NEVER UPDATE)
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} data - Salary data
   * @param {string} reason - Reason for change
   * @param {string} approvedBy - User approving the change
   * @returns {Promise<object>} Created salary history record
   */
  async recordSalaryChange(tenantId, employeeId, data, reason, approvedBy) {
    const {
      basicSalary,
      transportAllowance = 0,
      houseAllowance = 0,
      mobileAllowance = 0,
      otherAllowances = 0,
      paye = 0,
      socialSecurityTax = 0,
      healthInsurance = 0,
      otherDeductions = 0,
      effectiveDate = new Date(),
      notes = null,
    } = data;

    if (!basicSalary && basicSalary !== 0) {
      throw new Error('Basic salary is required');
    }

    if (!reason) {
      throw new Error('Reason for salary change is required');
    }

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Calculate totals
    const totalAllowances = transportAllowance + houseAllowance + mobileAllowance + otherAllowances;
    const grossSalary = basicSalary + totalAllowances;
    const totalDeductions = paye + socialSecurityTax + healthInsurance + otherDeductions;

    try {
      const salaryRecord = await prisma.salaryHistory.create({
        data: {
          tenantId,
          employeeId,
          basicSalary,
          transportAllowance,
          houseAllowance,
          mobileAllowance,
          otherAllowances,
          totalAllowances,
          grossSalary,
          paye,
          socialSecurityTax,
          healthInsurance,
          otherDeductions,
          totalDeductions,
          effectiveDate: new Date(effectiveDate),
          reason,
          approvedBy: approvedBy || null,
          approvedAt: approvedBy ? new Date() : null,
          notes,
        },
      });

      // Update employee's basic salary reference
      await prisma.employee.update({
        where: { id: employeeId },
        data: { basicSalary },
      });

      return salaryRecord;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Salary record already exists for employee on ${effectiveDate}. Cannot update - create new record instead.`);
      }
      throw error;
    }
  }

  /**
   * Get salary history for an employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Salary history records
   */
  async getSalaryHistory(tenantId, employeeId, options = {}) {
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

    return prisma.salaryHistory.findMany({
      where,
      skip,
      take,
      orderBy: { effectiveDate: 'desc' },
    });
  }

  /**
   * Get current salary for an employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Current salary record
   */
  async getCurrentSalary(tenantId, employeeId) {
    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    const salary = await prisma.salaryHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        effectiveDate: { lte: new Date() },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!salary) {
      throw new Error('No salary records found for this employee');
    }

    return salary;
  }

  /**
   * Get salary for specific date
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {Date} date - Date to check
   * @returns {Promise<object>} Salary record for that date
   */
  async getSalaryForDate(tenantId, employeeId, date) {
    const checkDate = new Date(date);

    const salary = await prisma.salaryHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        effectiveDate: { lte: checkDate },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!salary) {
      throw new Error(`No salary record found for employee on ${date}`);
    }

    return salary;
  }

  /**
   * Get salary records between dates
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {Date} fromDate - Start date
   * @param {Date} toDate - End date
   * @returns {Promise<array>} Salary records in period
   */
  async getSalaryRecordsBetween(tenantId, employeeId, fromDate, toDate) {
    return prisma.salaryHistory.findMany({
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
   * Count salary records for employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<number>} Record count
   */
  async getSalaryHistoryCount(tenantId, employeeId) {
    return prisma.salaryHistory.count({
      where: {
        tenantId,
        employeeId,
      },
    });
  }

  /**
   * STRICTLY FORBIDDEN: Update salary history
   * Attempting to update will throw an error
   * @throws {Error} Always throws - updates not allowed
   */
  async updateSalaryHistory() {
    throw new Error('FORBIDDEN: Salary history is immutable. Cannot update records. Create new record instead.');
  }

  /**
   * STRICTLY FORBIDDEN: Delete salary history
   * Attempting to delete will throw an error
   * @throws {Error} Always throws - deletes not allowed
   */
  async deleteSalaryHistory() {
    throw new Error('FORBIDDEN: Salary history is immutable. Cannot delete records.');
  }

  /**
   * Verify no updates occurred on salary history
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<boolean>} True if no modifications exist
   */
  async verifyIntegrity(tenantId, employeeId) {
    const records = await this.getSalaryHistory(tenantId, employeeId, { take: 1000 });
    
    // Check that updatedAt never differs from createdAt
    for (const record of records) {
      if (record.updatedAt > record.createdAt) {
        throw new Error(`Integrity violation: Salary record ${record.id} was modified after creation`);
      }
    }

    return true;
  }
}

export default new SalaryHistoryService();
