# HR Management Module - Phase 1: HR Core Implementation Guide

**Status**: 🚀 In Progress
**Phase**: 1 of 5
**Objective**: Build solid foundation for employee management and accounting

---

## Phase 1 Overview

### What's Being Built
A comprehensive Employee Management system with organizational structure, contracts, documents, and complete audit trails. This forms the foundation for all subsequent HR phases.

### Why Phase 1 First
- Establishes data model for all other phases
- Enables employee profile management
- Sets up permissions and feature control
- Creates historical tracking for salary and employment changes
- All downstream modules depend on this foundation

---

## Database Schema Changes

### New Models (11 total)

#### 1. Department
```sql
Purpose: Organizational structure
Fields: name, code, description, headId, isActive
Relations: employees, units, teams, branch
Constraints: unique(tenantId, code)
```

#### 2. Unit
```sql
Purpose: Department subdivision
Fields: name, code, description, headId, isActive
Relations: department, employees, teams
Constraints: unique(tenantId, code)
```

#### 3. Team
```sql
Purpose: Team within unit/department
Fields: name, code, description, leaderId, size, isActive
Relations: unit, department, employees
Constraints: unique(tenantId, code)
```

#### 4. Position
```sql
Purpose: Job position/role definition
Fields: name, code, description, level, department, minSalary, maxSalary
Relations: employees
Constraints: unique(tenantId, code)
```

#### 5. EmployeeContract
```sql
Purpose: Employment contract tracking
Fields: contractNo, contractType, status, startDate, endDate, salary, probationPeriod
Relations: employee, tenant
Constraints: unique(tenantId, contractNo)
Key Feature: Never delete, maintain full contract history
```

#### 6. EmployeeDocument
```sql
Purpose: Document storage and expiry tracking
Fields: documentType, fileName, fileUrl, issueDate, expiryDate, uploadedBy
Relations: employee, tenant
Key Feature: Expiry alerts for certificates, IDs, etc
```

#### 7. SalaryHistory
```sql
Purpose: Complete salary audit trail (CRITICAL)
Fields: basicSalary, allowances, deductions, effectiveDate, reason, approvedBy
Relations: employee, tenant
Constraint: unique(employeeId, effectiveDate)
IMPORTANT: ONE record per effective date, never overwrite
```

#### 8. EmploymentHistory
```sql
Purpose: Track status/role changes
Fields: employmentStatus, position, department, branch, effectiveDate, endDate, reason
Relations: employee, tenant
Key Feature: Historical tracking for accurate reporting
```

#### 9. HRModuleFeature
```sql
Purpose: SaaS feature toggle for HR
Fields: featureName, isEnabled, config (JSON)
Relations: tenant
Constraint: unique(tenantId, featureName)
Examples: attendance_tracking, shift_management, payroll_processing
```

#### 10. HRPermission
```sql
Purpose: Granular role-based access control
Fields: roleId, permissionCode, description
Relations: tenant
Constraint: unique(tenantId, roleId, permissionCode)
Examples: hr.dashboard.view, employee.create, payroll.approve
```

#### 11. HRAccountingConfig (ENHANCED)
```sql
Changes: Add more account mappings
New Fields: 
  - healthInsuranceAccountId
  - employeeLoanAccountId
  - employeeLoanPayableId
  - payrollClearingAccountId
  - payrollSuspenseAccountId
```

### Enhanced Models (2 total)

#### 1. Employee (SIGNIFICANTLY ENHANCED)
```sql
New Relations:
  - departmentId (Department)
  - positionId (Position)
  - supervisorId (self-relation for manager)
  - teamId (Team)
  - unitId (Unit)
  - employeeContracts (1-many)
  - documents (1-many)
  - salaryHistory (1-many)
  - employmentHistory (1-many)

New Fields (Personal):
  - middleName, gender, nationality, nationalId, maritalStatus
  - profilePhoto, city, state, postalCode, country
  - emergencyContact, emergencyPhone, nextOfKin, nextOfKinRelation

New Fields (Employment):
  - employeeNumber (unique per tenant)
  - employmentType (permanent, contract, temporary, casual, part_time, intern)
  - employmentStatus (active, on_probation, on_leave, suspended, notice_period, etc)
  - probationStartDate, probationEndDate
  - contractStartDate, contractEndDate
  - workLocation, costCentreId, payFrequency

Key Changes:
  - basicSalary now marked as "reference only"
  - Payroll MUST use SalaryHistory.effectiveDate
  - supervisorId enables manager approval workflows
  - employeeNumber is unique per tenant (for identification)
```

#### 2. HRAuditLog (ENHANCED)
```sql
New Fields:
  - previousValue (JSON string)
  - newValue (JSON string)
  - reason (for sensitive changes)
  - action field expanded (now ~20 possible actions)

New Indexes:
  - userId (for user activity tracking)
  - action (for filtering by type)
```

#### 3. Tenant (RELATIONS ADDED)
```sql
New Relations:
  - departments Department[] @relation("TenantDepartments")
  - units Unit[] @relation("TenantUnits")
  - teams Team[] @relation("TenantTeams")
  - positions Position[] @relation("TenantPositions")
  - employeeContracts EmployeeContract[] @relation("TenantContracts")
  - employeeDocuments EmployeeDocument[] @relation("TenantEmployeeDocuments")
  - salaryHistories SalaryHistory[] @relation("TenantSalaryHistory")
  - employmentHistories EmploymentHistory[] @relation("TenantEmploymentHistory")
  - hrModuleFeatures HRModuleFeature[] @relation("TenantHRFeatures")
  - hrPermissions HRPermission[] @relation("TenantHRPermissions")
```

---

## Backend Services (Phase 1)

### 1. DepartmentService.js (~200 lines)
```typescript
Methods:
  - createDepartment(tenantId, branchId, name, code, headId)
  - updateDepartment(id, data)
  - getDepartment(id)
  - listDepartments(tenantId, branchId?)
  - deleteDepartment(id) // soft delete: mark inactive
  - assignHead(departmentId, userId)
  - getDepartmentStats(departmentId)

Features:
  - Validation: code must be unique per tenant
  - Audit: All changes logged to HRAuditLog
  - Soft delete: Never hard delete, mark inactive
  - Branch filtering: Support per-branch departments
```

### 2. UnitService.js (~180 lines)
```typescript
Methods:
  - createUnit(tenantId, departmentId, name, code)
  - updateUnit(id, data)
  - getUnit(id)
  - listUnitsByDepartment(departmentId)
  - assignLead(unitId, userId)
  - transferUnit(fromDept, toDept)

Features:
  - Validation: code unique per tenant
  - Cannot have unit without department
  - Audit all operations
```

### 3. TeamService.js (~180 lines)
```typescript
Methods:
  - createTeam(tenantId, departmentId, unitId?, name, code)
  - updateTeam(id, data)
  - getTeam(id)
  - listTeamsByUnit(unitId)
  - listTeamsByDepartment(departmentId)
  - assignLead(teamId, userId)
  - addMember(teamId, employeeId)
  - removeMember(teamId, employeeId)

Features:
  - Validation: code unique per tenant
  - Size tracking: Update team.size when members added/removed
  - Cannot transfer team without unit
```

### 4. PositionService.js (~150 lines)
```typescript
Methods:
  - createPosition(tenantId, name, code, level, department, salary range)
  - updatePosition(id, data)
  - getPosition(id)
  - listPositions(tenantId, filters)
  - deletePosition(id) // soft delete
  - getPositionStats(id) // how many employees in this position

Features:
  - Validation: code unique per tenant
  - Can have salary range for benchmarking
  - Cannot delete if employees assigned
```

### 5. EmployeeService.js (ENHANCED, ~400 lines)
```typescript
Current + New Methods:
  - createEmployee(all 40+ fields) // COMPREHENSIVE
  - updateEmployee(id, fields) // Only allow certain fields to change
  - getEmployee(id) // Return with all relations
  - listEmployees(filters) // tenantId, branchId, departmentId, status, etc
  - deactivateEmployee(id) // Mark status as inactive, never delete
  - transferEmployee(employeeId, newBranch, newDept, newPos, reason)
  - assignSupervisor(employeeId, supervisorId)
  - getEmployeeHierarchy(departmentId) // Org chart data
  - getSubordinates(employeeId) // Direct reports
  - getEmployeeStats(tenantId) // Dashboard metrics

Validations:
  - employeeNumber must be unique per tenant
  - employmentStatus from allowed list
  - employmentType from allowed list
  - supervisorId must be valid employee
  - Email format validation
  - dateOfBirth <= today
  - hireDate <= today

Features:
  - Never hard delete employee
  - Create EmploymentHistory when status changes
  - Create audit log for sensitive field changes
  - Validate against HRModuleFeatures
  - Multi-tenant isolation
```

### 6. ContractService.js (~300 lines)
```typescript
Methods:
  - createContract(employeeId, type, startDate, endDate, terms, document)
  - updateContract(id, fields) // Only certain fields
  - getContract(id)
  - listContractsByEmployee(employeeId)
  - listExpiringContracts(tenantId, withinDays) // 60 days
  - renewContract(contractId, newEndDate, newTerms)
  - terminateContract(contractId, reason)
  - approveContract(contractId, userId)
  - getContractStats(tenantId)

Statuses:
  - draft → active → expiring → expired/renewed/terminated

Validations:
  - endDate > startDate
  - One active contract per employee (or allow multiple?)
  - Approved required before activation

Features:
  - Store document URL (S3/Cloudinary)
  - Expiry alerts
  - Probation period tracking
  - Never delete, track all versions
  - Create audit log
```

### 7. DocumentService.js (~250 lines)
```typescript
Methods:
  - uploadDocument(employeeId, type, file, issueDate, expiryDate)
  - getDocument(id)
  - listDocumentsByEmployee(employeeId)
  - listExpiringDocuments(tenantId, withinDays) // 30, 60, 90
  - updateDocument(id, metadata) // Not the file itself
  - deleteDocument(id) // Soft delete/archive
  - generateExpiryAlerts(tenantId) // Create notifications

Document Types:
  - employment_contract, national_id, passport
  - academic_certificate, professional_certificate
  - cv, appointment_letter, promotion_letter
  - warning_letter, training_certificate, medical_document
  - other

Features:
  - File storage integration (S3/Cloudinary)
  - Expiry date tracking and alerts
  - Document versioning (store history)
  - Never hard delete
```

### 8. SalaryHistoryService.js (~200 lines) - CRITICAL
```typescript
Methods:
  - recordSalaryChange(employeeId, newSalary, reason, approvedBy)
  - getCurrentSalary(employeeId) // Get latest effective
  - getSalaryAsOf(employeeId, date) // For payroll calculations
  - getSalaryHistory(employeeId) // All versions
  - validateSalaryChange(oldSalary, newSalary) // Optional: prevent decrease?
  - approveSalaryChange(historyId, userId)
  - getAvgSalaryByDept(departmentId)

CRITICAL RULES:
  - NEVER allow editing existing SalaryHistory records
  - NEVER overwrite salary data
  - One entry per effectiveDate (unique constraint)
  - Payroll MUST query this, not Employee.basicSalary
  - Maintain immutable audit trail

Features:
  - Reason tracking (promotion, review, adjustment, etc)
  - Approval workflow
  - Historical accuracy for reporting
```

### 9. EmploymentHistoryService.js (~150 lines)
```typescript
Methods:
  - recordStatusChange(employeeId, newStatus, reason)
  - recordTransfer(employeeId, newDept, newBranch, newPos, reason)
  - recordPromotion(employeeId, newPos, newDept, newSalary, reason)
  - recordDemotion(employeeId, newPos, newSalary, reason)
  - getEmploymentHistory(employeeId)
  - getEmployeeStatusAsOf(employeeId, date)
  - getTransferHistory(employeeId)

Features:
  - Track all position/status/branch/dept changes
  - Effective dates for reporting
  - Never delete history
  - Audit all changes
```

### 10. HRPermissionService.js (~150 lines)
```typescript
Methods:
  - assignPermissionToRole(tenantId, roleId, permissionCode)
  - removePermissionFromRole(tenantId, roleId, permissionCode)
  - hasPermission(userId, permissionCode) // Check if allowed
  - getPermissionsForRole(tenantId, roleId)
  - getAllPermissions() // Reference list
  - checkActionAllowed(userId, action, resource) // Middleware

Permissions (50+ total, see separate RBAC spec)

Features:
  - Fine-grained access control
  - Tied to JibuSales existing roles
  - Cached for performance
  - Audit permission changes
```

### 11. HRFeatureService.js (~120 lines)
```typescript
Methods:
  - enableFeature(tenantId, featureName, config?)
  - disableFeature(tenantId, featureName)
  - isFeatureEnabled(tenantId, featureName)
  - getFeatureConfig(tenantId, featureName)
  - getEnabledFeatures(tenantId)
  - validateFeatureDependencies(featureName) // e.g., payroll requires contracts

Features:
  - SaaS feature control per tenant
  - Configuration per feature
  - Dependency validation
  - Used in routes to show/hide functionality
```

---

## Backend API Routes (Phase 1)

### Department Routes (6 endpoints)
```
GET    /api/hr/departments                    - List all departments
POST   /api/hr/departments                    - Create department
GET    /api/hr/departments/:id                - Get department detail
PUT    /api/hr/departments/:id                - Update department
DELETE /api/hr/departments/:id                - Deactivate department
POST   /api/hr/departments/:id/assign-head   - Assign department head
```

### Unit Routes (6 endpoints)
```
GET    /api/hr/units                         - List units
POST   /api/hr/units                         - Create unit
GET    /api/hr/units/:id                     - Get unit detail
PUT    /api/hr/units/:id                     - Update unit
DELETE /api/hr/units/:id                     - Deactivate unit
POST   /api/hr/units/:id/assign-lead        - Assign unit lead
```

### Team Routes (8 endpoints)
```
GET    /api/hr/teams                         - List teams
POST   /api/hr/teams                         - Create team
GET    /api/hr/teams/:id                     - Get team detail
PUT    /api/hr/teams/:id                     - Update team
DELETE /api/hr/teams/:id                     - Deactivate team
POST   /api/hr/teams/:id/assign-lead        - Assign team lead
POST   /api/hr/teams/:id/add-member         - Add employee to team
DELETE /api/hr/teams/:id/remove-member/:empId - Remove from team
```

### Position Routes (6 endpoints)
```
GET    /api/hr/positions                     - List positions
POST   /api/hr/positions                     - Create position
GET    /api/hr/positions/:id                 - Get position detail
PUT    /api/hr/positions/:id                 - Update position
DELETE /api/hr/positions/:id                 - Deactivate position
GET    /api/hr/positions/:id/stats           - Position statistics
```

### Employee Routes (12 endpoints - ENHANCED)
```
GET    /api/hr/employees                     - List employees (with filters)
POST   /api/hr/employees                     - Create employee
GET    /api/hr/employees/:id                 - Get employee profile
PUT    /api/hr/employees/:id                 - Update employee
DELETE /api/hr/employees/:id                 - Deactivate employee
POST   /api/hr/employees/:id/transfer        - Transfer employee
POST   /api/hr/employees/:id/assign-supervisor - Assign manager
GET    /api/hr/employees/:id/hierarchy       - Org chart/hierarchy
GET    /api/hr/employees/:id/subordinates    - Direct reports
GET    /api/hr/employees/:id/salary-history  - Salary history
POST   /api/hr/employees/:id/salary-change   - Record salary change
GET    /api/hr/org-chart                     - Full org chart for tenant
```

### Contract Routes (8 endpoints)
```
GET    /api/hr/contracts                     - List contracts
POST   /api/hr/contracts                     - Create contract
GET    /api/hr/contracts/:id                 - Get contract detail
PUT    /api/hr/contracts/:id                 - Update contract
POST   /api/hr/contracts/:id/approve         - Approve contract
POST   /api/hr/contracts/:id/renew           - Renew contract
POST   /api/hr/contracts/:id/terminate       - Terminate contract
GET    /api/hr/contracts/expiring            - List expiring (60 days)
```

### Document Routes (7 endpoints)
```
POST   /api/hr/documents/upload              - Upload document
GET    /api/hr/documents/:id                 - Get document
GET    /api/hr/employees/:empId/documents    - List employee documents
PUT    /api/hr/documents/:id                 - Update metadata
DELETE /api/hr/documents/:id                 - Archive document
GET    /api/hr/documents/expiring            - List expiring documents
POST   /api/hr/documents/send-alerts         - Generate expiry notifications
```

### HR Settings Routes (6 endpoints)
```
GET    /api/hr/settings/permissions          - List all HR permissions
POST   /api/hr/settings/assign-permission    - Assign permission to role
DELETE /api/hr/settings/remove-permission    - Remove permission
GET    /api/hr/settings/features             - List available features
POST   /api/hr/settings/enable-feature       - Enable HR feature
POST   /api/hr/settings/disable-feature      - Disable HR feature
```

### Organization Routes (4 endpoints)
```
GET    /api/hr/organization/structure        - Full org structure
GET    /api/hr/organization/org-chart        - Org chart visualization data
GET    /api/hr/organization/stats            - Organization statistics
POST   /api/hr/organization/import           - Bulk import structure
```

**Total Phase 1 Routes**: ~55 endpoints

---

## Frontend Components (Phase 1)

### Pages (8 pages)
1. **DepartmentManagement.tsx** (~300 lines)
   - List departments
   - Create/edit department
   - Assign department head
   - Department statistics
   - Branch filter

2. **UnitManagement.tsx** (~250 lines)
   - List units
   - Create/edit unit
   - Assign unit lead
   - Department hierarchy view

3. **TeamManagement.tsx** (~300 lines)
   - List teams
   - Create/edit team
   - Manage team members
   - Team lead assignment
   - Team size display

4. **PositionManagement.tsx** (~250 lines)
   - List positions
   - Create/edit position
   - Salary range input
   - Position statistics

5. **EmployeeList.tsx** (ENHANCED, ~400 lines)
   - Comprehensive employee listing
   - Search, filter by dept/status/type/branch
   - Bulk actions
   - Quick edit
   - Status badges
   - Pagination

6. **EmployeeProfile.tsx** (ENHANCED, ~500 lines)
   - Tabbed interface:
     - Overview (personal info)
     - Employment (status, position, dates)
     - Organization (dept, team, supervisor)
     - Salary (current salary, change history)
     - Contracts (list, status)
     - Documents (upload, list, expiry)
     - Attendance (integration point)
     - Leave (integration point)
     - Payroll (integration point)
   - Edit inline where permitted
   - Change history view

7. **OrganizationChart.tsx** (~350 lines)
   - Visual org chart
   - Hierarchy visualization
   - Department/unit/team drill-down
   - Employee cards with details
   - Supervisor/subordinate relationships

8. **HRSettings.tsx** (ENHANCED, ~400 lines)
   - Feature toggles
   - Permission assignment UI
   - Account mapping (payroll GL)
   - Leave policy config
   - Shift config
   - Allowance/deduction types

### Reusable Components (8 components)
1. **EmployeeCard.tsx** - Display employee summary
2. **EmployeeSelector.tsx** - Dropdown to select employee
3. **DepartmentBreadcrumb.tsx** - Org structure navigation
4. **SalaryHistoryViewer.tsx** - Display salary changes over time
5. **EmploymentHistoryViewer.tsx** - Display role changes
6. **ContractCard.tsx** - Display contract summary
7. **DocumentUploadModal.tsx** - Upload documents with metadata
8. **OrganizationTree.tsx** - Hierarchical organization view

### Modals/Drawers (8 modals)
1. **CreateEmployeeModal** - Full employee creation form
2. **EditEmployeeModal** - Edit employee fields
3. **TransferEmployeeModal** - Change dept/branch/position
4. **UploadDocumentModal** - Document upload form
5. **RecordSalaryChangeModal** - Salary change form
6. **CreateContractModal** - Contract creation form
7. **AssignSupervisorModal** - Supervisor assignment
8. **BulkImportModal** - Import org structure/employees

---

## Data Validation & Business Rules

### Employee Validation
- employeeNumber: unique per tenant, required, alphanumeric
- firstName, lastName: required, max 100 chars
- email: unique if provided, valid email format
- phone: optional, valid format
- dateOfBirth: <= today
- hireDate: <= today
- gender: if required by policy, from allowed values
- nationalId: unique if provided
- supervisorId: must be valid employee, not self-referential

### Organization Validation
- Department.code: unique per tenant, alphanumeric + hyphen, max 20 chars
- Unit.code: unique per tenant, max 20 chars
- Team.code: unique per tenant, max 20 chars
- Position.code: unique per tenant, max 20 chars
- No orphaned units/teams without parent

### Contract Validation
- startDate <= endDate
- One active contract per employee (or allow multiple?)
- Cannot terminate past contract

### Salary History Validation
- basicSalary >= 0
- All deductions >= 0
- No two records for same employee/date
- grossSalary = basicSalary + totalAllowances
- totalDeductions = sum of all deductions

---

## Security & Permissions

### Authentication
- All endpoints require valid JibuSales session
- TenantId from authenticated user (never from request)
- BranchId from user's authorized branches

### Authorization (RBAC)
- hr.dashboard.view
- employee.view
- employee.create, employee.update, employee.deactivate
- employee.sensitive.view (for ID numbers, etc)
- employee.salary.view, employee.salary.update
- department.manage, unit.manage, team.manage, position.manage
- contract.view, contract.manage
- document.view, document.upload
- All operations audited

### Data Isolation
- All queries filtered by tenantId
- Never return cross-tenant data
- BranchId filtering where applicable
- No user can access outside authorized branches

---

## Testing & QA Checklist

### Unit Tests
- [ ] Department CRUD operations
- [ ] Unit CRUD operations
- [ ] Team CRUD operations
- [ ] Position CRUD operations
- [ ] Employee creation validation
- [ ] Employee transfer logic
- [ ] Salary history validation
- [ ] Employment history tracking
- [ ] Permission checks
- [ ] Feature toggle logic

### Integration Tests
- [ ] Create employee with all org relationships
- [ ] Transfer employee between departments
- [ ] Record salary change and verify history
- [ ] Create contract and track expiry
- [ ] Upload documents and verify expiry alerts
- [ ] Permissions enforced on API calls
- [ ] Multi-tenant isolation
- [ ] Audit logs created correctly

### UI/UX Tests
- [ ] Employee profile tabs load correctly
- [ ] Org chart renders with relationships
- [ ] Filters work on employee list
- [ ] Form validation shows errors
- [ ] Document upload works
- [ ] Salary history displays correctly
- [ ] Responsive design on mobile

### Performance Tests
- [ ] Employee list loads in <1 second (1000+ employees)
- [ ] Org chart renders in <2 seconds
- [ ] Profile tabs lazy-load content
- [ ] Pagination on large lists
- [ ] Search performance <500ms

### Security Tests
- [ ] Cannot access other tenant's employees
- [ ] Cannot access outside authorized branches
- [ ] Permissions actually enforced
- [ ] Sensitive fields redacted for unauthorized users
- [ ] Audit logs recorded correctly

---

## Database Migration Script

```sql
-- Phase 1: HR Core Module Migration
-- Generated: 2026-08-16
-- Description: Add organizational structure, contracts, and documents

-- Step 1: Add new enums (if using Prisma enums)
-- No enums needed - using strings for flexibility

-- Step 2: Create new tables
-- (Prisma will handle this with npx prisma migrate)

-- Step 3: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_departments_tenantId_branchId 
  ON departments(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_units_tenantId_departmentId 
  ON units(tenant_id, department_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenantId_departmentId_unitId 
  ON teams(tenant_id, department_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_tenantId_employeeId 
  ON employee_contracts(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employeeId_expiryDate 
  ON employee_documents(employee_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_salary_histories_employeeId_effectiveDate 
  ON salary_histories(employee_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_employment_histories_employeeId_effectiveDate 
  ON employment_histories(employee_id, effective_date);

-- Step 4: Migrate existing employee data (if any)
-- Add default employment history records for existing employees
INSERT INTO employment_histories 
  (tenant_id, employee_id, employment_status, position, department, 
   effective_date, recorded_by, recorded_at)
SELECT 
  e.tenant_id, e.id, e.status, e.job_title, e.department,
  e.hire_date, 'system', NOW()
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM employment_histories eh WHERE eh.employee_id = e.id
);

-- Step 5: Populate initial salary history for existing employees
INSERT INTO salary_histories 
  (tenant_id, employee_id, basic_salary, gross_salary, total_deductions,
   effective_date, reason, created_at)
SELECT 
  e.tenant_id, e.id, e.basic_salary, e.basic_salary, 0,
  e.hire_date, 'system_migration', NOW()
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM salary_histories sh WHERE sh.employee_id = e.id
);

-- Step 6: Verify data integrity
SELECT COUNT(*) as total_employees,
       COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
       COUNT(DISTINCT department_id) as departments,
       COUNT(DISTINCT position_id) as positions
FROM employees;
```

---

## Implementation Roadmap - Phase 1 Detailed Steps

### Week 1
- **Day 1**: Database schema design & review (Done)
- **Day 2-3**: Implement services 1-4 (Departments, Units, Teams, Positions)
- **Day 4**: Implement EmployeeService enhancements
- **Day 5**: Implement ContractService and DocumentService

### Week 2
- **Day 6-7**: Implement SalaryHistoryService and EmploymentHistoryService
- **Day 8**: Implement HRPermissionService and HRFeatureService
- **Day 9**: Create all API routes
- **Day 10**: Frontend components (pages and modals)

### Week 3
- **Day 11-12**: Testing (unit, integration, security)
- **Day 13-14**: Bug fixes and documentation
- **Day 15**: Performance optimization and final QA

---

## Deliverables Checklist

### Backend
- [ ] All 11 services complete (~2000 lines)
- [ ] All 55 API endpoints functional
- [ ] Error handling comprehensive
- [ ] Validation at service layer
- [ ] Audit logging implemented
- [ ] Database migration scripts ready

### Frontend
- [ ] All 8 pages complete (~2500 lines)
- [ ] All 8 reusable components
- [ ] All 8 modals/drawers
- [ ] Responsive design
- [ ] Accessibility WCAG AA
- [ ] Error handling

### Documentation
- [ ] This guide complete
- [ ] API documentation
- [ ] Database schema documented
- [ ] Permission matrix
- [ ] Test cases documented

### Testing
- [ ] 50+ unit tests passing
- [ ] 30+ integration tests passing
- [ ] Security tests passing
- [ ] Performance targets met
- [ ] UAT sign-off

---

## Key Success Metrics

- ✅ Zero cross-tenant data leakage
- ✅ All permissions enforced
- ✅ <200ms average API response time
- ✅ <1 second employee list load (1000+ employees)
- ✅ 100% audit trail coverage
- ✅ Zero data loss on employee transfer
- ✅ Complete salary history immutability
- ✅ UI fully responsive

---

## Next Phase Trigger

Phase 1 is complete when:
1. ✅ All 11 services tested and passing
2. ✅ All 55 API endpoints functional
3. ✅ All frontend components responsive and accessible
4. ✅ Database migration successful
5. ✅ Security audit passed
6. ✅ Performance benchmarks met
7. ✅ UAT sign-off received

Then proceed to **Phase 2: Workforce Management** (Attendance, Shifts, Leave)

---

## References

- [HR_IMPLEMENTATION_ROADMAP.md](HR_IMPLEMENTATION_ROADMAP.md) - Overall roadmap
- [PHASE1_HR_MODELS.prisma](PHASE1_HR_MODELS.prisma) - Prisma schema
- [Specification Document](HR_SPECIFICATION.md) - Full 64-requirement spec
