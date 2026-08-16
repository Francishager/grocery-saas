/**
 * Leave Type Service - Manages leave types and configurations
 */

const db = require('../../config/db');

class LeaveTypeService {
  /**
   * Create leave type
   */
  async createLeaveType(tenantId, data) {
    try {
      const leaveType = await db.leave_types.create({
        data: {
          tenantId,
          name: data.name,
          code: data.code,
          description: data.description,
          daysAllowedPerYear: data.daysAllowedPerYear,
          carryoverAllowed: data.carryoverAllowed || false,
          maxCarryover: data.maxCarryover,
          requiresMedical: data.requiresMedical || false,
          requiresApproval: data.requiresApproval !== false,
          approvalLevels: data.approvalLevels || 1,
          color: data.color,
          isActive: true,
        },
      });

      return leaveType;
    } catch (error) {
      throw new Error(`Failed to create leave type: ${error.message}`);
    }
  }

  /**
   * Update leave type
   */
  async updateLeaveType(tenantId, typeId, updates) {
    try {
      const leaveType = await db.leave_types.findUniqueOrThrow({
        where: { id: typeId },
      });

      if (leaveType.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      return db.leave_types.update({
        where: { id: typeId },
        data: updates,
      });
    } catch (error) {
      throw new Error(`Failed to update leave type: ${error.message}`);
    }
  }

  /**
   * Get all leave types for tenant
   */
  async getLeaveTypes(tenantId) {
    try {
      return db.leave_types.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });
    } catch (error) {
      throw new Error(`Failed to get leave types: ${error.message}`);
    }
  }

  /**
   * Get single leave type
   */
  async getLeaveType(tenantId, typeId) {
    try {
      const leaveType = await db.leave_types.findUniqueOrThrow({
        where: { id: typeId },
      });

      if (leaveType.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      return leaveType;
    } catch (error) {
      throw new Error(`Failed to get leave type: ${error.message}`);
    }
  }

  /**
   * Deactivate leave type
   */
  async deactivateLeaveType(tenantId, typeId) {
    try {
      return this.updateLeaveType(tenantId, typeId, { isActive: false });
    } catch (error) {
      throw new Error(`Failed to deactivate leave type: ${error.message}`);
    }
  }

  /**
   * Get leave balance for employee
   */
  async getLeaveBalance(tenantId, employeeId, leaveTypeId, year) {
    try {
      let balance = await db.leave_balances.findFirst({
        where: {
          tenantId,
          employeeId,
          leaveTypeId,
          year,
        },
      });

      if (!balance) {
        // Create default balance
        const leaveType = await this.getLeaveType(tenantId, leaveTypeId);
        balance = await db.leave_balances.create({
          data: {
            tenantId,
            employeeId,
            leaveTypeId,
            leaveTypeName: leaveType.name,
            year,
            allocatedDays: leaveType.daysAllowedPerYear,
            remainingDays: leaveType.daysAllowedPerYear,
          },
        });
      }

      return balance;
    } catch (error) {
      throw new Error(`Failed to get leave balance: ${error.message}`);
    }
  }

  /**
   * Allocate leave for new year
   */
  async allocateLeaveForYear(tenantId, year) {
    try {
      const leaveTypes = await this.getLeaveTypes(tenantId);
      const employees = await db.employees.findMany({
        where: {
          tenantId,
          isActive: true,
        },
      });

      let allocated = 0;

      for (const leaveType of leaveTypes) {
        for (const employee of employees) {
          // Check if balance already exists
          const exists = await db.leave_balances.findFirst({
            where: {
              tenantId,
              employeeId: employee.id,
              leaveTypeId: leaveType.id,
              year,
            },
          });

          if (!exists) {
            await db.leave_balances.create({
              data: {
                tenantId,
                employeeId: employee.id,
                leaveTypeId: leaveType.id,
                leaveTypeName: leaveType.name,
                year,
                allocatedDays: leaveType.daysAllowedPerYear,
                remainingDays: leaveType.daysAllowedPerYear,
              },
            });
            allocated++;
          }
        }
      }

      return { allocated, total: leaveTypes.length * employees.length };
    } catch (error) {
      throw new Error(`Failed to allocate leave: ${error.message}`);
    }
  }

  /**
   * Carryover unused leave to next year
   */
  async carryoverLeaves(tenantId, fromYear, toYear) {
    try {
      const balances = await db.leave_balances.findMany({
        where: {
          tenantId,
          year: fromYear,
          leaveType: {
            carryoverAllowed: true,
          },
        },
      });

      let carried = 0;

      for (const balance of balances) {
        const carryoverAmount = Math.min(balance.remainingDays, balance.leaveType?.maxCarryover || balance.remainingDays);

        // Check if new year balance exists
        let newYearBalance = await db.leave_balances.findFirst({
          where: {
            tenantId,
            employeeId: balance.employeeId,
            leaveTypeId: balance.leaveTypeId,
            year: toYear,
          },
        });

        if (!newYearBalance) {
          const leaveType = await this.getLeaveType(tenantId, balance.leaveTypeId);
          newYearBalance = await db.leave_balances.create({
            data: {
              tenantId,
              employeeId: balance.employeeId,
              leaveTypeId: balance.leaveTypeId,
              leaveTypeName: leaveType.name,
              year: toYear,
              allocatedDays: leaveType.daysAllowedPerYear,
              carryoverDays: carryoverAmount,
              remainingDays: leaveType.daysAllowedPerYear + carryoverAmount,
            },
          });
        } else {
          newYearBalance = await db.leave_balances.update({
            where: { id: newYearBalance.id },
            data: {
              carryoverDays: carryoverAmount,
              remainingDays: newYearBalance.allocatedDays + carryoverAmount,
            },
          });
        }

        carried++;
      }

      return { carried };
    } catch (error) {
      throw new Error(`Failed to carryover leaves: ${error.message}`);
    }
  }
}

module.exports = new LeaveTypeService();
