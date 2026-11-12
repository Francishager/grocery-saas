# HR Management Module - Comprehensive Implementation Roadmap

**Status**: 🚀 Phase 1 Starting
**Last Updated**: August 16, 2026

---

## 📋 Executive Summary

Upgrading JibuSales HR Management from a basic payroll module into a **complete, enterprise-grade workforce management system** supporting 64 requirements across 5 phased implementations.

### Key Principles
- ✅ HR is a **first-class, independent SaaS module** (not dependent on POS/Sales/Inventory)
- ✅ Multi-tenant with per-tenant feature control
- ✅ Complete employee lifecycle (Recruit → Hire → Pay → Develop → Exit)
- ✅ Full accounting integration (every transaction has GL impact)
- ✅ Comprehensive audit trails
- ✅ Historical data preservation
- ✅ Atomic transactions (all-or-nothing)
- ✅ Granular RBAC permissions

---

## 🎯 Implementation Phases

### Phase 1: HR Core (Weeks 1-2) ✅ CURRENT
**Objective**: Build solid foundation for employee management and accounting

#### Database Models
- [x] Enhance `Employee` model (add all required fields)
- [x] Create `Department` model
- [x] Create `Unit` model
- [x] Create `Team` model
- [x] Create `Position` model
- [x] Create `EmployeeDocument` model
- [x] Create `EmployeeContract` model
- [x] Create `EmploymentHistory` model
- [x] Create `SalaryHistory` model (never overwrite current salary)
- [x] Create `HRPermission` model
- [x] Create `HRModuleFeature` model (for SaaS feature control)
- [x] Enhance `HRAccountingConfig` (more account types)

#### Backend Services
- [ ] Department management service
- [ ] Position management service
- [ ] Employee enhanced service
- [ ] Contract management service
- [ ] Employee document service
- [ ] HR permissions service
- [ ] HR feature/module control service

#### API Routes
- [ ] Department endpoints (CRUD)
- [ ] Position endpoints (CRUD)
- [ ] Employee endpoints (enhanced profile)
- [ ] Contract endpoints (lifecycle)
- [ ] Employee document endpoints
- [ ] HR settings endpoints

#### Frontend Components
- [ ] Department management page
- [ ] Position management page
- [ ] Enhanced employee profile (tabs)
- [ ] Contract management UI
- [ ] Document upload/management UI
- [ ] HR settings/configuration page

#### Deliverables
- ✅ Enhanced schema with 9 new models
- [ ] Complete Phase 1 services
- [ ] Complete Phase 1 API endpoints
- [ ] Phase 1 frontend components
- [ ] Database migration script
- [ ] Phase 1 documentation

---

### Phase 2: Workforce Management (Weeks 3-4)
**Objective**: Attendance, shifts, and leave workflows

#### Database Models
- [ ] `Shift` model (definition)
- [ ] `EmployeeShiftAssignment` model
- [ ] `ShiftRotation` model
- [ ] `AttendanceRecord` model (enhanced)
- [ ] `LeaveType` model (configurable)
- [ ] `LeaveAllocation` model (per-employee, per-type)
- [ ] `LeaveApproval` model (workflow)
- [ ] `Overtime` model

#### Features
- [ ] Shift definitions per tenant
- [ ] Shift assignment workflows
- [ ] Shift swapping request/approval
- [ ] Multiple attendance sources (manual, QR, biometric)
- [ ] Clock-in/out with location tracking
- [ ] Attendance corrections workflow
- [ ] Late/absence tracking
- [ ] Configurable leave types per tenant
- [ ] Leave balance tracking
- [ ] Leave request workflow (Employee → Supervisor → HR)
- [ ] Approved leave → Attendance integration
- [ ] Overnight shift handling
- [ ] Overtime calculation and approval

#### Services & Routes
- [ ] Shift management service
- [ ] Attendance service
- [ ] Leave service
- [ ] Overtime service
- [ ] All corresponding routes

#### Frontend
- [ ] Shift management pages
- [ ] Shift rotation scheduler
- [ ] Attendance clock-in page
- [ ] Attendance records view
- [ ] Leave request form
- [ ] Leave calendar view
- [ ] Absence tracking

---

### Phase 3: Payroll & Loans (Weeks 5-7)
**Objective**: Complete payroll system with advances and loans

#### Database Models
- [ ] `AllowanceType` model (configurable)
- [ ] `DeductionType` model (configurable)
- [ ] `EmployeeAllowance` model
- [ ] `EmployeeDeduction` model
- [ ] `EmployeeLoan` model (separate from advances)
- [ ] `LoanRepayment` model
- [ ] Enhance `Payroll` (full workflow: Draft → Calculated → Reviewed → Approved → Posted → Paid)
- [ ] `PayslipTemplate` model
- [ ] `PayslipGeneration` model

#### Features
- [ ] Configurable allowance types (fixed, percentage, recurring)
- [ ] Configurable deduction types
- [ ] Full payroll calculation engine
- [ ] Salary advance recovery from payroll (with over-recovery prevention)
- [ ] Employee loans (separate from salary advances)
- [ ] Loan repayment tracking
- [ ] Partial salary payments
- [ ] Multiple payment methods
- [ ] Payslip generation (PDF, email access)
- [ ] Employee portal payslip access
- [ ] Payroll accounting with GL mapping
- [ ] Payroll reversal handling
- [ ] Duplicate posting prevention

#### Services & Routes
- [ ] Allowance/Deduction service
- [ ] Enhanced payroll service
- [ ] Loan service
- [ ] Payslip generation service
- [ ] All corresponding routes

#### Frontend
- [ ] Payroll creation & management
- [ ] Payroll approval workflow
- [ ] Payslip view/print/email
- [ ] Employee loan management
- [ ] Salary advance management
- [ ] Allowance & deduction configuration

---

### Phase 4: Employee Experience (Weeks 8-9)
**Objective**: Self-service portals and approval workflows

#### Database Models
- [ ] `ApprovalWorkflow` model (configurable)
- [ ] `ApprovalStep` model
- [ ] `ExpenseClaim` model
- [ ] `ClaimAttachment` model
- [ ] `EmployeeSelfServiceUpdate` model (requested changes)

#### Features
- [ ] Configurable approval workflows per transaction type
- [ ] Employee self-service portal
  - Profile view
  - Attendance history
  - Shift schedule
  - Leave balance & requests
  - Payslip access
  - Salary advance balance
  - Loan balance
  - Asset assignments
  - Training records
  - Performance reviews
- [ ] Manager self-service
  - Team attendance review
  - Leave approvals
  - Overtime approvals
  - Advance approvals
  - Claim approvals
  - Shift management
  - Performance reviews
- [ ] Expense & claims management
  - Employee claim submission
  - Supervisor approval
  - Finance approval
  - Payment integration
- [ ] Notifications system
  - Leave requests
  - Approvals/rejections
  - Payslip availability
  - Upcoming shifts
  - Missed attendance
  - Contract expiry
  - Certification expiry

#### Frontend
- [ ] Employee portal pages
- [ ] Manager approval dashboard
- [ ] Expense claim submission
- [ ] Workflow builder (admin)
- [ ] Notifications center

---

### Phase 5: Advanced HR (Weeks 10-12)
**Objective**: Performance, recruitment, training, and advanced features

#### Database Models
- [ ] `PerformancePeriod` model
- [ ] `Goal` model
- [ ] `KPI` model
- [ ] `PerformanceReview` model
- [ ] `ReviewerAssignment` model
- [ ] `Vacancy` model
- [ ] `Applicant` model
- [ ] `ApplicantDocument` model
- [ ] `InterviewSchedule` model
- [ ] `JobOffer` model
- [ ] `OnboardingChecklist` model
- [ ] `OnboardingTask` model
- [ ] `TrainingProgram` model
- [ ] `EmployeeTraining` model
- [ ] `Certificate` model
- [ ] `EmployeeCertification` model
- [ ] `EmployeeAssetAssignment` model
- [ ] `DisciplinaryAction` model
- [ ] `OffboardingChecklist` model

#### Features
- [ ] Performance management system
  - Performance periods
  - Goal setting
  - KPI tracking
  - Self-reviews
  - Manager reviews
  - Rating system
  - Improvement plans
- [ ] Recruitment module
  - Vacancy posting
  - Applicant tracking
  - Interview scheduling
  - Offer management
  - Hire-to-employee conversion
- [ ] Onboarding automation
  - Configurable checklists
  - Task assignment
  - Completion tracking
- [ ] Training & certifications
  - Training tracking
  - Certificate management
  - Expiry alerts
- [ ] Employee assets
  - Asset assignment
  - Condition tracking
  - Return management
  - Integration with inventory
- [ ] Discipline management (confidential)
  - Incident tracking
  - Warning levels
  - Hearing management
  - Supporting documents
- [ ] Offboarding automation
  - Separation process
  - Clearance checklist
  - Final payroll
  - Document archival

#### Services & Routes
- [ ] Performance service
- [ ] Recruitment service
- [ ] Onboarding service
- [ ] Training service
- [ ] Asset service
- [ ] Discipline service
- [ ] Offboarding service

#### Frontend
- [ ] Performance review pages
- [ ] Recruitment dashboard
- [ ] Onboarding workflow
- [ ] Training management
- [ ] Asset tracking
- [ ] Discipline records (restricted)
- [ ] Offboarding workflow

---

## 📊 HR Module Navigation Structure

```
HR Management
├── Dashboard
├── Employees
│   ├── Employee List
│   ├── Employee Profile (9 tabs)
│   └── Bulk Actions
├── Organization
│   ├── Departments
│   ├── Units
│   ├── Teams
│   ├── Positions
│   └── Org Chart
├── Attendance
│   ├── Clock In/Out
│   ├── Attendance Records
│   ├── Attendance Corrections
│   └── Attendance Reports
├── Shifts & Scheduling
│   ├── Shift Definitions
│   ├── Employee Shifts
│   ├── Shift Rotation
│   └── Shift Swapping
├── Leave
│   ├── Leave Types
│   ├── Leave Requests
│   ├── Leave Approvals
│   └── Leave Balance
├── Payroll
│   ├── Payroll Periods
│   ├── Payroll Processing
│   ├── Payslips
│   └── Payroll Reports
├── Salary Advances
│   ├── Advance Requests
│   ├── Approval Queue
│   └── Recovery Tracking
├── Employee Loans
│   ├── Loan Applications
│   ├── Approval Queue
│   └── Repayment Schedule
├── Allowances & Deductions
│   ├── Allowance Types
│   ├── Deduction Types
│   └── Configuration
├── Overtime
│   ├── Overtime Records
│   ├── Overtime Approval
│   └── Overtime Reports
├── Expenses & Claims
│   ├── Submit Claim
│   ├── Claim Approvals
│   └── Claim Reports
├── Performance
│   ├── Performance Periods
│   ├── Goals & KPIs
│   ├── Reviews
│   └── Ratings
├── Recruitment
│   ├── Vacancies
│   ├── Applicants
│   ├── Interviews
│   └── Offers
├── Onboarding
│   ├── Onboarding Tasks
│   └── Checklist Tracking
├── Training & Certifications
│   ├── Training Programs
│   ├── Employee Training
│   └── Certification Tracking
├── Employee Assets
│   ├── Asset Assignments
│   └── Return Management
├── Discipline (Restricted)
│   ├── Incidents
│   ├── Warnings
│   └── Hearings
├── Documents
│   ├── Employee Documents
│   ├── Contracts
│   └── Certifications
├── Offboarding
│   ├── Separation Process
│   └── Exit Checklist
├── Reports
│   ├── Employee Register
│   ├── Payroll Reports
│   ├── Attendance Reports
│   ├── Leave Reports
│   └── 15+ Other Reports
└── HR Settings
    ├── Account Mapping
    ├── Leave Configuration
    ├── Shift Configuration
    ├── Allowances/Deductions
    ├── Workflows
    └── Permissions
```

---

## 🗄️ Database Entities Summary

### Phase 1 (HR Core) - 12 Models
1. Employee (enhanced)
2. Department
3. Unit
4. Team
5. Position
6. EmploymentType
7. EmployeeContract
8. EmployeeDocument
9. SalaryHistory
10. EmploymentHistory
11. HRPermission
12. HRModuleFeature

### Phase 2 (Workforce) - 8 Models
1. Shift
2. EmployeeShiftAssignment
3. ShiftRotation
4. AttendanceRecord (enhanced)
5. LeaveType
6. LeaveAllocation
7. LeaveApproval
8. Overtime

### Phase 3 (Payroll & Loans) - 10 Models
1. AllowanceType
2. DeductionType
3. EmployeeAllowance
4. EmployeeDeduction
5. EmployeeLoan
6. LoanRepayment
7. Payroll (enhanced)
8. PayslipTemplate
9. PayslipGeneration
10. Payroll (enhanced fields)

### Phase 4 (Employee Experience) - 5 Models
1. ApprovalWorkflow
2. ApprovalStep
3. ExpenseClaim
4. ClaimAttachment
5. Notification (enhanced)

### Phase 5 (Advanced HR) - 20 Models
1. PerformancePeriod
2. Goal
3. KPI
4. PerformanceReview
5. ReviewerAssignment
6. Vacancy
7. Applicant
8. ApplicantDocument
9. InterviewSchedule
10. JobOffer
11. OnboardingChecklist
12. OnboardingTask
13. TrainingProgram
14. EmployeeTraining
15. Certificate
16. EmployeeCertification
17. EmployeeAssetAssignment
18. DisciplinaryAction
19. OffboardingChecklist
20. OffboardingTask

**Total**: 55 models across all phases

---

## 🔐 HR Permissions (RBAC)

### Module Access
- `hr.dashboard.view`
- `hr.module.access`

### Employee Management
- `employee.view` (with branch filtering)
- `employee.create`
- `employee.update`
- `employee.deactivate`
- `employee.documents.view`
- `employee.documents.upload`
- `employee.salary.view` (strict)
- `employee.salary.update`
- `employee.sensitive.view` (disciplinary, identity)

### Attendance
- `attendance.view`
- `attendance.clockin`
- `attendance.manage`
- `attendance.approve`
- `attendance.correct`

### Leave
- `leave.view`
- `leave.request`
- `leave.approve`
- `leave.manage_policies`

### Payroll
- `payroll.view`
- `payroll.create`
- `payroll.calculate`
- `payroll.approve`
- `payroll.post`
- `payroll.pay`
- `payroll.reverse`
- `payroll.slips.view`

### Salary Advances
- `salaryAdvance.view`
- `salaryAdvance.request`
- `salaryAdvance.create`
- `salaryAdvance.approve`
- `salaryAdvance.pay`
- `salaryAdvance.reverse`

### Loans
- `employeeLoan.view`
- `employeeLoan.create`
- `employeeLoan.approve`
- `employeeLoan.manage`

### Advanced Features
- `performance.view`
- `performance.manage`
- `recruitment.view`
- `recruitment.manage`
- `training.view`
- `training.manage`
- `discipline.view` (strict)
- `discipline.manage` (strict)
- `hrReports.view`
- `hrReports.export`

### Administration
- `hrAccounting.configure`
- `hrWorkflow.configure`
- `hrFeatures.manage`

---

## 📈 SaaS Feature Control

### Module Enable/Disable
```
HR_MANAGEMENT: true/false
```

### Feature Toggles (per tenant)
- `attendance_tracking`
- `shift_management`
- `leave_management`
- `payroll_processing`
- `salary_advances`
- `employee_loans`
- `performance_management`
- `recruitment`
- `training_management`
- `employee_assets`
- `expense_claims`
- `employee_self_service`
- `advanced_reporting`

### Subscription Limits
- `maxEmployees` (e.g., 100)
- `maxBranches` (e.g., 5)
- `enableAttendance` (true/false)
- `enablePayroll` (true/false)
- `enableAdvances` (true/false)
- `enableLoans` (true/false)
- `enablePerformance` (true/false)
- `enableRecruitment` (true/false)
- `enableSelfService` (true/false)
- `enableAdvancedReports` (true/false)

---

## 🏗️ Technical Architecture

### Database Layer
- Prisma ORM with PostgreSQL
- Normalized schema
- Proper indexing for performance
- Foreign key constraints
- Unique constraints for idempotency
- Tenant isolation at DB level

### Service Layer
- Stateless services
- Atomic transactions
- Comprehensive error handling
- Validation at service level
- Clear separation of concerns

### API Layer
- RESTful endpoints
- Standardized response format
- Error messages with context
- Pagination for large datasets
- Proper HTTP status codes
- Authentication & authorization

### Frontend Layer
- React components
- TypeScript for type safety
- Tailwind CSS for styling
- Responsive design
- Accessible UI
- State management (hooks)

### Integration Points
- Existing auth system
- Existing tenant system
- Existing branch system
- Existing accounting GL
- Existing notification system
- Existing audit system

---

## ✅ Validation & Testing Strategy

### Unit Tests
- [ ] Service logic (all calculation/validation)
- [ ] Permission checks
- [ ] Data validation
- [ ] Error handling

### Integration Tests
- [ ] Full workflows (request → approval → posting)
- [ ] GL posting accuracy
- [ ] Transaction atomicity
- [ ] Tenant isolation
- [ ] Permission enforcement
- [ ] Duplicate prevention

### Functional Tests
- [ ] Employee lifecycle
- [ ] Payroll cycle
- [ ] Leave workflow
- [ ] Salary advance workflow
- [ ] Approval workflows

### Performance Tests
- [ ] Large employee counts
- [ ] Bulk payroll processing
- [ ] Report generation
- [ ] Dashboard load time

---

## 📅 Timeline & Milestones

| Phase | Duration | Key Milestone | Status |
|-------|----------|---------------|--------|
| 1 | 2 weeks | HR core foundation | 🚀 Starting |
| 2 | 2 weeks | Workforce management | ⏳ Planned |
| 3 | 3 weeks | Payroll complete | ⏳ Planned |
| 4 | 2 weeks | Employee experience | ⏳ Planned |
| 5 | 3 weeks | Advanced features | ⏳ Planned |
| **Total** | **12 weeks** | Production ready | ⏳ Planned |

---

## 📝 File Structure

```
backend/
├── src/
│   ├── services/
│   │   ├── departmentService.js
│   │   ├── positionService.js
│   │   ├── employeeService.js (enhanced)
│   │   ├── contractService.js
│   │   ├── documentService.js
│   │   ├── shiftService.js
│   │   ├── attendanceService.js
│   │   ├── leaveService.js
│   │   ├── payrollService.js (enhanced)
│   │   ├── loanService.js
│   │   ├── expenseService.js
│   │   ├── performanceService.js
│   │   ├── recruitmentService.js
│   │   └── ... (more services)
│   ├── routes/
│   │   ├── departmentRoutes.js
│   │   ├── positionRoutes.js
│   │   ├── employeeRoutes.js (enhanced)
│   │   └── ... (more routes)
│   ├── middleware/
│   │   ├── hrPermissions.js
│   │   ├── featureControl.js
│   │   └── tenantCheck.js
│   └── utils/
│       ├── hrCalculations.js
│       ├── hrValidations.js
│       └── hrFormatters.js
├── prisma/
│   └── schema.prisma (significantly expanded)
└── migrations/
    ├── add_hr_core_phase1.sql
    ├── add_hr_workforce_phase2.sql
    └── ... (more migrations)

frontend/
├── src/
│   ├── pages/
│   │   ├── hr/
│   │   │   ├── HRDashboard.tsx
│   │   │   ├── EmployeeManagement.tsx
│   │   │   ├── DepartmentManagement.tsx
│   │   │   ├── AttendanceManagement.tsx
│   │   │   ├── LeaveManagement.tsx
│   │   │   ├── PayrollManagement.tsx
│   │   │   └── ... (more pages)
│   └── components/
│       ├── hr/
│       │   ├── EmployeeProfile.tsx
│       │   ├── AttendanceTable.tsx
│       │   ├── PayrollForm.tsx
│       │   └── ... (more components)
│       └── common/
│           ├── ApprovalWorkflow.tsx
│           ├── AttachmentUpload.tsx
│           └── ...

docs/
├── HR_IMPLEMENTATION_ROADMAP.md (this file)
├── HR_PHASE1_GUIDE.md
├── HR_PHASE2_GUIDE.md
└── ...
```

---

## 🎯 Success Criteria

- ✅ All models created with proper relationships
- ✅ All services implemented with error handling
- ✅ All API endpoints tested and documented
- ✅ Frontend components responsive and accessible
- ✅ Permissions enforced at all levels
- ✅ Accounting integration working
- ✅ No cross-tenant data leakage
- ✅ All workflows tested end-to-end
- ✅ Performance targets met (<200ms avg response time)
- ✅ Documentation complete and clear

---

## 🔗 Related Documents

- [HR_IMPLEMENTATION_SUMMARY.md](HR_IMPLEMENTATION_SUMMARY.md) - Initial HR implementation
- [HR_API_REFERENCE.md](HR_API_REFERENCE.md) - API documentation
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Overall project summary
- [backend/HR_IMPLEMENTATION_GUIDE.md](backend/HR_IMPLEMENTATION_GUIDE.md) - Technical guide

---

## 💡 Notes

- Start Phase 1 immediately
- Complete and test each phase before moving to next
- Maintain backward compatibility
- Regular sync with business requirements
- Comprehensive testing at each stage
- Clear documentation for each component
