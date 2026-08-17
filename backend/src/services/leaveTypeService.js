import prisma from '../db.js';

class LeaveTypeService {
  async createLeaveType(tenantId, data) {
    if (!data.name || !data.code || data.daysAllowedPerYear === undefined) {
      throw new Error('Leave type name, code, and days allowed are required');
    }

    return prisma.leaveType.create({
      data: {
        tenantId,
        name: data.name,
        code: data.code,
        description: data.description || null,
        daysAllowedPerYear: Number(data.daysAllowedPerYear),
        carryoverAllowed: Boolean(data.carryoverAllowed),
        maxCarryover: data.maxCarryover !== undefined && data.maxCarryover !== null ? Number(data.maxCarryover) : null,
        requiresMedical: Boolean(data.requiresMedical),
        requiresApproval: data.requiresApproval !== false,
        approvalLevels: Number(data.approvalLevels || 1),
        color: data.color || null,
        isActive: true,
      },
    });
  }

  async updateLeaveType(tenantId, typeId, updates) {
    await this.getLeaveType(tenantId, typeId);
    return prisma.leaveType.update({
      where: { id: typeId },
      data: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.code !== undefined && { code: updates.code }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.daysAllowedPerYear !== undefined && { daysAllowedPerYear: Number(updates.daysAllowedPerYear) }),
        ...(updates.carryoverAllowed !== undefined && { carryoverAllowed: Boolean(updates.carryoverAllowed) }),
        ...(updates.maxCarryover !== undefined && { maxCarryover: updates.maxCarryover === null ? null : Number(updates.maxCarryover) }),
        ...(updates.requiresMedical !== undefined && { requiresMedical: Boolean(updates.requiresMedical) }),
        ...(updates.requiresApproval !== undefined && { requiresApproval: Boolean(updates.requiresApproval) }),
        ...(updates.approvalLevels !== undefined && { approvalLevels: Number(updates.approvalLevels) }),
        ...(updates.color !== undefined && { color: updates.color }),
        ...(updates.isActive !== undefined && { isActive: Boolean(updates.isActive) }),
      },
    });
  }

  async getLeaveTypes(tenantId) {
    return prisma.leaveType.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getLeaveType(tenantId, typeId) {
    const leaveType = await prisma.leaveType.findFirst({ where: { id: typeId, tenantId } });
    if (!leaveType) throw new Error('Leave type not found');
    return leaveType;
  }

  async deactivateLeaveType(tenantId, typeId) {
    return this.updateLeaveType(tenantId, typeId, { isActive: false });
  }

  async getLeaveBalance(tenantId, employeeId, leaveTypeId, year) {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } });
    if (!employee) throw new Error('Employee not found');

    let balance = await prisma.leaveBalance.findFirst({ where: { tenantId, employeeId, leaveTypeId, year } });
    if (!balance) {
      const leaveType = await this.getLeaveType(tenantId, leaveTypeId);
      balance = await prisma.leaveBalance.create({
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
  }

  async allocateLeaveForYear(tenantId, year) {
    const [leaveTypes, employees] = await Promise.all([
      this.getLeaveTypes(tenantId),
      prisma.employee.findMany({ where: { tenantId, status: { notIn: ['terminated', 'inactive'] } }, select: { id: true } }),
    ]);

    let allocated = 0;
    for (const leaveType of leaveTypes) {
      for (const employee of employees) {
        const exists = await prisma.leaveBalance.findFirst({
          where: { tenantId, employeeId: employee.id, leaveTypeId: leaveType.id, year },
        });
        if (!exists) {
          await prisma.leaveBalance.create({
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
  }

  async carryoverLeaves(tenantId, fromYear, toYear) {
    const leaveTypes = await prisma.leaveType.findMany({
      where: { tenantId, carryoverAllowed: true, isActive: true },
    });
    const byId = new Map(leaveTypes.map((type) => [type.id, type]));
    const balances = await prisma.leaveBalance.findMany({
      where: { tenantId, year: fromYear, leaveTypeId: { in: leaveTypes.map((type) => type.id) } },
    });

    let carried = 0;
    for (const balance of balances) {
      const leaveType = byId.get(balance.leaveTypeId);
      const carryoverAmount = Math.min(balance.remainingDays, leaveType?.maxCarryover ?? balance.remainingDays);
      const existing = await prisma.leaveBalance.findFirst({
        where: { tenantId, employeeId: balance.employeeId, leaveTypeId: balance.leaveTypeId, year: toYear },
      });

      if (!existing) {
        await prisma.leaveBalance.create({
          data: {
            tenantId,
            employeeId: balance.employeeId,
            leaveTypeId: balance.leaveTypeId,
            leaveTypeName: balance.leaveTypeName,
            year: toYear,
            allocatedDays: leaveType?.daysAllowedPerYear || balance.allocatedDays,
            carryoverDays: carryoverAmount,
            remainingDays: (leaveType?.daysAllowedPerYear || balance.allocatedDays) + carryoverAmount,
          },
        });
      } else {
        await prisma.leaveBalance.update({
          where: { id: existing.id },
          data: {
            carryoverDays: carryoverAmount,
            remainingDays: existing.allocatedDays + carryoverAmount - existing.usedDays,
          },
        });
      }
      carried++;
    }

    return { carried };
  }
}

export default new LeaveTypeService();
