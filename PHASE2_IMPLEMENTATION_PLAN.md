# Phase 2: Workforce Management - Implementation Plan

**Status**: Ready to Implement ✅  
**Date**: August 16, 2026  
**Estimated Duration**: 2 weeks  
**Components**: 10 DB models, 36+ API endpoints, 8 frontend pages  

---

## Overview

Phase 2 adds complete workforce visibility and planning:
1. **Attendance Tracking** — Check-in/out with multiple methods (manual, QR, biometric)
2. **Shift Management** — Shift templates, assignments, and shift swapping
3. **Leave Management** — Leave types, requests, multi-level approvals, balance tracking

---

## 1. Attendance System

### Database Models (4 models, ~100 lines)

Add to `backend/prisma/schema.prisma`:

```prisma
// Attendance configuration per tenant/branch
model AttendanceConfiguration {
  id                    String         @id @default(cuid())
  tenantId              String
  branchId              String?
  workingHoursPerDay    Float          @default(8.0)    // Hours
  workWeekDays          String[]       @default(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
  overtimeStartHour     Float          @default(8.0)    // After X hours = overtime
  lateTolerance         Int            @default(0)      // Minutes before late
  earlyCheckoutAllowed  Boolean        @default(true)
  geofencingEnabled     Boolean        @default(false)
  biometricRequired     Boolean        @default(false)
  qrCodeRequired        Boolean        @default(false)
  methods               String[]       @default(["MANUAL"])  // MANUAL, QR_CODE, BIOMETRIC
  isActive              Boolean        @default(true)
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@unique([tenantId, branchId])
}

// Individual attendance record per day
model AttendanceRecord {
  id                    String         @id @default(cuid())
  tenantId              String
  employeeId            String
  attendanceDate        DateTime       // Date only, no time
  checkInTime           DateTime?      // When checked in
  checkOutTime          DateTime?      // When checked out
  duration              Float?         // Hours worked (calculated)
  lateMinutes           Int?           // How late (0 if on time)
  overtimeMinutes       Int?           // Overtime in minutes
  method                String         @default("MANUAL")  // MANUAL, QR_CODE, BIOMETRIC
  location              String?        // GPS location for geofencing
  notes                 String?        // Admin notes
  status                String         @default("present")  // present, absent, on_leave, half_day, leave
  approvedBy            String?        // UserId who approved
  approvedAt            DateTime?
  isActive              Boolean        @default(true)
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@unique([tenantId, employeeId, attendanceDate])
  @@index([tenantId, employeeId])
  @@index([attendanceDate])
}

// Monthly summary for each employee
model AttendanceSummary {
  id                    String         @id @default(cuid())
  tenantId              String
  employeeId            String
  periodStart           DateTime       // Month start
  periodEnd             DateTime       // Month end
  presentDays           Int            @default(0)
  absentDays            Int            @default(0)
  leaveDays             Int            @default(0)  // Days spent on leave
  overtimeHours         Float          @default(0)
  averageCheckInTime    String?        // HH:MM
  averageCheckOutTime   String?        // HH:MM
  workingDaysInPeriod   Int            @default(0)  // Per calendar
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@unique([tenantId, employeeId, periodStart])
  @@index([tenantId, employeeId])
}

// Audit trail for all attendance changes
model AttendanceAudit {
  id                    String         @id @default(cuid())
  tenantId              String
  recordId              String
  changedBy             String         // UserId
  changeType            String         // created, edited, approved, deleted
  oldValues             Json?
  newValues             Json?
  reason                String?
  timestamp             DateTime       @default(now())

  @@index([tenantId, recordId])
  @@index([timestamp])
}
```

### Backend Services (2 services, ~400 lines)

#### attendanceService.js
```javascript
// Key methods:
- checkIn(employeeId, method, location) → AttendanceRecord
- checkOut(employeeId, location) → AttendanceRecord  
- getRecords(filters: {employeeId, date, status}) → AttendanceRecord[]
- getSummary(employeeId, month) → AttendanceSummary
- approveAttendance(recordId, approvedBy) → AttendanceRecord
- batchImport(file) → {success, imported, failed}
- getAttendanceStats(branchId, period) → {present, absent, average_hours}
```

#### attendanceConfigService.js
```javascript
// Key methods:
- getConfig(tenantId, branchId) → AttendanceConfiguration
- updateConfig(tenantId, branchId, updates) → AttendanceConfiguration
- validateSettings(config) → {valid: boolean, errors: string[]}
- setWorkingHours(tenantId, hours) → void
- setOvertimeThreshold(tenantId, hours) → void
- enableBiometric(tenantId) → void
- enableQRCode(tenantId) → void
```

### API Routes (attendanceRoutes.js, ~200 lines)

```javascript
// Check-in/out operations
POST   /api/hr/attendance/checkin         - Manual check-in
POST   /api/hr/attendance/checkout        - Manual check-out
POST   /api/hr/attendance/qr-checkin      - QR code scan check-in
POST   /api/hr/attendance/biometric       - Biometric check-in/out

// View & Manage
GET    /api/hr/attendance                 - List records (paginated, filtered)
GET    /api/hr/attendance/:id             - Get single record
PUT    /api/hr/attendance/:id             - Edit record (admin)
DELETE /api/hr/attendance/:id             - Soft-delete (mark inactive)

// Summaries & Reports
GET    /api/hr/attendance/summary/:employeeId - Monthly summary
GET    /api/hr/attendance/summary/:employeeId/:year/:month - Specific month
POST   /api/hr/attendance/:id/approve     - Approve pending record

// Batch operations
POST   /api/hr/attendance/batch-import    - Upload attendance file

// Audit trail
GET    /api/hr/attendance/audit/:recordId - Get audit history

// Configuration
GET    /api/hr/config/attendance          - Get settings
PUT    /api/hr/config/attendance          - Update settings
```

---

## 2. Shift Management

### Database Models (3 models, ~70 lines)

```prisma
// Reusable shift template (e.g., "Morning Shift", "Night Shift")
model ShiftTemplate {
  id                    String         @id @default(cuid())
  tenantId              String
  branchId              String?
  name                  String         // "Morning Shift", "Night Shift"
  code                  String         @unique  // "MS", "NS"
  description           String?
  startTime             String         // "09:00" format
  endTime               String         // "17:00" format
  breakDuration         Int            @default(60)  // minutes
  workingHours          Float          // Calculated: (end-start) - break
  isDefault             Boolean        @default(false)
  isActive              Boolean        @default(true)
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@unique([tenantId, branchId, code])
  @@index([tenantId])
}

// Assignment of shift to employee for a period
model ShiftAssignment {
  id                    String         @id @default(cuid())
  tenantId              String
  employeeId            String
  shiftTemplateId       String
  shiftTemplateName     String         // Denormalized for quick lookup
  assignmentStartDate   DateTime       // When assignment begins
  assignmentEndDate     DateTime?      // When assignment ends (NULL = ongoing)
  rotationType          String         @default("FIXED")  // FIXED, ROTATING, TEMPORARY
  reason                String?        // Why changed shift
  approvedBy            String?        // UserId
  approvedAt            DateTime?
  status                String         @default("pending")  // pending, active, ended, on_hold
  isActive              Boolean        @default(true)
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@unique([tenantId, employeeId, assignmentStartDate])
  @@index([tenantId, employeeId])
  @@index([assignmentStartDate])
}

// Employee shift swap request workflow
model ShiftSwap {
  id                    String         @id @default(cuid())
  tenantId              String
  requesterId           String         // Who wants to swap
  targetEmployeeId      String         // Who they want to swap with
  originalShiftDate     DateTime       // Employee 1's original shift
  swapDate              DateTime       // Employee 2's shift date (what Employee 1 wants)
  reason                String?
  requestedAt           DateTime       @default(now())
  approverIds           String[]       // Manager/HR who can approve
  approvedAt            DateTime?
  approvedBy            String?
  status                String         @default("pending")  // pending, approved, rejected, executed, cancelled
  executedAt            DateTime?
  notes                 String?
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@index([tenantId, requesterId])
  @@index([status])
}
```

### Backend Services (2 services, ~350 lines)

#### shiftService.js
```javascript
// Key methods:
- createTemplate(tenantId, branchId, data) → ShiftTemplate
- updateTemplate(templateId, updates) → ShiftTemplate
- getTemplates(tenantId, branchId) → ShiftTemplate[]
- assignShift(employeeId, templateId, startDate, endDate) → ShiftAssignment
- updateAssignment(assignmentId, updates) → ShiftAssignment
- getCurrentShift(employeeId) → ShiftTemplate
- getShiftHistory(employeeId) → ShiftAssignment[]
- endAssignment(assignmentId) → ShiftAssignment
```

#### shiftSwapService.js
```javascript
// Key methods:
- requestSwap(requesterId, targetEmployeeId, dates) → ShiftSwap
- approveSwap(swapId, approverId) → ShiftSwap
- rejectSwap(swapId, approverId, reason) → ShiftSwap
- executeSwap(swapId) → {success, assignment1, assignment2}
- getPendingSwaps(managerId) → ShiftSwap[]
- getEmployeeSwapHistory(employeeId) → ShiftSwap[]
```

### API Routes (shiftRoutes.js, ~180 lines)

```javascript
// Shift template management
GET    /api/hr/shifts/templates           - List all templates
POST   /api/hr/shifts/templates           - Create template
PUT    /api/hr/shifts/templates/:id       - Update template
GET    /api/hr/shifts/templates/:id       - Get template details
DELETE /api/hr/shifts/templates/:id       - Soft-delete template

// Shift assignments
GET    /api/hr/shifts/assignments         - List assignments (filtered)
POST   /api/hr/shifts/assignments         - Assign shift to employee
PUT    /api/hr/shifts/assignments/:id     - Update assignment
GET    /api/hr/shifts/assignments/:id     - Get assignment details
DELETE /api/hr/shifts/assignments/:id     - End assignment

// Schedule views
GET    /api/hr/shifts/schedule/:employeeId/:month - Employee schedule
GET    /api/hr/shifts/schedule/:branchId/:month - Branch schedule
GET    /api/hr/shifts/current/:employeeId - Current shift details

// Shift swap workflow
POST   /api/hr/shifts/swaps                - Request swap
GET    /api/hr/shifts/swaps                - Pending swaps for approvers
POST   /api/hr/shifts/swaps/:id/approve    - Approve swap
POST   /api/hr/shifts/swaps/:id/reject     - Reject swap
GET    /api/hr/shifts/swaps/history/:employeeId - Employee swap history
```

---

## 3. Leave Management

### Database Models (4 models, ~120 lines)

```prisma
// Types of leave (Annual, Sick, Casual, etc)
model LeaveType {
  id                    String         @id @default(cuid())
  tenantId              String
  name                  String         // "Annual Leave", "Sick Leave"
  code                  String         @unique  // "AL", "SL"
  description           String?
  daysAllowedPerYear    Int            // 20 days per year
  carryoverAllowed      Boolean        @default(false)
  maxCarryover          Int?           // Max 5 days can carry to next year
  requiresMedical       Boolean        @default(false)  // Need medical cert
  requiresApproval      Boolean        @default(true)
  approvalLevels        Int            @default(1)  // 1 or 2 level approval
  color                 String?        // For calendar view
  isActive              Boolean        @default(true)
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@unique([tenantId, code])
  @@index([tenantId])
}

// Leave balance per employee per year
model LeaveBalance {
  id                    String         @id @default(cuid())
  tenantId              String
  employeeId            String
  leaveTypeId           String
  leaveTypeName         String         // Denormalized
  year                  Int            // 2024, 2025, etc
  allocatedDays         Float          // Initial allocation
  usedDays              Float          @default(0)
  approvedPendingDays   Float          @default(0)  // Approved but not yet taken
  pendingApprovalDays   Float          @default(0)  // Awaiting approval
  carryoverDays         Float          @default(0)  // From last year
  remainingDays         Float          // Calculated: allocated + carryover - used - pending
  lastUpdatedAt         DateTime       @updatedAt

  @@unique([employeeId, leaveTypeId, year])
  @@index([tenantId, employeeId])
  @@index([year])
}

// Leave request workflow
model LeaveRequest {
  id                    String         @id @default(cuid())
  tenantId              String
  employeeId            String
  leaveTypeId           String
  leaveTypeName         String         // Denormalized
  startDate             DateTime
  endDate               DateTime
  totalDays             Float          // Calculated
  reason                String
  contactDuringLeave    String?        // Phone/email
  replacementEmployeeId String?        // Who covers work
  attachments           String[]       // File URLs (medical certs, etc)

  // Level 1 Approval (Usually Manager)
  approverLevel1Id      String?
  approverLevel1Status  String?        // approved, rejected, pending
  approverLevel1Date    DateTime?
  approverLevel1Notes   String?

  // Level 2 Approval (Usually HR)
  approverLevel2Id      String?
  approverLevel2Status  String?        // approved, rejected, pending
  approverLevel2Date    DateTime?
  approverLevel2Notes   String?

  status                String         @default("draft")  // draft, pending_l1, pending_l2, approved, rejected, on_leave, completed, cancelled
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  @@index([tenantId, employeeId])
  @@index([startDate, endDate])
  @@index([status])
}

// Historical record of actual leave taken
model LeaveHistory {
  id                    String         @id @default(cuid())
  tenantId              String
  employeeId            String
  leaveTypeId           String
  leaveTypeName         String
  leaveRequestId        String?        // Link to request if from system
  startDate             DateTime
  endDate               DateTime
  totalDays             Float
  reason                String?
  manualEntry           Boolean        @default(false)
  createdBy             String         // UserId who created record
  createdAt             DateTime       @default(now())

  @@index([tenantId, employeeId])
  @@index([startDate, endDate])
}
```

### Backend Services (2 services, ~500 lines)

#### leaveTypeService.js
```javascript
// Key methods:
- createLeaveType(tenantId, data) → LeaveType
- updateLeaveType(typeId, updates) → LeaveType
- getLeaveTypes(tenantId) → LeaveType[]
- activateLeaveType(typeId) → LeaveType
- deactivateLeaveType(typeId) → LeaveType
- getLeaveBalance(employeeId, leaveTypeId, year) → LeaveBalance
- allocateLeaveForYear(tenantId, year) → {allocated: count}
- carryoverLeaves(tenantId, fromYear, toYear) → {carried: count}
```

#### leaveRequestService.js
```javascript
// Key methods:
- createRequest(employeeId, data) → LeaveRequest
- submitForApproval(requestId) → LeaveRequest
- approveLevel1(requestId, approverId, notes) → LeaveRequest
- approveLevel2(requestId, approverId, notes) → LeaveRequest
- rejectRequest(requestId, approverId, reason) → LeaveRequest
- getRequestsByStatus(tenantId, status) → LeaveRequest[]
- getPendingApprovals(approverId) → LeaveRequest[]
- getEmployeeRequests(employeeId) → LeaveRequest[]
- checkLeaveAvailability(employeeId, leaveTypeId, days) → {available: boolean}
- processApprovedLeave(requestId) → {updated: LeaveBalance}
- cancelRequest(requestId, reason) → LeaveRequest
- getLeaveSummary(employeeId, year) → summary object
- generateLeaveCalendar(branchId, month) → calendar with leaves
```

### API Routes (leaveRoutes.js, ~250 lines)

```javascript
// Leave type management (Admin)
GET    /api/hr/leave-types                 - List leave types
POST   /api/hr/leave-types                 - Create leave type
PUT    /api/hr/leave-types/:id             - Update leave type
GET    /api/hr/leave-types/:id             - Get type details
DELETE /api/hr/leave-types/:id             - Deactivate type

// Leave request workflow
GET    /api/hr/leave-requests              - List requests (filtered by status, employee)
POST   /api/hr/leave-requests              - Create new request
GET    /api/hr/leave-requests/:id          - Get request details
PUT    /api/hr/leave-requests/:id          - Edit pending request
POST   /api/hr/leave-requests/:id/submit   - Submit for approval
DELETE /api/hr/leave-requests/:id          - Cancel request

// Approval workflow (Managers/HR)
GET    /api/hr/leave-requests/pending      - Pending approvals for current user
POST   /api/hr/leave-requests/:id/approve-l1 - Manager approval
POST   /api/hr/leave-requests/:id/approve-l2 - HR approval
POST   /api/hr/leave-requests/:id/reject    - Reject request

// Leave balance & status
GET    /api/hr/leave-balance/:employeeId   - Current balance
GET    /api/hr/leave-balance/:employeeId/year/:year - Year-specific
GET    /api/hr/leave-calendar/:branchId/:month - Calendar view with leaves
GET    /api/hr/leave-summary/:employeeId   - Usage summary

// Reports
GET    /api/hr/leave-reports                - Aggregated leave usage
GET    /api/hr/leave-reports/:branchId     - Branch leave report
GET    /api/hr/leave-reports/:branchId/:month - Monthly leave usage
```

---

## Implementation Order (Recommended)

1. **Step 1**: Add all database models to `schema.prisma`
   - Paste all 10 models at end of Attendance, Shift, Leave sections
   - Run `npm run db:format` to format schema
   - Validate with `npm run db:validate`

2. **Step 2**: Create 6 backend services
   - `attendanceService.js`
   - `attendanceConfigService.js`
   - `shiftService.js`
   - `shiftSwapService.js`
   - `leaveTypeService.js`
   - `leaveRequestService.js`

3. **Step 3**: Create 3 route files
   - `attendanceRoutes.js`
   - `shiftRoutes.js`
   - `leaveRoutes.js`

4. **Step 4**: Register routes in `app.js`
   ```javascript
   app.use('/api/hr', require('./src/routes/attendanceRoutes'));
   app.use('/api/hr', require('./src/routes/shiftRoutes'));
   app.use('/api/hr', require('./src/routes/leaveRoutes'));
   ```

5. **Step 5**: Create frontend components & pages
   - `HRTable` enhancements for list views
   - New pages for each module (8 pages total)

6. **Step 6**: Add Phase 2 routes to `App.tsx`

7. **Step 7**: Database migration
   ```bash
   npm run db:push
   ```

---

## Frontend Pages (8 pages, ~100 lines each)

```
src/pages/hr/
├── AttendanceListPage.tsx         - View all attendance records
├── AttendanceCheckPage.tsx        - Manual check-in/out
├── AttendanceSummaryPage.tsx      - Monthly summary & reports
├── ShiftTemplatePage.tsx          - Create/manage shift templates
├── ShiftAssignmentPage.tsx        - Assign shifts to employees
├── ShiftSchedulePage.tsx          - Visual schedule calendar
├── LeaveRequestPage.tsx           - Create/view leave requests
├── LeaveApprovalPage.tsx          - Manager/HR approval queue
```

---

## Testing Scenarios

### Attendance Testing
- [ ] Manual check-in captures time
- [ ] Auto-calculate late minutes if after 9 AM
- [ ] Auto-calculate overtime after 8 hours
- [ ] QR code check-in registers
- [ ] Biometric device integration
- [ ] Monthly summary calculates correctly
- [ ] Batch import handles multiple records
- [ ] Approver can modify records

### Shift Testing
- [ ] Create shift template
- [ ] Assign shift to employee
- [ ] Current shift displays correctly
- [ ] Shift history shows all assignments
- [ ] Shift swap requested by employee
- [ ] Manager approves/rejects swap
- [ ] Calendar shows all shifts

### Leave Testing
- [ ] Leave type created with correct days
- [ ] Employee balance allocated
- [ ] Carryover calculated
- [ ] Leave request submitted
- [ ] Manager approval workflow
- [ ] HR approval workflow
- [ ] Balance updated after approval
- [ ] Cannot exceed balance
- [ ] Requires medical cert if configured
- [ ] Calendar shows leave dates

---

## Success Criteria

✅ All 10 database models created  
✅ 6 backend services fully functional  
✅ 36+ API endpoints working  
✅ 8 frontend pages integrated  
✅ Multi-tenant isolation verified  
✅ Approval workflows tested  
✅ All services syntax-validated  
✅ TypeScript compilation clean  

---

## Next: Phase 2 Implementation

Ready to start building! Shall we begin with:
1. Database models → Services → Routes → Frontend (recommended)
2. Or any specific module first (Attendance/Shift/Leave)?
