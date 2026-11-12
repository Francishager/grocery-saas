# HR Management System - Implementation Guide

## Overview
This document describes the comprehensive HR Management module for JibuSales, including salary advances, payroll processing, and full accounting integration.

## Architecture Principles

### Core Principle: HR ↔ Accounting Integration
**Every financial HR transaction must have a corresponding accounting transaction.**

- Salary Advance Issue → DR Employee Salary Advances / CR Cash Account
- Payroll Processing → DR Salary Expense / CR Salary Payable / CR Salary Advance Recovery
- Salary Payment → DR Salary Payable / CR Payment Account

### Double-Entry Accounting
All HR transactions use transactional database operations to ensure atomicity:
- All-or-nothing: If accounting fails, entire HR transaction fails
- No partial posting: Either complete or rollback entirely
- Idempotency: Source type + Source ID prevents double-posting

## Database Schema

### Employee Extensions
- `salaryAdvanceBalance`: Tracks total outstanding advances for employee
- New relations to salary advances, payroll, and configurations

### New HR Models

#### EmployeeSalaryConfig
Stores employee salary configuration:
- Basic salary
- Allowances (transport, house, mobile, other)
- Gross salary (calculated)
- Deductions (PAYE, social security, health insurance, other)
- Total deductions (calculated)

#### SalaryAdvance
Tracks salary advances:
- Amount and recovery tracking
- Status: outstanding, partially_recovered, fully_recovered, cancelled
- Recovery method: payroll, direct_repayment, manual
- Accounting journal entry reference
- Approval and payment history

#### SalaryAdvanceRecovery
Links advance recoveries to:
- Specific payroll (for payroll-based recovery)
- Direct repayment transactions
- Recovery date and amount

#### Payroll
Core payroll record:
- Employee, period (YYYY-MM), earnings breakdown
- Deductions breakdown (PAYE, SS, insurance, other, advance recovery)
- Gross and net salary calculation
- Status: draft → approved → posted → partially_paid → paid → reversed
- Journal entry reference
- Payment tracking (amount, account, date, reference)

#### PayrollAdjustment & PayrollDeduction
Line items for:
- Bonuses, overtime, other adjustments
- Deductions (PAYE, social security, health insurance, etc.)

#### PayrollPayment
Records individual salary payments:
- Amount, payment method, account, date
- Journal entry reference for payment
- Status tracking

#### HRAccountingConfig
Tenant-specific account mappings (critical: no hard-coded IDs):
- Salary Expense Account (Expense type)
- Salary Payable Account (Liability type)
- Salary Advance Account (Asset type)
- PAYE Tax Account (Liability type)
- Social Security Account (Liability type)
- Configuration audit trail (who configured, when)

#### HRAuditLog
Complete audit trail:
- Record type, ID, employee
- Action (created, approved, posted, paid, reversed, etc.)
- Amount, description
- User, branch, journal entry reference
- Metadata for additional context
- Indexed by record type, ID, date for drill-down capability

### JournalEntry Extensions
- `sourceType`: SALARY_ADVANCE, PAYROLL, PAYROLL_PAYMENT, etc.
- `sourceId`: Reference to HR record (prevents duplicate posting)
- `reversalOfId`: For tracking reversals
- `reversalReason`, `reversedBy`, `reversedAt`: Reversal audit trail
- Unique constraint: (sourceType, sourceId) - ensures one journal per source

## Services

### hrAccountingService
Handles accounting integration:
- **validateHRAccountConfiguration()**: Verify required accounts are set up
- **verifyAccountsExist()**: Check accounts exist and are active
- **createSalaryAdvanceJournal()**: Post advance to accounting
- **createPayrollJournal()**: Post payroll with all deductions
- **createSalaryPaymentJournal()**: Post salary payment
- **reverseJournalEntry()**: Generate reversing entries (never delete)
- **getExistingJournalEntry()**: Idempotent lookups for double-post prevention
- **createAuditLog()**: Record all HR transactions
- **generateEntryNumber()**: Format: JE-YYYYMMDD-001

### salaryAdvanceService
Manages salary advances:
- **issueSalaryAdvance()**: Create advance with validation and accounting
  - Validates HR account configuration
  - Checks payment account type (not expense)
  - Creates journal entry atomically
  - Updates employee advance balance
  - Creates audit log
- **recordDirectRepayment()**: Direct employee repayment
  - Prevents over-recovery
  - Updates status to partially/fully recovered
  - Updates employee balance
- **cancelSalaryAdvance()**: Cancel with reversal
  - Reverses original accounting entry
  - Restores employee balance
  - Marks as cancelled
- **getEmployeeSalaryAdvances()**: Employee's advance history
- **getOutstandingAdvances()**: Active advances with optional branch filter
- **getSalaryAdvancesSummary()**: Aggregate statistics
- **generateAdvanceNumber()**: Format: ADV-001-YYYY

### payrollService
Manages payroll processing:
- **createPayroll()**: Create payroll in draft status
  - Prevents duplicate period/employee
  - Calculates gross and net
  - Validates advance recovery doesn't exceed outstanding
- **approvePayroll()**: Draft → Approved status
- **postPayroll()**: Approved → Posted with accounting
  - Validates salary expense and payable accounts
  - Processes advance recoveries atomically
  - Creates comprehensive journal entry
  - Updates advance balances and statuses
- **paySalary()**: Record salary payment
  - Prevents payment exceeding net salary
  - Creates payment journal entry
  - Updates payroll status (partially_paid or paid)
  - Maintains payment accounting reference
- **getPayrollSummary()**: Period aggregates with status breakdown
- **generatePayrollNumber()**: Format: PAYROLL-001-YYYY-MM

### hrConfigurationService
Manages HR account setup:
- **getHRConfig()**: Get or create tenant configuration
- **updateHRAccountMapping()**: Update account mappings
  - Validates account types match expected types
  - Creates unique constraint on sourceType/sourceId
  - Tracks who configured and when
- **checkHRConfiguration()**: Status and missing accounts
- **getAvailableAccountsByType()**: Returns expense, liability, asset accounts
- **initializeDefaultHRAccounts()**: One-time setup
  - Creates Standard HR accounts (Salaries & Wages, Salaries Payable, Employee Salary Advances)
  - Sets up initial configuration
  - Prevents re-initialization if accounts exist

## API Endpoints

### Salary Advances
```
POST   /api/hr/salary-advances              - Issue salary advance
GET    /api/hr/salary-advances/:id          - Get advance details
GET    /api/hr/salary-advances/employee/:employeeId - Get employee's advances
GET    /api/hr/salary-advances              - Get outstanding advances
POST   /api/hr/salary-advances/:id/direct-repayment - Record repayment
POST   /api/hr/salary-advances/:id/cancel   - Cancel advance
```

### Payroll
```
POST   /api/hr/payroll                      - Create payroll (draft)
GET    /api/hr/payroll/:id                  - Get payroll details
GET    /api/hr/payroll                      - Get payrolls for period
POST   /api/hr/payroll/:id/approve          - Approve payroll
POST   /api/hr/payroll/:id/post             - Post to accounting
POST   /api/hr/payroll/:id/pay              - Record payment
```

### HR Configuration
```
GET    /api/hr/config                       - Get configuration
GET    /api/hr/config/status                - Check setup status
GET    /api/hr/config/available-accounts    - Available accounts by type
POST   /api/hr/config/mapping               - Update account mappings
POST   /api/hr/config/initialize-accounts  - Auto-create default accounts
```

## Workflow Examples

### Issuing a Salary Advance
1. Check if Salary Advance Account is configured
   - If not configured → FAIL with error message
   - Suggest: Accounting → Settings → HR/Payroll Account Mapping
2. Validate payment account exists and is not expense type
3. Create SalaryAdvance record (status: outstanding)
4. Create journal entry atomically:
   - DR Employee Salary Advances / CR Payment Account
5. Update Employee.salaryAdvanceBalance (increment)
6. Create HRAuditLog entry with all details
7. Return advance details + journal entry reference

### Processing Payroll
1. Create Payroll in DRAFT status
   - Validate employee has no duplicate payroll for period
   - Allow adjustments and changes
2. APPROVE payroll
   - Change status to APPROVED
   - Lock from further editing
3. POST payroll to accounting
   - Validate Salary Expense and Salary Payable accounts configured
   - Process salary advance recoveries:
     - Create SalaryAdvanceRecovery records
     - Update SalaryAdvance balances and status
     - Decrement Employee.salaryAdvanceBalance
   - Create journal entry:
     - DR Salary Expense / CR Salary Payable
     - Add credit to Employee Salary Advances for each recovery
4. PAY salary (separate from posting)
   - Record payment from cash/bank
   - Create payment journal entry:
     - DR Salary Payable / CR Payment Account
   - Update Payroll.paidAmount and status

### Complete Example: Month-End Payroll Cycle

**Step 1: Issue Salary Advances**
- Employee Sarah requests UGX 200,000 advance
- System creates: Journal entry (DR Salary Advances 200,000 / CR Cash 200,000)
- Sarah's balance: 200,000 outstanding

**Step 2: Create January Payroll**
- Basic salary: 700,000
- Allowances: 100,000
- Gross: 800,000
- PAYE: 80,000
- Social Security: 40,000
- Salary Advance Recovery: 200,000 (full amount)
- Total Deductions: 320,000
- Net: 480,000

**Step 3: Approve & Post**
- Status: APPROVED
- Post to accounting:
  - Journal Entry created with sourceType=PAYROLL, sourceId=payroll123
  - Lines:
    - DR Salary Expense: 800,000
    - CR Salary Payable: 480,000
    - CR Employee Salary Advances: 320,000 (200k advance + 120k other deductions)
  - Sarah's advance: 0 outstanding (fully recovered)
  - Payroll status: POSTED

**Step 4: Pay Salary**
- Pay UGX 480,000 from Main Cash
- Journal Entry created with sourceType=PAYROLL_PAYMENT
  - DR Salary Payable: 480,000
  - CR Main Cash: 480,000
- Payroll status: PAID

**Result in Accounting:**
- Salary Expense account: +800,000 (expense recognized)
- Employee Salary Advances: -200,000 (advance recovered)
- Salary Payable: -480,000 (paid)
- Main Cash: -480,000 (cash decreased)
- Net: 0 (balanced)

## Key Security & Validation Features

1. **Transactional Integrity**
   - All HR financial operations use database transactions
   - If accounting fails, entire HR transaction rolls back
   - No orphaned HR records without accounting entries

2. **Double-Post Prevention**
   - Unique constraint on (sourceType, sourceId)
   - idempotent GET for existing journals
   - Prevents accidental re-posting

3. **Over-Recovery Prevention**
   - Validates salary advance recovery doesn't exceed outstanding
   - Clamps recovery to available balance
   - Prevents negative advance balances

4. **Account Validation**
   - Verifies accounts exist before posting
   - Checks account types match expected types
   - Prevents using expense accounts for cash payments

5. **Audit Trail**
   - Complete action history for every HR transaction
   - Who, when, what, why for all actions
   - Links to accounting journal entries

6. **Multi-Tenant Isolation**
   - All queries filtered by tenantId
   - Account mappings per tenant (no hard-coded IDs)
   - Separate HR data per tenant

7. **Reversals (Never Delete)**
   - Original entries marked as "reversed"
   - Creates offsetting journal entry
   - Maintains audit trail
   - Links between original and reversal

## Configuration Requirements

Before any salary advances or payroll:

1. Create Chart of Accounts with:
   - Salary Expense Account (type: expense)
   - Salary Payable Account (type: liability)
   - Employee Salary Advances Account (type: asset)

2. Map accounts:
   - Accounting → Settings → HR/Payroll Account Mapping
   - Select the appropriate accounts
   - System validates account types

3. Configure payment accounts:
   - Ensure Main Cash, Safe, Bank accounts exist
   - Accounts must not be expense type
   - For direct advances and payroll payments

## Error Handling

### Salary Advance Validation
```
Error: "Salary Advance Account Not Configured"
→ User must go to HR Settings and configure accounts

Error: "Cannot use Expense account for salary advance payment"
→ User must select Cash or Bank account

Error: "Cannot recover more than outstanding advance (200,000)"
→ System limits recovery to available balance
```

### Payroll Validation
```
Error: "Payroll already exists for employee in period"
→ Cannot create duplicate; user must edit existing payroll

Error: "Payroll Accounts Not Configured"
→ User must configure Salary Expense and Salary Payable

Error: "Payment amount exceeds remaining salary"
→ System limits payment to unremaining balance
```

## Integration with Existing Systems

### Chart of Accounts
- HR uses existing Account model
- Account types validate mapping
- No modifications to Chart of Accounts model

### Journal Entries
- HR uses existing JournalEntry model
- Adds sourceType/sourceId for tracking
- Adds reversal tracking fields
- All existing GL functionality remains intact

### Users & Permissions
- Uses existing User and Tenant models
- Audit logs track user actions
- Future permission model can restrict HR actions

### Branches
- Multi-branch support through branchId
- Payroll and advances scoped to branch
- Optional branch filtering in queries

## Frontend Integration Points

### Dashboard
- Display HR indicators:
  - Total employees
  - Payroll pending approval
  - Salary payable
  - Outstanding salary advances
  - Employees with advances

### Employee Profile
- Add financial section:
  - Compensation details
  - Current advance balance
  - Advance history
  - Recent payroll

### Reports
- Salary Expense report (from GL)
- Salary Payable aging
- Advance aging
- Payroll summary by period
- Employee salary analysis

### Settings
- HR → Accounting Configuration
  - Select accounts for mapping
  - Initialize default accounts
  - View current configuration

## Testing Checklist

- [ ] Create salary advance with accounting validation
- [ ] Record advance recovery (direct repayment)
- [ ] Cancel advance with reversal
- [ ] Create payroll for employee
- [ ] Approve payroll
- [ ] Post payroll with advance recovery
- [ ] Pay salary in full
- [ ] Pay salary partially (multiple payments)
- [ ] Verify journal entries created correctly
- [ ] Verify employee balances updated
- [ ] Test over-recovery prevention
- [ ] Test duplicate period prevention
- [ ] Verify audit trail captures all actions
- [ ] Test reversal journal creation
- [ ] Test double-post prevention (idempotency)
- [ ] Multi-branch scenarios
- [ ] Multi-tenant isolation
