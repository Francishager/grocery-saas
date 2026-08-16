# HR Management System - Phases 2-5 Implementation Roadmap

**Status**: Planning Complete ✅  
**Date**: August 16, 2026  
**Scope**: Full HR Management Suite (Phases 2-5)  
**Architecture**: Node.js + Express, React + TypeScript, Prisma ORM, PostgreSQL  

---

## 📋 Executive Summary

Build upon Phase 1 (HR Core) to create a complete HR management suite supporting:
- **Phase 2**: Workforce Management (Attendance, Shifts, Leave)
- **Phase 3**: Payroll & Financial Management (Salary, Loans, Advances)
- **Phase 4**: Performance & Development (Reviews, Training)
- **Phase 5**: Exit & Compliance (Terminations, Reports)

**Total Scope**: ~50+ new database models, ~150+ API endpoints, ~20+ frontend pages

---

## Phase 2: Workforce Management

### Overview
Complete workforce visibility and planning system with real-time attendance, flexible shift management, and leave workflows.

### 2.1 Attendance Tracking

#### Database Models (4 models)
```prisma
model AttendanceConfiguration {
  id                    String
  tenantId              String
  branchId              String?
  workingHoursPerDay    Float          // 8.0 hours default
  workWeekDays          String[]       // ["Monday", "Tuesday", ...]
  overtimeStartHour     Float          // 8.0 default
  lateTolerance         Int            // minutes
  earlyCheckoutAllowed  Boolean
  geofencingEnabled     Boolean
  biometricRequired     Boolean
  qrCodeRequired        Boolean
  methods               String[]       // ["MANUAL", "QR_CODE", "BIOMETRIC"]
  createdAt             DateTime
  updatedAt             DateTime
}

model AttendanceRecord {
  id                    String
  tenantId              String
  employeeId            String
  attendanceDate        DateTime       // Date only
  checkInTime           DateTime?      // With time
  checkOutTime          DateTime?
  duration              Float?         // hours worked
  lateMinutes           Int?
  overtimeMinutes       Int?
  method                String         // MANUAL, QR_CODE, BIOMETRIC
  location              String?        // Geolocation
  notes                 String?
  status                String         // present, absent, on_leave, half_day
  approvedBy            String?        // EmployeeId of approver
  approvedAt            DateTime?
  isActive              Boolean        @default(true)
  createdAt             DateTime
  updatedAt             DateTime
}

model AttendanceSummary {
  id                    String
  tenantId              String
  employeeId            String
  periodStart           DateTime       // Month start
  periodEnd             DateTime       // Month end
  presentDays           Int
  absentDays            Int
  leaveHours            Float
  overtimeHours         Float
  latestStatus          String         // Calculated
  createdAt             DateTime
  updatedAt             DateTime
}

model AttendanceAudit {
  id                    String
  tenantId              String
  recordId              String
  changedBy             String         // UserId
  changeType            String         // created, edited, approved, deleted
  oldValues             Json?
  newValues             Json?
  reason                String?
  timestamp             DateTime
}
```

#### Services (2 services)
- **attendanceService.js**
  - Checkout time calculation
  - Late/overtime minute calculation
  - Batch checkin/checkout
  - Query attendance records
  - Attendance summary generation
  - Geolocation validation
  - Method-specific processing (manual, QR, biometric)

- **attendanceConfigService.js**
  - Get/update configuration
  - Validate settings
  - Manage working hours
  - Branch-specific configs
  - Configuration reset

#### API Routes
```
GET    /api/hr/attendance                    - List records (filtered)
POST   /api/hr/attendance/checkin            - Manual check-in
POST   /api/hr/attendance/checkout           - Manual check-out
POST   /api/hr/attendance/qr-checkin         - QR code check-in
POST   /api/hr/attendance/biometric-checkin  - Biometric check-in
POST   /api/hr/attendance/batch-import       - Batch attendance upload
GET    /api/hr/attendance/:id                - Get record details
PUT    /api/hr/attendance/:id                - Edit record
POST   /api/hr/attendance/:id/approve        - Approve attendance
DELETE /api/hr/attendance/:id                - Soft-delete record
GET    /api/hr/attendance/summary/:employeeId - Monthly summary
GET    /api/hr/attendance/audit/:recordId    - Audit trail
GET    /api/hr/config/attendance             - Get configuration
PUT    /api/hr/config/attendance             - Update configuration
```

---

### 2.2 Shift Management

#### Database Models (3 models)
```prisma
model ShiftTemplate {
  id                    String
  tenantId              String
  branchId              String?
  name                  String         // Day Shift, Night Shift
  code                  String         @unique
  description           String?
  startTime             String         // HH:MM format
  endTime               String
  breakDuration         Int            // minutes
  workingHours          Float
  isDefault             Boolean
  isActive              Boolean        @default(true)
  createdAt             DateTime
  updatedAt             DateTime
}

model ShiftAssignment {
  id                    String
  tenantId              String
  employeeId            String
  shiftTemplateId       String
  assignmentDate        DateTime
  startDate             DateTime       // When assignment begins
  endDate               DateTime?      // When assignment ends (NULL = ongoing)
  rotationType          String         // FIXED, ROTATING, TEMPORARY
  reason                String?
  approvedBy            String?
  approvedAt            DateTime?
  status                String         // active, pending, ended, on_hold
  isActive              Boolean        @default(true)
  createdAt             DateTime
  updatedAt             DateTime
}

model ShiftSwap {
  id                    String
  tenantId              String
  requesterId           String         // Employee requesting swap
  approverIds           String[]       // Managers/HR
  targetEmployeeId      String         // Employee to swap with
  originalShiftDate     DateTime
  swapDate              DateTime       // Requested swap date
  reason                String?
  requestedAt           DateTime
  approvedAt            DateTime?
  approvedBy            String?        // Who approved
  status                String         // pending, approved, rejected, executed
  createdAt             DateTime
  updatedAt             DateTime
}
```

#### Services (2 services)
- **shiftService.js**
  - Create/update shift templates
  - Assign shifts to employees
  - Get employee current shift
  - Query shift history
  - Shift swap workflows

- **shiftScheduleService.js**
  - Generate rotating schedules
  - Check shift availability
  - Conflict detection
  - Bulk shift assignment

#### API Routes
```
GET    /api/hr/shifts/templates              - List shift templates
POST   /api/hr/shifts/templates              - Create template
PUT    /api/hr/shifts/templates/:id          - Update template
GET    /api/hr/shifts/templates/:id          - Get template details
DELETE /api/hr/shifts/templates/:id          - Soft-delete template

GET    /api/hr/shifts/assignments            - List assignments (filtered)
POST   /api/hr/shifts/assignments            - Assign shift to employee
PUT    /api/hr/shifts/assignments/:id        - Update assignment
GET    /api/hr/shifts/assignments/:id        - Get assignment details
DELETE /api/hr/shifts/assignments/:id        - End assignment

GET    /api/hr/shifts/schedule/:employeeId   - Employee schedule
GET    /api/hr/shifts/schedule/:branchId     - Branch schedule

POST   /api/hr/shifts/swaps                  - Request shift swap
GET    /api/hr/shifts/swaps                  - Pending swaps
POST   /api/hr/shifts/swaps/:id/approve      - Approve swap
POST   /api/hr/shifts/swaps/:id/reject       - Reject swap
```

---

### 2.3 Leave Management

#### Database Models (4 models)
```prisma
model LeaveType {
  id                    String
  tenantId              String
  name                  String         // Annual, Sick, Casual
  code                  String         @unique
  description           String?
  daysAllowedPerYear    Int
  carryoverAllowed      Boolean        // Can carry unused to next year
  maxCarryover          Int?           // Max carryover days
  requiresMedical       Boolean        // Medical cert required
  requiresApproval      Boolean        @default(true)
  approvalLevels        Int            @default(1)  // 1 or 2 level approval
  isActive              Boolean        @default(true)
  createdAt             DateTime
  updatedAt             DateTime
}

model LeaveBalance {
  id                    String
  tenantId              String
  employeeId            String
  leaveTypeId           String
  year                  Int            // 2024, 2025, etc
  allocatedDays         Float
  usedDays              Float
  approvedPendingDays   Float
  pendingApprovalDays   Float
  carryoverDays         Float
  remainingDays         Float          // Calculated field
  updatedAt             DateTime
  
  @@unique([employeeId, leaveTypeId, year])
}

model LeaveRequest {
  id                    String
  tenantId              String
  employeeId            String
  leaveTypeId           String
  startDate             DateTime
  endDate               DateTime
  totalDays             Float
  reason                String?
  contactDuringLeave    String?        // Phone/email for contact
  replacementEmployeeId String?        // Who will cover work
  
  // Approval workflow
  approverLevel1Id      String?        // Manager
  approverLevel1Status  String?        // approved, rejected, pending
  approverLevel1Date    DateTime?
  approverLevel1Notes   String?
  
  approverLevel2Id      String?        // HR/Head
  approverLevel2Status  String?        // approved, rejected, pending
  approverLevel2Date    DateTime?
  approverLevel2Notes   String?
  
  attachments           String[]       // URLs to medical certs etc
  status                String         // draft, pending_l1, pending_l2, approved, rejected, on_leave, completed, cancelled
  
  createdAt             DateTime
  updatedAt             DateTime
}

model LeaveHistory {
  id                    String
  tenantId              String
  employeeId            String
  leaveTypeId           String
  leaveRequestId        String?        // Link to request if from system
  startDate             DateTime
  endDate               DateTime
  totalDays             Float
  reason                String?
  manualEntry           Boolean        // If entered manually
  createdBy             String         // UserId
  createdAt             DateTime
}
```

#### Services (2 services)
- **leaveTypeService.js**
  - Create/update leave types
  - Get leave type details
  - Activate/deactivate types
  - List leave types by tenant

- **leaveRequestService.js**
  - Create leave request
  - Multi-level approval workflow
  - Get leave balance for employee
  - Process approved leaves
  - Cancel leave requests
  - Generate leave reports
  - Check leave quota per year

#### API Routes
```
GET    /api/hr/leave-types                   - List leave types
POST   /api/hr/leave-types                   - Create leave type
PUT    /api/hr/leave-types/:id               - Update leave type
GET    /api/hr/leave-types/:id               - Get type details
DELETE /api/hr/leave-types/:id               - Deactivate type

GET    /api/hr/leave-requests                - List requests (filtered)
POST   /api/hr/leave-requests                - Create new request
GET    /api/hr/leave-requests/:id            - Get request details
PUT    /api/hr/leave-requests/:id            - Update pending request
POST   /api/hr/leave-requests/:id/approve    - Manager approval
POST   /api/hr/leave-requests/:id/hr-approve - HR approval
POST   /api/hr/leave-requests/:id/reject     - Reject request
DELETE /api/hr/leave-requests/:id            - Cancel request

GET    /api/hr/leave-balance/:employeeId    - Employee leave balance
GET    /api/hr/leave-balance/:employeeId/year/:year - Annual balance
GET    /api/hr/leave-calendar/:branchId      - Branch leave calendar
GET    /api/hr/leave-reports                 - Leave usage reports
```

---

## Phase 3: Payroll & Financial Management

### Overview
**Note**: Phase 3 core models already documented in `hr-payroll-implementation.md`. This section focuses on complementary features.

### 3.1 Salary Components (New)

#### Database Models (3 models)
```prisma
model SalaryComponent {
  id                    String
  tenantId              String
  name                  String         // Basic, HRA, Bonus
  code                  String         @unique
  type                  String         // EARNING, DEDUCTION, TAX
  category              String         // FIXED, VARIABLE, CONDITIONAL
  calculationMethod     String         // PERCENTAGE, FIXED, FORMULA
  value                 Float          // Default value
  formula               String?        // Custom calculation formula
  order                 Int            // For rendering order
  isActive              Boolean        @default(true)
  createdAt             DateTime
  updatedAt             DateTime
}

model EmployeeSalaryComponent {
  id                    String
  tenantId              String
  employeeId            String
  salaryComponentId     String
  value                 Float          // Employee-specific value
  startDate             DateTime
  endDate               DateTime?      // NULL = ongoing
  remarks               String?
  updatedAt             DateTime
  
  @@unique([employeeId, salaryComponentId, startDate])
}

model SalaryComponentAudit {
  id                    String
  tenantId              String
  employeeId            String
  componentId           String
  previousValue         Float
  newValue              Float
  reason                String?
  changedBy             String         // UserId
  effectiveDate         DateTime
  timestamp             DateTime
}
```

#### Services (1 service)
- **salaryComponentService.js**
  - Define salary components
  - Assign component values to employees
  - Calculate gross salary from components
  - Component history tracking
  - Component change audit trail

### 3.2 Payroll Validation & Processing

#### Services (Enhanced payrollService from Phase 3)
- Validate salary calculations
- Deduction cap enforcement
- Loan recovery logic
- Bonus/incentive processing
- Net salary calculation
- Payslip generation

### 3.3 Employee Loans

#### Database Models (2 models)
```prisma
model EmployeeLoan {
  id                    String
  tenantId              String
  employeeId            String
  loanType              String         // PERSONAL, EDUCATIONAL, HOUSING, VEHICLE
  loanAmount            Float
  interestRate          Float          @default(0)
  disbursementDate      DateTime
  loanTenure            Int            // months
  monthlyEMI            Float
  totalInterest         Float
  totalAmount           Float          // Principal + Interest
  startRepayment        DateTime       // When EMI starts
  status                String         // active, completed, defaulted, cancelled
  createdAt             DateTime
  updatedAt             DateTime
}

model LoanRepayment {
  id                    String
  tenantId              String
  loanId                String
  employeeId            String
  repaymentNo           String         @unique // LOAN-REP-001-YYYY
  installmentNo         Int
  emiAmount             Float
  principalAmount       Float
  interestAmount        Float
  repaymentDate         DateTime
  dueDate               DateTime
  payrollId             String?        // Link to payroll if deducted
  paymentMethod         String?        // payroll_deduction, manual_payment
  status                String         // pending, paid, overdue, waived
  createdAt             DateTime
  updatedAt             DateTime
}
```

#### Services (1 service)
- **loanService.js**
  - Issue loans to employees
  - Calculate EMI and repayment schedule
  - Track repayments
  - Deduct from payroll automatically
  - Generate loan statements
  - Handle early repayment

### 3.4 Tax Configuration (New)

#### Database Models (2 models)
```prisma
model TaxConfiguration {
  id                    String
  tenantId              String
  taxType               String         // INCOME_TAX, PAYE, SOCIAL_SECURITY
  year                  Int
  effectiveDate         DateTime
  bands                 Json           // Tax brackets as JSON
  standardDeduction     Float?
  rebate                Float?         // Tax rebates
  remarks               String?
  isActive              Boolean        @default(true)
  createdAt             DateTime
  updatedAt             DateTime
}

model EmployeeTaxExemption {
  id                    String
  tenantId              String
  employeeId            String
  taxType               String
  exemptionAmount       Float
  reason                String?        // Medical, Insurance, Investment
  validFrom             DateTime
  validTo               DateTime?
  approvedBy            String?
  createdAt             DateTime
  updatedAt             DateTime
}
```

---

## Phase 4: Performance & Development

### 4.1 Performance Management

#### Database Models (4 models)
```prisma
model PerformanceReview {
  id                    String
  tenantId              String
  employeeId            String
  reviewerId            String         // Manager/Supervisor
  reviewPeriodStart     DateTime
  reviewPeriodEnd       DateTime
  overallRating         Float          // 1-5 scale
  status                String         // draft, pending_review, completed
  submittedAt           DateTime?
  completedAt           DateTime?
  createdAt             DateTime
  updatedAt             DateTime
}

model PerformanceParameter {
  id                    String
  tenantId              String
  name                  String         // Attendance, Quality, Teamwork
  code                  String         @unique
  description           String?
  weightage             Float          // % contribution to overall
  scaleMin              Float          @default(1)
  scaleMax              Float          @default(5)
  createdAt             DateTime
  updatedAt             DateTime
}

model ReviewParameter {
  id                    String
  tenantId              String
  reviewId              String
  parameterId           String
  rating                Float
  comments              String?
  evidence              String[]       // Evidence URLs
  createdAt             DateTime
  updatedAt             DateTime
}

model GoalTracking {
  id                    String
  tenantId              String
  employeeId            String
  title                 String
  description           String?
  targetDate            DateTime
  status                String         // on_track, at_risk, completed, cancelled
  progress              Int            // Percentage
  notes                 String?
  reviewedAt            DateTime?
  createdAt             DateTime
  updatedAt             DateTime
}
```

#### Services (2 services)
- **performanceReviewService.js**
- **goalTrackingService.js**

### 4.2 Training & Development

#### Database Models (3 models)
```prisma
model TrainingProgram {
  id                    String
  tenantId              String
  name                  String
  description           String?
  type                  String         // EXTERNAL, INTERNAL, ONLINE
  provider              String?
  startDate             DateTime
  endDate               DateTime
  duration              Int            // hours
  location              String?
  maxParticipants       Int
  cost                  Float?
  trainingMaterials     String[]       // File URLs
  createdAt             DateTime
  updatedAt             DateTime
}

model TrainingEnrollment {
  id                    String
  tenantId              String
  trainingId            String
  employeeId            String
  enrollmentDate        DateTime
  status                String         // enrolled, in_progress, completed, cancelled
  completionDate        DateTime?
  certificateIssued     Boolean        @default(false)
  certificateURL        String?
  performanceScore      Float?
  notes                 String?
  createdAt             DateTime
  updatedAt             DateTime
}

model SkillMatrix {
  id                    String
  tenantId              String
  employeeId            String
  skillName             String
  proficiencyLevel      String         // Beginner, Intermediate, Expert
  yearsOfExperience     Float
  certification         String?
  verifiedBy            String?        // Manager/HR
  verifiedDate          DateTime?
  createdAt             DateTime
  updatedAt             DateTime
}
```

#### Services (2 services)
- **trainingService.js**
- **skillsService.js**

---

## Phase 5: Exit & Compliance

### 5.1 Exit Management

#### Database Models (3 models)
```prisma
model ExitRequest {
  id                    String
  tenantId              String
  employeeId            String
  resignationDate       DateTime       // When notice given
  lastWorkingDate       DateTime
  reason                String
  approvedBy            String?        // Manager
  approvedAt            DateTime?
  status                String         // pending, approved, rejected, completed
  createdAt             DateTime
  updatedAt             DateTime
}

model ExitInterview {
  id                    String
  tenantId              String
  employeeId            String
  exitRequestId         String
  interviewDate         DateTime
  interviewer           String         // HR UserId
  companyRating         Int?           // 1-5 scale
  reasonsForLeaving     Json           // Structured responses
  feedbackPoints        String?
  recommendations       String?
  completedAt           DateTime?
  createdAt             DateTime
  updatedAt             DateTime
}

model ExitChecklist {
  id                    String
  tenantId              String
  employeeId            String
  exitRequestId         String
  
  // Various items
  finalSettlement       Boolean        // Calculated
  gratuityProcessed     Boolean
  noticePaid            Boolean
  leaveEncashment       Boolean
  loanSettlement        Boolean
  assetsReturned        Boolean
  accessRevoked         Boolean
  emailArchived         Boolean
  lastPaymentMade       Boolean
  
  checkedBy             String?        // HR UserId
  checkedAt             DateTime?
  notes                 String?
  createdAt             DateTime
  updatedAt             DateTime
}
```

#### Services (2 services)
- **exitProcessService.js**
- **complianceReportingService.js**

### 5.2 Compliance & Reporting

#### Database Models (2 models)
```prisma
model ComplianceReport {
  id                    String
  tenantId              String
  reportType            String         // ATTENDANCE, PAYROLL, EXIT, TAX
  reportPeriod          String         // YYYY-MM
  generatedAt           DateTime
  reportData            Json           // Report content
  generatedBy           String         // UserId
  approvedBy            String?
  status                String         // draft, submitted, approved
  createdAt             DateTime
  updatedAt             DateTime
}

model AuditTrail {
  id                    String
  tenantId              String
  entityType            String         // Employee, Payroll, Leave, etc
  entityId              String
  action                String         // CREATE, UPDATE, DELETE
  userId                String
  oldValues             Json?
  newValues             Json?
  changes               Json?
  reason                String?
  timestamp             DateTime
}
```

#### Services (2 services)
- **complianceService.js**
- **reportingService.js**

---

## Implementation Timeline & Dependencies

### Week 1: Phase 2 Foundation
- Database schema (Attendance, Shift, Leave models)
- Backend services (6 services)
- API routes (20+ endpoints)

### Week 2: Phase 2 Frontend + Phase 3 Foundation
- Phase 2 UI pages (7-8 pages)
- Phase 3 payroll models validation
- Phase 3 salary component models

### Week 3: Phase 3 Implementation
- Payroll routes + services
- Tax configuration
- Loan management
- Frontend pages (5-6 pages)

### Week 4: Phase 4 & 5 Implementation
- Performance reviews
- Training management
- Exit procedures
- Compliance reports
- Frontend pages (8-10 pages)

### Week 5: Testing & Documentation
- End-to-end testing
- Documentation
- Deployment preparation

---

## Database Migration Strategy

### Phase-by-Phase Approach
1. **Phase 2 Schema**: 10 new models
   ```bash
   npm run db:push  # Add Attendance, Shift, Leave
   ```

2. **Phase 3 Schema**: 8 new models (Salary components, Loans, Tax)
   ```bash
   npm run db:push  # Add Payroll extended models
   ```

3. **Phase 4 Schema**: 7 new models
   ```bash
   npm run db:push  # Add Performance, Training
   ```

4. **Phase 5 Schema**: 5 new models
   ```bash
   npm run db:push  # Add Exit, Compliance
   ```

**Zero Downtime**: Each phase is additive only. No table deletions or modifications.

---

## Security & Compliance Considerations

✅ **Multi-Tenant Isolation** — All operations scoped to tenantId  
✅ **Role-Based Access** — HR roles + manager roles + employee roles  
✅ **Audit Trail** — Every change logged with user + timestamp  
✅ **Data Privacy** — Leave details, medical certs restricted access  
✅ **Compliance** — Tax reporting, payroll compliance, exit documentation  
✅ **Approval Workflows** — Multi-level approvals for sensitive operations  
✅ **Immutable Records** — Salary history, payroll, audit logs never modified  

---

## Frontend Architecture

### Shared Components (Reusable)
- `HRDataTable` — Enhanced version of Phase 1's HRTable
- `HRFormBuilder` — Enhanced form builder with new field types
- `WorkflowApprovalPanel` — Multi-level approval workflow UI
- `DocumentUpload` — File upload with preview
- `DateRangePicker` — Period selection for reports
- `ChartComponent` — Dashboard charts for analytics

### Page Structure
Each module follows this pattern:
```
/tenant/hr/[module]
├── List/Dashboard page
├── Create modal/form
├── Edit modal/form
├── View details page
├── Reports page (where applicable)
└── Settings page (module-specific config)
```

### Navigation
```
HR Dashboard
├── Attendance
│   ├── Attendance List
│   ├── Check-in
│   ├── Summary Reports
│   └── Settings
├── Shift Management
│   ├── Shift Templates
│   ├── Assignments
│   ├── Schedule View
│   └── Swap Requests
├── Leave Management
│   ├── Leave Requests
│   ├── Leave Balance
│   ├── Approval Queue
│   └── Calendar View
├── Payroll
│   ├── Create Payroll
│   ├── Processing
│   ├── Payslips
│   ├── Loans & Advances
│   └── Configuration
├── Performance
│   ├── Reviews
│   ├── Goals
│   ├── Skills Matrix
│   └── Development Plans
├── Training
│   ├── Programs
│   ├── Enrollments
│   ├── Certificates
│   └── Skills Tracking
└── Exit
    ├── Resignation Requests
    ├── Exit Interviews
    ├── Checklists
    └── Compliance Reports
```

---

## API Design Patterns

### Naming Convention
```
GET    /api/hr/[entity]                    - List (paginated, filtered)
POST   /api/hr/[entity]                    - Create
GET    /api/hr/[entity]/:id                - Get details
PUT    /api/hr/[entity]/:id                - Update
DELETE /api/hr/[entity]/:id                - Soft-delete

GET    /api/hr/[entity]/:id/[action]       - Get calculated field
POST   /api/hr/[entity]/:id/[action]       - Perform action (approve, submit, etc)
```

### Filtering & Pagination
```
GET /api/hr/attendance?
  employeeId=E123&
  fromDate=2024-01-01&
  toDate=2024-12-31&
  status=present&
  page=1&
  limit=50
```

### Response Format
```json
{
  "success": true,
  "data": { /* entity data */ },
  "message": "Operation successful",
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1500,
    "totalPages": 30
  }
}
```

---

## Error Handling

### Common Error Codes
- `400` — Validation error
- `401` — Unauthorized
- `403` — Permission denied (insufficient role)
- `404` — Resource not found
- `409` — Conflict (approval level mismatch, leave balance insufficient)
- `422` — Business logic error (loan over-recovery, attendance conflict)
- `500` — Server error

---

## Testing Strategy

### Backend Testing
1. Service unit tests (Jest)
2. API integration tests
3. Multi-tenant isolation tests
4. Approval workflow tests
5. Business logic tests (leave balance, salary calculation)

### Frontend Testing
1. Component unit tests
2. Form validation tests
3. API mock tests
4. Navigation flow tests
5. Permission-based rendering tests

### End-to-End Testing
1. Complete workflows (leave request → approval → status update)
2. Multi-tenant scenarios
3. Approval workflows
4. Payroll processing cycle
5. Exit procedure

---

## Documentation Deliverables

For each phase:
1. **Database Schema Guide** — Models, relationships, constraints
2. **API Reference** — Endpoints, parameters, responses
3. **Service Documentation** — Business logic, calculations
4. **Frontend Component Guide** — Props, usage examples
5. **Workflow Documentation** — Process flows, approval sequences
6. **Configuration Guide** — Setup steps, initial data
7. **Testing Guide** — Test scenarios, data prep

---

## Deployment Checklist

- [ ] Database migrations applied
- [ ] All services syntax-validated
- [ ] All routes registered in app.js
- [ ] Frontend components imported in pages
- [ ] Routes added to App.tsx
- [ ] Authentication/authorization verified
- [ ] Error handling tested
- [ ] Multi-tenant isolation verified
- [ ] Approval workflows tested
- [ ] Reports generated correctly
- [ ] Documentation complete
- [ ] Production environment variables set
- [ ] Database backups scheduled
- [ ] Monitoring/logging configured

---

## Success Criteria

✅ All 5 phases implemented with zero breaking changes  
✅ 40+ database models created  
✅ 150+ API endpoints fully functional  
✅ 25+ frontend pages with complete UI  
✅ Multi-tenant isolation enforced  
✅ Approval workflows operational  
✅ Payroll calculations accurate  
✅ Audit trails complete  
✅ TypeScript validation clean  
✅ Full documentation provided  

---

**Next Action**: Begin Phase 2 implementation with Attendance models and services.

**Estimated Total Duration**: 5-6 weeks for complete implementation + testing + documentation
