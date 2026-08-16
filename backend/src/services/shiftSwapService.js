/**
 * Shift Swap Service - Manages shift swap requests and approvals
 */

const db = require('../../config/db');

class ShiftSwapService {
  /**
   * Request a shift swap
   */
  async requestSwap(tenantId, requesterId, targetEmployeeId, originalDate, swapDate, reason) {
    try {
      // Verify both employees exist and have shifts
      const requesterShift = await db.shift_assignments.findFirst({
        where: {
          tenantId,
          employeeId: requesterId,
          assignmentStartDate: { lte: new Date(originalDate) },
          OR: [
            { assignmentEndDate: null },
            { assignmentEndDate: { gte: new Date(originalDate) } },
          ],
          isActive: true,
        },
      });

      const targetShift = await db.shift_assignments.findFirst({
        where: {
          tenantId,
          employeeId: targetEmployeeId,
          assignmentStartDate: { lte: new Date(swapDate) },
          OR: [
            { assignmentEndDate: null },
            { assignmentEndDate: { gte: new Date(swapDate) } },
          ],
          isActive: true,
        },
      });

      if (!requesterShift || !targetShift) {
        throw new Error('One or both employees do not have shifts on those dates');
      }

      const swap = await db.shift_swaps.create({
        data: {
          tenantId,
          requesterId,
          targetEmployeeId,
          originalShiftDate: new Date(originalDate),
          swapDate: new Date(swapDate),
          reason,
          status: 'pending',
          approverIds: [], // To be assigned
        },
      });

      return swap;
    } catch (error) {
      throw new Error(`Failed to request swap: ${error.message}`);
    }
  }

  /**
   * Approve shift swap
   */
  async approveSwap(tenantId, swapId, approverId) {
    try {
      const swap = await db.shift_swaps.findUniqueOrThrow({
        where: { id: swapId },
      });

      if (swap.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (swap.status !== 'pending') {
        throw new Error('Swap is not in pending state');
      }

      const updated = await db.shift_swaps.update({
        where: { id: swapId },
        data: {
          status: 'approved',
          approvedBy: approverId,
          approvedAt: new Date(),
        },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to approve swap: ${error.message}`);
    }
  }

  /**
   * Reject shift swap
   */
  async rejectSwap(tenantId, swapId, approverId, reason) {
    try {
      const swap = await db.shift_swaps.findUniqueOrThrow({
        where: { id: swapId },
      });

      if (swap.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (swap.status !== 'pending') {
        throw new Error('Swap is not in pending state');
      }

      const updated = await db.shift_swaps.update({
        where: { id: swapId },
        data: {
          status: 'rejected',
          approvedBy: approverId,
          approvedAt: new Date(),
          notes: reason,
        },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to reject swap: ${error.message}`);
    }
  }

  /**
   * Execute approved swap (update both assignments)
   */
  async executeSwap(tenantId, swapId) {
    try {
      const swap = await db.shift_swaps.findUniqueOrThrow({
        where: { id: swapId },
      });

      if (swap.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (swap.status !== 'approved') {
        throw new Error('Swap is not approved');
      }

      // Get both assignments
      const requesterAssignment = await db.shift_assignments.findFirst({
        where: {
          tenantId,
          employeeId: swap.requesterId,
          assignmentStartDate: { lte: swap.originalShiftDate },
          OR: [
            { assignmentEndDate: null },
            { assignmentEndDate: { gte: swap.originalShiftDate } },
          ],
        },
      });

      const targetAssignment = await db.shift_assignments.findFirst({
        where: {
          tenantId,
          employeeId: swap.targetEmployeeId,
          assignmentStartDate: { lte: swap.swapDate },
          OR: [
            { assignmentEndDate: null },
            { assignmentEndDate: { gte: swap.swapDate } },
          ],
        },
      });

      // Note: In a real implementation, you might create shift swap history records
      // For now, just mark as executed

      const updated = await db.shift_swaps.update({
        where: { id: swapId },
        data: {
          status: 'executed',
          executedAt: new Date(),
        },
      });

      return {
        success: true,
        swap: updated,
        requesterAssignment,
        targetAssignment,
      };
    } catch (error) {
      throw new Error(`Failed to execute swap: ${error.message}`);
    }
  }

  /**
   * Get pending swaps for manager approval
   */
  async getPendingSwaps(tenantId, managerId) {
    try {
      return db.shift_swaps.findMany({
        where: {
          tenantId,
          status: 'pending',
        },
        orderBy: { requestedAt: 'desc' },
      });
    } catch (error) {
      throw new Error(`Failed to get pending swaps: ${error.message}`);
    }
  }

  /**
   * Get swap history for employee
   */
  async getEmployeeSwapHistory(tenantId, employeeId) {
    try {
      const swaps = await db.shift_swaps.findMany({
        where: {
          tenantId,
          OR: [
            { requesterId: employeeId },
            { targetEmployeeId: employeeId },
          ],
        },
        orderBy: { requestedAt: 'desc' },
      });

      return swaps;
    } catch (error) {
      throw new Error(`Failed to get swap history: ${error.message}`);
    }
  }
}

module.exports = new ShiftSwapService();
