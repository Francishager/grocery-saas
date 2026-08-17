/**
 * Attendance Routes - Phase 2 HR Module
 * Handles attendance tracking, check-in/out, and reporting
 */

import express from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import attendanceService from '../services/attendanceService.js';
import attendanceConfigService from '../services/attendanceConfigService.js';
import hrPermissionService from '../services/hrPermissionService.js';

const router = express.Router();

// Middleware
router.use(requireAuth);
router.use(requireTenant);

const requireHRPermission = (permissionCode) => async (req, res, next) => {
  const tenantId = req.tenant?.id || req.user?.tenantId || req.user?.tenant_id;
  if (await hrPermissionService.hasPermission(tenantId, req.user.id, permissionCode)) return next();
  return res.status(403).json({ success: false, message: 'Permission denied', required: permissionCode });
};

/**
 * Check-in Operations
 */

// Manual check-in
router.post('/attendance/checkin', async (req, res) => {
  try {
    const { employeeId, location } = req.body;
    const tenantId = req.tenant.id;
    const method = 'MANUAL';

    const record = await attendanceService.checkIn(tenantId, employeeId, method, location, req.user.id);
    res.json({ success: true, data: record, message: 'Check-in recorded' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// QR code check-in
router.post('/attendance/qr-checkin', async (req, res) => {
  try {
    const { employeeId, qrData, location } = req.body;
    const tenantId = req.tenant.id;

    // Validate QR data (decode employee ID from QR)
    if (!qrData) throw new Error('Invalid QR code');

    const record = await attendanceService.checkIn(tenantId, employeeId, 'QR_CODE', location, req.user.id);
    res.json({ success: true, data: record, message: 'QR check-in recorded' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Biometric check-in
router.post('/attendance/biometric-checkin', async (req, res) => {
  try {
    const { employeeId, biometricData, location } = req.body;
    const tenantId = req.tenant.id;

    if (!biometricData) throw new Error('Biometric data required');

    const record = await attendanceService.checkIn(tenantId, employeeId, 'BIOMETRIC', location, req.user.id);
    res.json({ success: true, data: record, message: 'Biometric check-in recorded' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Check-out
router.post('/attendance/checkout', async (req, res) => {
  try {
    const { employeeId, location } = req.body;
    const tenantId = req.tenant.id;

    const record = await attendanceService.checkOut(tenantId, employeeId, location, req.user.id);
    res.json({ success: true, data: record, message: 'Check-out recorded' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Attendance Record Management
 */

// Get attendance records (list with filtering)
router.get('/attendance', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId, status, fromDate, toDate, page = 1, limit = 50 } = req.query;

    const filters = { employeeId, status, fromDate, toDate };
    const result = await attendanceService.getRecords(tenantId, filters, parseInt(page), parseInt(limit));

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get single attendance record
router.get('/attendance/:id', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const record = await attendanceService.getRecords(tenantId, { recordId: id });
    if (!record || record.records.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, data: record.records[0] });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update attendance record (admin only)
router.put('/attendance/:id', requireHRPermission('ATTENDANCE_EDIT'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const record = await attendanceService.updateRecord(tenantId, id, req.body, req.user.id);
    res.json({ success: true, data: record, message: 'Attendance updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Soft-delete attendance record
router.delete('/attendance/:id', requireHRPermission('ATTENDANCE_EDIT'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;

    const record = await attendanceService.deleteRecord(tenantId, id, req.user.id);
    res.json({ success: true, data: record, message: 'Record deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Approve attendance record
router.post('/attendance/:id/approve', requireHRPermission('ATTENDANCE_APPROVE'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    const approvedBy = req.user.id;

    const record = await attendanceService.approveAttendance(tenantId, id, approvedBy);
    res.json({ success: true, data: record, message: 'Record approved' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Batch Operations
 */

// Batch import attendance
router.post('/attendance/batch-import', requireHRPermission('ATTENDANCE_IMPORT'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid records format' });
    }

    // Batch process records
    const imported = [];
    const failed = [];

    for (const record of records) {
      try {
        const result = await attendanceService.checkIn(
          tenantId,
          record.employeeId,
          record.method || 'MANUAL',
          record.location
        );
        imported.push(result);
      } catch (error) {
        failed.push({ ...record, error: error.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      failed: failed.length,
      data: { imported, failed },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Summaries & Reports
 */

// Get monthly attendance summary for employee
router.get('/attendance/summary/:employeeId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { employeeId } = req.params;
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;

    const summary = await attendanceService.getSummary(tenantId, employeeId, parseInt(year), parseInt(month));
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get attendance stats for branch
router.get('/attendance/stats/:branchId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId } = req.params;
    const { fromDate, toDate } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({ success: false, message: 'fromDate and toDate required' });
    }

    const stats = await attendanceService.getAttendanceStats(
      tenantId,
      branchId,
      new Date(fromDate),
      new Date(toDate)
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Audit Trail
 */

// Get audit history for record
router.get('/attendance/audit/:recordId', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const data = await attendanceService.getAudit(tenantId, req.params.recordId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Configuration Endpoints
 */

// Get attendance configuration
router.get('/config/attendance', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId } = req.query;

    const config = await attendanceConfigService.getConfig(tenantId, branchId || null);
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update attendance configuration
router.put('/config/attendance', requireHRPermission('ATTENDANCE_CONFIG'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId, ...updates } = req.body;

    const config = await attendanceConfigService.updateConfig(tenantId, branchId || null, updates);
    res.json({ success: true, data: config, message: 'Configuration updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Enable biometric
router.post('/config/attendance/enable-biometric', requireHRPermission('ATTENDANCE_CONFIG'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId } = req.body;

    const config = await attendanceConfigService.enableBiometric(tenantId, branchId || null);
    res.json({ success: true, data: config, message: 'Biometric enabled' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Enable QR code
router.post('/config/attendance/enable-qr', requireHRPermission('ATTENDANCE_CONFIG'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { branchId } = req.body;

    const config = await attendanceConfigService.enableQRCode(tenantId, branchId || null);
    res.json({ success: true, data: config, message: 'QR code enabled' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
