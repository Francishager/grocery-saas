import prisma from '../db.js';

class ShiftSwapService {
  async requestSwap(tenantId, requesterId, targetEmployeeId, originalDate, swapDate, reason) {
    const requester = await prisma.employee.findFirst({ where: { tenantId, id: requesterId }, select: { id: true } });
    const target = await prisma.employee.findFirst({ where: { tenantId, id: targetEmployeeId }, select: { id: true } });
    if (!requester || !target) throw new Error('Both employees must exist in this tenant');

    return prisma.shiftSwap.create({
      data: {
        tenantId,
        requesterId,
        targetEmployeeId,
        originalShiftDate: new Date(originalDate),
        swapDate: new Date(swapDate),
        reason: reason || null,
        status: 'pending',
        approverIds: [],
      },
    });
  }

  async getSwap(tenantId, swapId) {
    const swap = await prisma.shiftSwap.findFirst({ where: { id: swapId, tenantId } });
    if (!swap) throw new Error('Shift swap not found');
    return swap;
  }

  async approveSwap(tenantId, swapId, approverId) {
    const swap = await this.getSwap(tenantId, swapId);
    if (swap.status !== 'pending') throw new Error('Swap is not in pending state');

    return prisma.shiftSwap.update({
      where: { id: swapId },
      data: { status: 'approved', approvedBy: approverId, approvedAt: new Date() },
    });
  }

  async rejectSwap(tenantId, swapId, approverId, reason) {
    const swap = await this.getSwap(tenantId, swapId);
    if (swap.status !== 'pending') throw new Error('Swap is not in pending state');

    return prisma.shiftSwap.update({
      where: { id: swapId },
      data: { status: 'rejected', approvedBy: approverId, approvedAt: new Date(), notes: reason || null },
    });
  }

  async executeSwap(tenantId, swapId) {
    const swap = await this.getSwap(tenantId, swapId);
    if (swap.status !== 'approved') throw new Error('Swap is not approved');

    const updated = await prisma.shiftSwap.update({
      where: { id: swapId },
      data: { status: 'executed', executedAt: new Date() },
    });

    return { success: true, swap: updated };
  }

  async getPendingSwaps(tenantId) {
    return prisma.shiftSwap.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async getEmployeeSwapHistory(tenantId, employeeId) {
    return prisma.shiftSwap.findMany({
      where: {
        tenantId,
        OR: [{ requesterId: employeeId }, { targetEmployeeId: employeeId }],
      },
      orderBy: { requestedAt: 'desc' },
    });
  }
}

export default new ShiftSwapService();
