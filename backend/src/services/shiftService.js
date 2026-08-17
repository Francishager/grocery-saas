import prisma from '../db.js';

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim();
}

function mapAssignment(assignment) {
  return {
    ...assignment,
    employeeName: employeeName(assignment.employee),
    shiftName: assignment.shiftTemplateName,
    startDate: assignment.assignmentStartDate,
    endDate: assignment.assignmentEndDate,
  };
}

class ShiftService {
  async createTemplate(tenantId, branchId, data) {
    if (!data.name || !data.code || !data.startTime || !data.endTime) {
      throw new Error('Name, code, start time, and end time are required');
    }

    return prisma.shiftTemplate.create({
      data: {
        tenantId,
        branchId,
        name: data.name,
        code: data.code,
        description: data.description || null,
        startTime: data.startTime,
        endTime: data.endTime,
        breakDuration: Number(data.breakDuration || 0),
        workingHours: this.calculateWorkingHours(data.startTime, data.endTime, Number(data.breakDuration || 0)),
        isDefault: Boolean(data.isDefault),
        isActive: true,
      },
    });
  }

  async getTemplate(tenantId, templateId) {
    const template = await prisma.shiftTemplate.findFirst({ where: { id: templateId, tenantId } });
    if (!template) throw new Error('Shift template not found');
    return template;
  }

  async updateTemplate(tenantId, templateId, updates) {
    const template = await this.getTemplate(tenantId, templateId);
    const startTime = updates.startTime || template.startTime;
    const endTime = updates.endTime || template.endTime;
    const breakDuration = updates.breakDuration !== undefined ? Number(updates.breakDuration) : template.breakDuration;

    return prisma.shiftTemplate.update({
      where: { id: templateId },
      data: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.code !== undefined && { code: updates.code }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.startTime !== undefined && { startTime }),
        ...(updates.endTime !== undefined && { endTime }),
        ...(updates.breakDuration !== undefined && { breakDuration }),
        ...(updates.isDefault !== undefined && { isDefault: Boolean(updates.isDefault) }),
        ...(updates.isActive !== undefined && { isActive: Boolean(updates.isActive) }),
        workingHours: this.calculateWorkingHours(startTime, endTime, breakDuration),
      },
    });
  }

  async deleteTemplate(tenantId, templateId) {
    await this.getTemplate(tenantId, templateId);
    return prisma.shiftTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
  }

  async getTemplates(tenantId, branchId = null) {
    return prisma.shiftTemplate.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async getAssignments(tenantId, filters = {}, page = 1, limit = 50) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const currentPage = Math.max(Number(page) || 1, 1);
    const where = {
      tenantId,
      isActive: true,
      ...(filters.employeeId && { employeeId: filters.employeeId }),
      ...(filters.status && { status: filters.status }),
    };

    const [assignments, total] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where,
        skip: (currentPage - 1) * take,
        take,
        orderBy: { assignmentStartDate: 'desc' },
      }),
      prisma.shiftAssignment.count({ where }),
    ]);

    const employeeIds = [...new Set(assignments.map((assignment) => assignment.employeeId))];
    const employees = await prisma.employee.findMany({
      where: { tenantId, id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(employees.map((employee) => [employee.id, employee]));

    return {
      data: assignments.map((assignment) => mapAssignment({ ...assignment, employee: byId.get(assignment.employeeId) })),
      pagination: { page: currentPage, limit: take, total, totalPages: Math.ceil(total / take) },
    };
  }

  async assignShift(tenantId, employeeId, templateId, startDate, endDate = null, data = {}) {
    const [employee, template] = await Promise.all([
      prisma.employee.findFirst({ where: { id: employeeId, tenantId }, select: { id: true } }),
      this.getTemplate(tenantId, templateId),
    ]);
    if (!employee) throw new Error('Employee not found');

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    const existing = await prisma.shiftAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isActive: true,
        assignmentStartDate: { lte: end || start },
        OR: [{ assignmentEndDate: null }, { assignmentEndDate: { gte: start } }],
      },
    });
    if (existing) throw new Error('Overlapping shift assignment exists');

    return prisma.shiftAssignment.create({
      data: {
        tenantId,
        employeeId,
        shiftTemplateId: template.id,
        shiftTemplateName: template.name,
        assignmentStartDate: start,
        assignmentEndDate: end,
        rotationType: data.rotationType || 'FIXED',
        reason: data.reason || null,
        approvedBy: data.approvedBy || null,
        approvedAt: data.approvedBy ? new Date() : null,
        status: data.status || 'active',
        isActive: true,
      },
    });
  }

  async getAssignment(tenantId, assignmentId) {
    const assignment = await prisma.shiftAssignment.findFirst({ where: { id: assignmentId, tenantId, isActive: true } });
    if (!assignment) throw new Error('Shift assignment not found');
    const employee = await prisma.employee.findFirst({
      where: { tenantId, id: assignment.employeeId },
      select: { firstName: true, lastName: true },
    });
    return mapAssignment({ ...assignment, employee });
  }

  async updateAssignment(tenantId, assignmentId, updates) {
    await this.getAssignment(tenantId, assignmentId);
    return prisma.shiftAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.rotationType !== undefined && { rotationType: updates.rotationType }),
        ...(updates.reason !== undefined && { reason: updates.reason }),
        ...(updates.assignmentStartDate !== undefined || updates.startDate !== undefined ? { assignmentStartDate: new Date(updates.assignmentStartDate || updates.startDate) } : {}),
        ...(updates.assignmentEndDate !== undefined || updates.endDate !== undefined ? { assignmentEndDate: updates.assignmentEndDate || updates.endDate ? new Date(updates.assignmentEndDate || updates.endDate) : null } : {}),
        ...(updates.approvedBy !== undefined && { approvedBy: updates.approvedBy, approvedAt: updates.approvedBy ? new Date() : null }),
      },
    });
  }

  async getCurrentShift(tenantId, employeeId) {
    const today = new Date();
    const assignment = await prisma.shiftAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        assignmentStartDate: { lte: today },
        OR: [{ assignmentEndDate: null }, { assignmentEndDate: { gte: today } }],
        isActive: true,
        status: 'active',
      },
      orderBy: { assignmentStartDate: 'desc' },
    });
    if (!assignment) return null;
    const template = await prisma.shiftTemplate.findFirst({ where: { id: assignment.shiftTemplateId, tenantId } });
    return { assignment, template };
  }

  async getShiftHistory(tenantId, employeeId) {
    return prisma.shiftAssignment.findMany({
      where: { tenantId, employeeId, isActive: true },
      orderBy: { assignmentStartDate: 'desc' },
    });
  }

  async endAssignment(tenantId, assignmentId) {
    await this.getAssignment(tenantId, assignmentId);
    return prisma.shiftAssignment.update({
      where: { id: assignmentId },
      data: {
        assignmentEndDate: new Date(),
        status: 'ended',
        isActive: false,
      },
    });
  }

  calculateWorkingHours(startTime, endTime, breakDuration = 0) {
    const [startHour, startMin] = String(startTime).split(':').map(Number);
    const [endHour, endMin] = String(endTime).split(':').map(Number);
    if (![startHour, startMin, endHour, endMin].every(Number.isFinite)) return 0;
    const startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    const hours = (endMinutes - startMinutes - Number(breakDuration || 0)) / 60;
    return Math.max(0, Math.round(hours * 100) / 100);
  }
}

export default new ShiftService();
