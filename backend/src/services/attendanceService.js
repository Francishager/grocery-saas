import prisma from '../db.js';

function dayRange(value = new Date()) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim();
}

function mapRecord(record) {
  return {
    ...record,
    date: record.attendanceDate,
    employeeName: employeeName(record.employee),
    isApproved: Boolean(record.approvedAt),
  };
}

class AttendanceService {
  async requireEmployee(tenantId, employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, firstName: true, lastName: true, branchId: true },
    });
    if (!employee) throw new Error('Employee not found');
    return employee;
  }

  async checkIn(tenantId, employeeId, method = 'MANUAL', location = null, changedBy = 'SYSTEM') {
    await this.requireEmployee(tenantId, employeeId);
    const { start, end } = dayRange();
    const checkInTime = new Date();

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        tenantId,
        employeeId,
        attendanceDate: { gte: start, lt: end },
        isActive: true,
      },
    });

    if (existing?.checkInTime && !existing?.checkOutTime) throw new Error('Employee already checked in today');
    if (existing?.checkInTime && existing?.checkOutTime) throw new Error('Employee attendance is already completed today');

    const record = existing
      ? await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { checkInTime, method, location, status: 'present' },
          include: { employee: { select: { firstName: true, lastName: true } } },
        })
      : await prisma.attendanceRecord.create({
          data: {
            tenantId,
            employeeId,
            attendanceDate: start,
            checkInTime,
            method,
            location,
            status: 'present',
            isActive: true,
          },
          include: { employee: { select: { firstName: true, lastName: true } } },
        });

    await this.createAudit(tenantId, record.id, changedBy, existing ? 'edited' : 'created', existing, record);
    return mapRecord(record);
  }

  async checkOut(tenantId, employeeId, location = null, changedBy = 'SYSTEM') {
    await this.requireEmployee(tenantId, employeeId);
    const { start, end } = dayRange();
    const checkOutTime = new Date();

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        tenantId,
        employeeId,
        attendanceDate: { gte: start, lt: end },
        isActive: true,
      },
    });

    if (!record?.checkInTime) throw new Error('No check-in found for today');
    if (record.checkOutTime) throw new Error('Employee already checked out');

    const duration = Math.max(0, (checkOutTime.getTime() - record.checkInTime.getTime()) / (1000 * 60 * 60));
    const config = await prisma.attendanceConfiguration.findFirst({ where: { tenantId, branchId: null, isActive: true } });
    const workingHours = Number(config?.workingHoursPerDay || 8);
    const scheduledStart = new Date(start);
    scheduledStart.setHours(9, Number(config?.lateTolerance || 0), 0, 0);
    const lateMinutes = record.checkInTime > scheduledStart ? Math.floor((record.checkInTime.getTime() - scheduledStart.getTime()) / 60000) : 0;
    const overtimeMinutes = duration > workingHours ? Math.floor((duration - workingHours) * 60) : 0;

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime,
        duration,
        lateMinutes,
        overtimeMinutes,
        location: location || record.location,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await this.createAudit(tenantId, record.id, changedBy, 'edited', record, updated);
    return mapRecord(updated);
  }

  async getRecords(tenantId, filters = {}, page = 1, limit = 50) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const currentPage = Math.max(Number(page) || 1, 1);
    const where = { tenantId, isActive: true };

    if (filters.recordId) where.id = filters.recordId;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status) where.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      where.attendanceDate = {};
      if (filters.fromDate) where.attendanceDate.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.attendanceDate.lte = to;
      }
    }

    if (filters.branchId) {
      const employees = await prisma.employee.findMany({
        where: { tenantId, branchId: filters.branchId },
        select: { id: true },
      });
      where.employeeId = { in: employees.map((employee) => employee.id) };
    }

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        skip: (currentPage - 1) * take,
        take,
        include: { employee: { select: { firstName: true, lastName: true } } },
        orderBy: { attendanceDate: 'desc' },
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    return {
      records: records.map(mapRecord),
      pagination: {
        page: currentPage,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async updateRecord(tenantId, recordId, updates, changedBy) {
    const record = await prisma.attendanceRecord.findFirst({ where: { id: recordId, tenantId, isActive: true } });
    if (!record) throw new Error('Attendance record not found');

    const checkInTime = updates.checkInTime !== undefined ? (updates.checkInTime ? new Date(updates.checkInTime) : null) : record.checkInTime;
    const checkOutTime = updates.checkOutTime !== undefined ? (updates.checkOutTime ? new Date(updates.checkOutTime) : null) : record.checkOutTime;
    const duration = checkInTime && checkOutTime ? Math.max(0, (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)) : record.duration;

    const updated = await prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.location !== undefined && { location: updates.location }),
        ...(updates.checkInTime !== undefined && { checkInTime }),
        ...(updates.checkOutTime !== undefined && { checkOutTime }),
        duration,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await this.createAudit(tenantId, recordId, changedBy, 'edited', record, updated, updates.reason);
    return mapRecord(updated);
  }

  async approveAttendance(tenantId, recordId, approvedBy) {
    const record = await prisma.attendanceRecord.findFirst({ where: { id: recordId, tenantId, isActive: true } });
    if (!record) throw new Error('Attendance record not found');

    const updated = await prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { approvedBy, approvedAt: new Date() },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await this.createAudit(tenantId, recordId, approvedBy, 'approved', record, updated);
    return mapRecord(updated);
  }

  async deleteRecord(tenantId, recordId, changedBy = 'SYSTEM') {
    const record = await prisma.attendanceRecord.findFirst({ where: { id: recordId, tenantId, isActive: true } });
    if (!record) throw new Error('Attendance record not found');

    const updated = await prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { isActive: false },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await this.createAudit(tenantId, recordId, changedBy, 'deleted', record, updated);
    return mapRecord(updated);
  }

  async getAudit(tenantId, recordId) {
    return prisma.attendanceAudit.findMany({
      where: { tenantId, recordId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async createAudit(tenantId, recordId, changedBy, changeType, oldValues, newValues, reason = null) {
    await prisma.attendanceAudit.create({
      data: {
        tenantId,
        recordId,
        changedBy: changedBy || 'SYSTEM',
        changeType,
        oldValues: oldValues || undefined,
        newValues: newValues || undefined,
        reason,
      },
    }).catch((error) => {
      console.error('Attendance audit creation failed:', error);
    });
  }

  async getSummary(tenantId, employeeId, year, month) {
    await this.requireEmployee(tenantId, employeeId);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    let summary = await prisma.attendanceSummary.findFirst({ where: { tenantId, employeeId, periodStart } });
    if (summary) return summary;

    const records = await prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        employeeId,
        attendanceDate: { gte: periodStart, lte: periodEnd },
        isActive: true,
      },
    });

    const presentDays = records.filter((record) => record.status === 'present').length;
    const absentDays = records.filter((record) => record.status === 'absent').length;
    const leaveDays = records.filter((record) => ['on_leave', 'leave'].includes(record.status)).length;
    const overtimeHours = records.reduce((sum, record) => sum + (record.overtimeMinutes || 0), 0) / 60;
    let workingDays = 0;
    for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) workingDays++;
    }

    summary = await prisma.attendanceSummary.create({
      data: {
        tenantId,
        employeeId,
        periodStart,
        periodEnd,
        presentDays,
        absentDays,
        leaveDays,
        overtimeHours,
        workingDaysInPeriod: workingDays,
      },
    });

    return summary;
  }

  async getAttendanceStats(tenantId, branchId, periodStart, periodEnd) {
    const filters = {
      fromDate: periodStart,
      toDate: periodEnd,
      ...(branchId && { branchId }),
    };
    const { records } = await this.getRecords(tenantId, filters, 1, 10000);
    const present = records.filter((record) => record.status === 'present').length;
    const absent = records.filter((record) => record.status === 'absent').length;
    const onLeave = records.filter((record) => ['on_leave', 'leave'].includes(record.status)).length;
    const averageHours = records.reduce((sum, record) => sum + (record.duration || 0), 0) / (records.length || 1);

    return {
      totalRecords: records.length,
      present,
      absent,
      onLeave,
      averageHours: Math.round(averageHours * 100) / 100,
      attendanceRate: `${Math.round((present / (records.length || 1)) * 100)}%`,
    };
  }
}

export default new AttendanceService();
