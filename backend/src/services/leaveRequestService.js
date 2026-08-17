import prisma from '../db.js';
import leaveTypeService from './leaveTypeService.js';

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim();
}

function mapRequest(request) {
  return {
    ...request,
    employeeName: employeeName(request.employee),
    approvalNotes: request.approverLevel2Notes || request.approverLevel1Notes || '',
    approverLevel: request.status === 'pending_l2' ? 'level_2' : request.status === 'pending_l1' ? 'level_1' : '',
  };
}

class LeaveRequestService {
  async createRequest(tenantId, employeeId, data) {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } });
    if (!employee) throw new Error('Employee not found');

    const leaveType = await leaveTypeService.getLeaveType(tenantId, data.leaveTypeId);
    const totalDays = this.calculateLeaveDays(data.startDate, data.endDate);
    if (totalDays <= 0) throw new Error('Leave dates must include at least one working day');

    const year = new Date(data.startDate).getFullYear();
    const balance = await leaveTypeService.getLeaveBalance(tenantId, employeeId, data.leaveTypeId, year);
    if (balance.remainingDays < totalDays) {
      throw new Error(`Insufficient leave balance. Available: ${balance.remainingDays}, Requested: ${totalDays}`);
    }

    const request = await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId,
        leaveTypeId: data.leaveTypeId,
        leaveTypeName: leaveType.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        totalDays,
        reason: data.reason || '',
        contactDuringLeave: data.contactDuringLeave || null,
        replacementEmployeeId: data.replacementEmployeeId || null,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        status: 'draft',
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    return mapRequest(request);
  }

  async getRequest(tenantId, requestId) {
    const request = await prisma.leaveRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    if (!request) throw new Error('Leave request not found');
    return mapRequest(request);
  }

  async updateRequest(tenantId, requestId, updates) {
    const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request) throw new Error('Leave request not found');
    if (!['draft', 'pending_l1'].includes(request.status)) throw new Error('Only draft or pending requests can be updated');

    let totalDays = request.totalDays;
    const startDate = updates.startDate ? new Date(updates.startDate) : request.startDate;
    const endDate = updates.endDate ? new Date(updates.endDate) : request.endDate;
    if (updates.startDate || updates.endDate) {
      totalDays = this.calculateLeaveDays(startDate, endDate);
      if (totalDays <= 0) throw new Error('Leave dates must include at least one working day');
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        ...(updates.leaveTypeId !== undefined && { leaveTypeId: updates.leaveTypeId }),
        ...(updates.leaveTypeName !== undefined && { leaveTypeName: updates.leaveTypeName }),
        ...(updates.startDate !== undefined && { startDate }),
        ...(updates.endDate !== undefined && { endDate }),
        ...(updates.startDate !== undefined || updates.endDate !== undefined ? { totalDays } : {}),
        ...(updates.reason !== undefined && { reason: updates.reason || '' }),
        ...(updates.contactDuringLeave !== undefined && { contactDuringLeave: updates.contactDuringLeave }),
        ...(updates.replacementEmployeeId !== undefined && { replacementEmployeeId: updates.replacementEmployeeId || null }),
        ...(updates.attachments !== undefined && { attachments: Array.isArray(updates.attachments) ? updates.attachments : [] }),
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    return mapRequest(updated);
  }

  async submitForApproval(tenantId, requestId, approverId) {
    const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request) throw new Error('Leave request not found');
    if (request.status !== 'draft') throw new Error('Request is not in draft state');

    const updated = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'pending_l1',
        approverLevel1Id: approverId,
        approverLevel1Status: 'pending',
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    return mapRequest(updated);
  }

  async approveLevel1(tenantId, requestId, approverId, notes = '') {
    const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request || request.status !== 'pending_l1') throw new Error('Request is not pending level 1 approval');

    const leaveType = await leaveTypeService.getLeaveType(tenantId, request.leaveTypeId);
    const newStatus = leaveType.approvalLevels > 1 ? 'pending_l2' : 'approved';

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          approverLevel1Id: approverId,
          approverLevel1Status: 'approved',
          approverLevel1Date: new Date(),
          approverLevel1Notes: notes,
          ...(newStatus === 'pending_l2' && { approverLevel2Status: 'pending' }),
        },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      if (newStatus === 'approved') await this.updateBalanceOnApproval(tx, tenantId, request, approverId);
      return saved;
    });

    return mapRequest(updated);
  }

  async approveLevel2(tenantId, requestId, approverId, notes = '') {
    const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request || request.status !== 'pending_l2') throw new Error('Request is not pending level 2 approval');

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          approverLevel2Id: approverId,
          approverLevel2Status: 'approved',
          approverLevel2Date: new Date(),
          approverLevel2Notes: notes,
        },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      await this.updateBalanceOnApproval(tx, tenantId, request, approverId);
      return saved;
    });

    return mapRequest(updated);
  }

  async rejectRequest(tenantId, requestId, approverId, reason) {
    const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request) throw new Error('Leave request not found');
    if (!['pending_l1', 'pending_l2'].includes(request.status)) throw new Error('Request cannot be rejected in current state');

    const isLevel1 = request.status === 'pending_l1';
    const updated = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        ...(isLevel1
          ? { approverLevel1Id: approverId, approverLevel1Status: 'rejected', approverLevel1Date: new Date(), approverLevel1Notes: reason || '' }
          : { approverLevel2Id: approverId, approverLevel2Status: 'rejected', approverLevel2Date: new Date(), approverLevel2Notes: reason || '' }),
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    return mapRequest(updated);
  }

  async getPendingApprovals(tenantId) {
    const requests = await prisma.leaveRequest.findMany({
      where: { tenantId, status: { in: ['pending_l1', 'pending_l2'] } },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map(mapRequest);
  }

  async getRequestsByStatus(tenantId, status, page = 1, limit = 50) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const currentPage = Math.max(Number(page) || 1, 1);
    const where = { tenantId, ...(status ? { status } : {}) };

    const [requests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip: (currentPage - 1) * take,
        take,
        include: { employee: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return {
      requests: requests.map(mapRequest),
      pagination: { page: currentPage, limit: take, total, totalPages: Math.ceil(total / take) },
    };
  }

  async getEmployeeRequests(tenantId, employeeId, status = null) {
    const where = { tenantId, employeeId, ...(status && { status }) };
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map(mapRequest);
  }

  async cancelRequest(tenantId, requestId, reason) {
    const request = await prisma.leaveRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!request || request.status === 'cancelled') throw new Error('Request cannot be cancelled');

    const updated = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'cancelled', approverLevel1Notes: reason || null },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    return mapRequest(updated);
  }

  async checkLeaveAvailability(tenantId, employeeId, leaveTypeId, totalDays) {
    const year = new Date().getFullYear();
    const balance = await leaveTypeService.getLeaveBalance(tenantId, employeeId, leaveTypeId, year);
    return {
      available: balance.remainingDays >= totalDays,
      remainingDays: balance.remainingDays,
      requestedDays: totalDays,
    };
  }

  async getLeaveSummary(tenantId, employeeId, year) {
    const balances = await prisma.leaveBalance.findMany({
      where: { tenantId, employeeId, year },
      orderBy: { leaveTypeName: 'asc' },
    });

    return {
      year,
      employeeId,
      totalAllocated: balances.reduce((sum, balance) => sum + balance.allocatedDays, 0),
      totalUsed: balances.reduce((sum, balance) => sum + balance.usedDays, 0),
      totalRemaining: balances.reduce((sum, balance) => sum + balance.remainingDays, 0),
      balances: balances.map((balance) => ({
        ...balance,
        allowedDays: balance.allocatedDays,
        availableDays: balance.remainingDays,
      })),
    };
  }

  calculateLeaveDays(startDate, endDate) {
    let days = 0;
    const current = new Date(startDate);
    const end = new Date(endDate);
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) days++;
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  async updateBalanceOnApproval(tx, tenantId, request, userId) {
    const year = new Date(request.startDate).getFullYear();
    const balance = await leaveTypeService.getLeaveBalance(tenantId, request.employeeId, request.leaveTypeId, year);
    if (balance.usedDays + request.totalDays > balance.allocatedDays + balance.carryoverDays) {
      throw new Error('Approved leave would exceed available balance');
    }

    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        usedDays: balance.usedDays + request.totalDays,
        remainingDays: balance.allocatedDays + balance.carryoverDays - (balance.usedDays + request.totalDays),
      },
    });

    await tx.leaveHistory.create({
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
        createdBy: userId || 'SYSTEM',
      },
    });
  }
}

export default new LeaveRequestService();
