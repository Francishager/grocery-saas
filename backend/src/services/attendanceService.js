/**
 * Attendance Service - Manages attendance records and tracking
 * Supports multiple check-in methods: manual, QR code, biometric
 */

const db = require('../../config/db');

class AttendanceService {
  /**
   * Record check-in for employee
   */
  async checkIn(tenantId, employeeId, method, location = null) {
    try {
      const today = new Date().toDateString();
      const checkInTime = new Date();

      // Check if already checked in today
      const existing = await db.attendance_records.findFirst({
        where: {
          tenantId,
          employeeId,
          attendanceDate: {
            gte: new Date(today),
            lt: new Date(new Date(today).getTime() + 86400000),
          },
          isActive: true,
        },
      });

      if (existing && existing.checkInTime && !existing.checkOutTime) {
        throw new Error('Employee already checked in today');
      }

      const record = await db.attendance_records.create({
        data: {
          tenantId,
          employeeId,
          attendanceDate: new Date(today),
          checkInTime,
          method,
          location,
          status: 'present',
          isActive: true,
        },
      });

      // Audit trail
      await this.createAudit(tenantId, record.id, 'SYSTEM', 'created', null, record);

      return record;
    } catch (error) {
      throw new Error(`Check-in failed: ${error.message}`);
    }
  }

  /**
   * Record check-out for employee
   */
  async checkOut(tenantId, employeeId, location = null) {
    try {
      const today = new Date().toDateString();
      const checkOutTime = new Date();

      const record = await db.attendance_records.findFirst({
        where: {
          tenantId,
          employeeId,
          attendanceDate: {
            gte: new Date(today),
            lt: new Date(new Date(today).getTime() + 86400000),
          },
          isActive: true,
        },
      });

      if (!record) {
        throw new Error('No check-in found for today');
      }

      if (record.checkOutTime) {
        throw new Error('Employee already checked out');
      }

      // Calculate duration
      const duration = (checkOutTime - record.checkInTime) / (1000 * 60 * 60); // hours

      const config = await db.attendance_configurations.findFirst({
        where: { tenantId, branchId: null },
      });

      const workingHours = config?.workingHoursPerDay || 8;
      const lateMinutes = record.checkInTime > new Date(`${today} 09:00:00`) 
        ? Math.floor((record.checkInTime - new Date(`${today} 09:00:00`)) / 60000) 
        : 0;
      const overtimeMinutes = duration > workingHours 
        ? Math.floor((duration - workingHours) * 60) 
        : 0;

      const updated = await db.attendance_records.update({
        where: { id: record.id },
        data: {
          checkOutTime,
          duration,
          lateMinutes,
          overtimeMinutes,
          location,
        },
      });

      // Audit trail
      await this.createAudit(tenantId, record.id, 'SYSTEM', 'edited', record, updated);

      return updated;
    } catch (error) {
      throw new Error(`Check-out failed: ${error.message}`);
    }
  }

  /**
   * Get attendance records with filtering and pagination
   */
  async getRecords(tenantId, filters = {}, page = 1, limit = 50) {
    try {
      const where = { tenantId, isActive: true };

      if (filters.employeeId) where.employeeId = filters.employeeId;
      if (filters.status) where.status = filters.status;
      if (filters.fromDate || filters.toDate) {
        where.attendanceDate = {};
        if (filters.fromDate) where.attendanceDate.gte = new Date(filters.fromDate);
        if (filters.toDate) where.attendanceDate.lte = new Date(filters.toDate);
      }

      const skip = (page - 1) * limit;

      const [records, total] = await Promise.all([
        db.attendance_records.findMany({
          where,
          skip,
          take: limit,
          orderBy: { attendanceDate: 'desc' },
        }),
        db.attendance_records.count({ where }),
      ]);

      return {
        records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get records: ${error.message}`);
    }
  }

  /**
   * Get monthly attendance summary for employee
   */
  async getSummary(tenantId, employeeId, year, month) {
    try {
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      // Check existing summary
      let summary = await db.attendance_summaries.findFirst({
        where: {
          tenantId,
          employeeId,
          periodStart,
        },
      });

      if (summary) return summary;

      // Calculate from records
      const records = await db.attendance_records.findMany({
        where: {
          tenantId,
          employeeId,
          attendanceDate: {
            gte: periodStart,
            lte: periodEnd,
          },
          isActive: true,
        },
      });

      const presentDays = records.filter((r) => r.status === 'present').length;
      const absentDays = records.filter((r) => r.status === 'absent').length;
      const leaveDays = records.filter((r) => r.status === 'on_leave' || r.status === 'leave').length;
      const overtimeHours = records.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0) / 60;

      // Calculate working days (Mon-Fri)
      let workingDays = 0;
      for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) workingDays++;
      }

      summary = await db.attendance_summaries.create({
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
    } catch (error) {
      throw new Error(`Failed to get summary: ${error.message}`);
    }
  }

  /**
   * Approve pending attendance record
   */
  async approveAttendance(tenantId, recordId, approvedBy) {
    try {
      const record = await db.attendance_records.findUniqueOrThrow({
        where: { id: recordId },
      });

      if (record.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      const updated = await db.attendance_records.update({
        where: { id: recordId },
        data: {
          approvedBy,
          approvedAt: new Date(),
        },
      });

      await this.createAudit(tenantId, recordId, approvedBy, 'approved', record, updated);

      return updated;
    } catch (error) {
      throw new Error(`Failed to approve: ${error.message}`);
    }
  }

  /**
   * Soft delete attendance record
   */
  async deleteRecord(tenantId, recordId) {
    try {
      const updated = await db.attendance_records.update({
        where: { id: recordId },
        data: { isActive: false },
      });

      await this.createAudit(tenantId, recordId, 'SYSTEM', 'deleted', null, updated);

      return updated;
    } catch (error) {
      throw new Error(`Failed to delete: ${error.message}`);
    }
  }

  /**
   * Create audit trail entry
   */
  async createAudit(tenantId, recordId, changedBy, changeType, oldValues, newValues) {
    try {
      await db.attendance_audits.create({
        data: {
          tenantId,
          recordId,
          changedBy,
          changeType,
          oldValues,
          newValues,
        },
      });
    } catch (error) {
      console.error('Audit trail creation failed:', error);
    }
  }

  /**
   * Get attendance stats for branch
   */
  async getAttendanceStats(tenantId, branchId, periodStart, periodEnd) {
    try {
      const records = await db.attendance_records.findMany({
        where: {
          tenantId,
          attendanceDate: {
            gte: periodStart,
            lte: periodEnd,
          },
          isActive: true,
        },
      });

      const present = records.filter((r) => r.status === 'present').length;
      const absent = records.filter((r) => r.status === 'absent').length;
      const onLeave = records.filter((r) => r.status === 'on_leave').length;
      const averageHours =
        records.reduce((sum, r) => sum + (r.duration || 0), 0) / (records.length || 1);

      return {
        totalRecords: records.length,
        present,
        absent,
        onLeave,
        averageHours: Math.round(averageHours * 100) / 100,
        attendanceRate: `${Math.round((present / (records.length || 1)) * 100)}%`,
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }
}

module.exports = new AttendanceService();
