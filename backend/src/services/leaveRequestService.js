/**
 * Leave Request Service - Manages leave requests and approval workflows
 */

const db = require('../../config/db');
const leaveTypeService = require('./leaveTypeService');

class LeaveRequestService {
  /**
   * Create new leave request
   */
  async createRequest(tenantId, employeeId, data) {
    try {
      const leaveType = await leaveTypeService.getLeaveType(tenantId, data.leaveTypeId);

      if (!leaveType) {
        throw new Error('Leave type not found');
      }

      // Calculate total days
      const totalDays = this.calculateLeaveDays(data.startDate, data.endDate);

      // Check leave balance
      const year = new Date(data.startDate).getFullYear();
      const balance = await leaveTypeService.getLeaveBalance(tenantId, employeeId, data.leaveTypeId, year);

      if (balance.remainingDays < totalDays) {
        throw new Error(`Insufficient leave balance. Available: ${balance.remainingDays}, Requested: ${totalDays}`);
      }

      const request = await db.leave_requests.create({
        data: {
          tenantId,
          employeeId,
          leaveTypeId: data.leaveTypeId,
          leaveTypeName: leaveType.name,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          totalDays,
          reason: data.reason,
          contactDuringLeave: data.contactDuringLeave,
          replacementEmployeeId: data.replacementEmployeeId,
          attachments: data.attachments || [],
          status: 'draft',
        },
      });

      return request;
    } catch (error) {
      throw new Error(`Failed to create request: ${error.message}`);
    }
  }

  /**
   * Submit request for approval
   */
  async submitForApproval(tenantId, requestId, approverId) {
    try {
      const request = await db.leave_requests.findUniqueOrThrow({
        where: { id: requestId },
      });

      if (request.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (request.status !== 'draft') {
        throw new Error('Request is not in draft state');
      }

      // Get leave type to check approval levels
      const leaveType = await leaveTypeService.getLeaveType(tenantId, request.leaveTypeId);

      const newStatus = leaveType.approvalLevels === 1 ? 'pending_l1' : 'pending_l1';

      const updated = await db.leave_requests.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          approverLevel1Id: approverId, // First approver assigned when submitted
        },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to submit request: ${error.message}`);
    }
  }

  /**
   * Manager level 1 approval
   */
  async approveLevel1(tenantId, requestId, approverId, notes = '') {
    try {
      const request = await db.leave_requests.findUniqueOrThrow({
        where: { id: requestId },
      });

      if (request.tenantId !== tenantId || request.status !== 'pending_l1') {
        throw new Error('Request is not pending level 1 approval');
      }

      const leaveType = await leaveTypeService.getLeaveType(tenantId, request.leaveTypeId);
      const newStatus = leaveType.approvalLevels > 1 ? 'pending_l2' : 'approved';

      const updated = await db.leave_requests.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          approverLevel1Status: 'approved',
          approverLevel1Date: new Date(),
          approverLevel1Notes: notes,
        },
      });

      // If approved and no level 2, update balance
      if (newStatus === 'approved') {
        await this.updateBalanceOnApproval(tenantId, request);
      }

      return updated;
    } catch (error) {
      throw new Error(`Failed to approve level 1: ${error.message}`);
    }
  }

  /**
   * HR level 2 approval
   */
  async approveLevel2(tenantId, requestId, approverId, notes = '') {
    try {
      const request = await db.leave_requests.findUniqueOrThrow({
        where: { id: requestId },
      });

      if (request.tenantId !== tenantId || request.status !== 'pending_l2') {
        throw new Error('Request is not pending level 2 approval');
      }

      const updated = await db.leave_requests.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          approverLevel2Status: 'approved',
          approverLevel2Date: new Date(),
          approverLevel2Notes: notes,
          approverLevel2Id: approverId,
        },
      });

      // Update balance
      await this.updateBalanceOnApproval(tenantId, request);

      return updated;
    } catch (error) {
      throw new Error(`Failed to approve level 2: ${error.message}`);
    }
  }

  /**
   * Reject request
   */
  async rejectRequest(tenantId, requestId, approverId, reason) {
    try {
      const request = await db.leave_requests.findUniqueOrThrow({
        where: { id: requestId },
      });

      if (request.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (!['pending_l1', 'pending_l2'].includes(request.status)) {
        throw new Error('Request cannot be rejected in current state');
      }

      const isLevel1 = request.status === 'pending_l1';

      const updated = await db.leave_requests.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          [isLevel1 ? 'approverLevel1Status' : 'approverLevel2Status']: 'rejected',
          [isLevel1 ? 'approverLevel1Date' : 'approverLevel2Date']: new Date(),
          [isLevel1 ? 'approverLevel1Notes' : 'approverLevel2Notes']: reason,
        },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to reject request: ${error.message}`);
    }
  }

  /**
   * Get pending approvals for manager/HR
   */
  async getPendingApprovals(tenantId, approverId) {
    try {
      return db.leave_requests.findMany({
        where: {
          tenantId,
          OR: [
            {
              status: 'pending_l1',
              approverLevel1Id: approverId,
            },
            {
              status: 'pending_l2',
              approverLevel2Id: approverId,
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      throw new Error(`Failed to get pending approvals: ${error.message}`);
    }
  }

  /**
   * Get requests by status
   */
  async getRequestsByStatus(tenantId, status, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;

      const [requests, total] = await Promise.all([
        db.leave_requests.findMany({
          where: { tenantId, status },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        db.leave_requests.count({ where: { tenantId, status } }),
      ]);

      return { requests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    } catch (error) {
      throw new Error(`Failed to get requests: ${error.message}`);
    }
  }

  /**
   * Get requests for employee
   */
  async getEmployeeRequests(tenantId, employeeId, status = null) {
    try {
      const where = { tenantId, employeeId };
      if (status) where.status = status;

      return db.leave_requests.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Failed to get employee requests: ${error.message}`);
    }
  }

  /**
   * Cancel leave request
   */
  async cancelRequest(tenantId, requestId, reason) {
    try {
      const request = await db.leave_requests.findUniqueOrThrow({
        where: { id: requestId },
      });

      if (request.tenantId !== tenantId || request.status === 'cancelled') {
        throw new Error('Request cannot be cancelled');
      }

      return db.leave_requests.update({
        where: { id: requestId },
        data: {
          status: 'cancelled',
          approverLevel1Notes: reason,
        },
      });
    } catch (error) {
      throw new Error(`Failed to cancel request: ${error.message}`);
    }
  }

  /**
   * Check leave availability
   */
  async checkLeaveAvailability(tenantId, employeeId, leaveTypeId, totalDays) {
    try {
      const year = new Date().getFullYear();
      const balance = await leaveTypeService.getLeaveBalance(tenantId, employeeId, leaveTypeId, year);

      return {
        available: balance.remainingDays >= totalDays,
        remainingDays: balance.remainingDays,
        requestedDays: totalDays,
      };
    } catch (error) {
      throw new Error(`Failed to check availability: ${error.message}`);
    }
  }

  /**
   * Get leave summary for employee
   */
  async getLeaveSummary(tenantId, employeeId, year) {
    try {
      const balances = await db.leave_balances.findMany({
        where: {
          tenantId,
          employeeId,
          year,
        },
      });

      return {
        year,
        employeeId,
        totalAllocated: balances.reduce((sum, b) => sum + b.allocatedDays, 0),
        totalUsed: balances.reduce((sum, b) => sum + b.usedDays, 0),
        totalRemaining: balances.reduce((sum, b) => sum + b.remainingDays, 0),
        balances,
      };
    } catch (error) {
      throw new Error(`Failed to get summary: ${error.message}`);
    }
  }

  /**
   * Calculate number of leave days between two dates (excludes weekends)
   */
  calculateLeaveDays(startDate, endDate) {
    let days = 0;
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days++;
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /**
   * Update leave balance when request is approved
   */
  async updateBalanceOnApproval(tenantId, request) {
    try {
      const year = new Date(request.startDate).getFullYear();
      const balance = await leaveTypeService.getLeaveBalance(tenantId, request.employeeId, request.leaveTypeId, year);

      await db.leave_balances.update({
        where: { id: balance.id },
        data: {
          usedDays: balance.usedDays + request.totalDays,
          remainingDays: balance.allocatedDays + balance.carryoverDays - (balance.usedDays + request.totalDays),
        },
      });

      // Create history entry
      await db.leave_histories.create({
        data: {
          tenantId,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          leaveTypeName: request.leaveTypeName,
          leaveRequestId: request.id,
          startDate: request.startDate,
          endDate: request.endDate,
          totalDays: request.totalDays,
          reason: request.reason,
          createdBy: 'SYSTEM',
        },
      });
    } catch (error) {
      console.error('Failed to update balance:', error);
    }
  }
}

module.exports = new LeaveRequestService();
