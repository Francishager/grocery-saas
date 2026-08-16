# HR/Payroll API Quick Reference

## Base URL
```
/api/hr
```

## Authentication
All endpoints require:
- Valid user session (via existing auth middleware)
- Tenant context from authenticated user

## Response Format
```json
{
  "success": true,
  "data": { ... },
  "error": "Error message if failed"
}
```

---

## Salary Advances

### Issue Salary Advance
```
POST /salary-advances
Content-Type: application/json

{
  "employeeId": "string (required)",
  "amount": "number (required, > 0)",
  "paymentAccountId": "string (required)",
  "date": "ISO date string (optional, defaults to now)",
  "reason": "string (optional)",
  "recoveryMethod": "payroll | direct_repayment | manual (default: payroll)",
  "recoveryPlan": "string (optional, e.g., '5 Installments')",
  "recoveryAmount": "number (optional, default: 0)"
}

Response:
{
  "success": true,
  "advance": {
    "id": "adv_...",
    "advanceNo": "ADV-001-2025",
    "amount": 200000,
    "status": "outstanding",
    "outstandingAmount": 200000,
    "totalRecovered": 0,
    ...
  },
  "journalEntry": {
    "id": "je_...",
    "entryNo": "JE-20250816-001",
    "sourceType": "SALARY_ADVANCE",
    "sourceId": "adv_..."
  }
}
```

### Get Salary Advance Details
```
GET /salary-advances/:id

Response:
{
  "id": "adv_...",
  "advanceNo": "ADV-001-2025",
  "amount": 200000,
  "status": "outstanding",
  "employee": { ... },
  "recoveries": [ ... ],
  "journalEntry": { ... }
}
```

### Get Employee's Salary Advances
```
GET /salary-advances/employee/:employeeId

Response:
{
  "advances": [ ... ],
  "total": 3
}
```

### Get Outstanding Advances
```
GET /salary-advances?branchId=branch_123 (optional)

Response:
{
  "summary": {
    "totalIssued": 500000,
    "totalRecovered": 100000,
    "totalOutstanding": 400000,
    "advancesCount": 5,
    "employeesWithAdvances": 3
  },
  "advances": [ ... ]
}
```

### Record Direct Repayment
```
POST /salary-advances/:id/direct-repayment
Content-Type: application/json

{
  "amount": "number (required, > 0, <= outstanding)",
  "date": "ISO date string (optional)",
  "notes": "string (optional)"
}

Response:
{
  "success": true,
  "recovery": {
    "id": "recovery_...",
    "amount": 50000,
    "recoveryType": "direct_repayment"
  },
  "advance": {
    "totalRecovered": 150000,
    "outstandingAmount": 50000,
    "status": "partially_recovered"
  }
}
```

### Cancel Salary Advance
```
POST /salary-advances/:id/cancel
Content-Type: application/json

{
  "reason": "string (required)",
  "date": "ISO date string (optional)"
}

Response:
{
  "success": true,
  "advance": {
    "status": "cancelled",
    "cancelledAt": "2025-08-16T...",
    "cancelReason": "Employee requested"
  }
}
```

---

## Payroll

### Create Payroll
```
POST /payroll
Content-Type: application/json

{
  "employeeId": "string (required)",
  "period": "YYYY-MM (required)",
  "basicSalary": "number (required, >= 0)",
  "allowances": "number (optional, default: 0)",
  "bonus": "number (optional, default: 0)",
  "overtime": "number (optional, default: 0)",
  "otherEarnings": "number (optional, default: 0)",
  "paye": "number (optional, default: 0)",
  "socialSecurityTax": "number (optional, default: 0)",
  "healthInsurance": "number (optional, default: 0)",
  "otherDeductions": "number (optional, default: 0)",
  "salaryAdvanceRecovery": "number (optional, default: 0)",
  "notes": "string (optional)"
}

Response:
{
  "success": true,
  "payroll": {
    "id": "payroll_...",
    "payrollNo": "PAYROLL-001-2025-08",
    "period": "2025-08",
    "status": "draft",
    "grossSalary": 800000,
    "totalDeductions": 320000,
    "netSalary": 480000,
    ...
  }
}
```

### Get Payroll Details
```
GET /payroll/:id

Response:
{
  "id": "payroll_...",
  "employee": { ... },
  "adjustments": [ ... ],
  "deductions": [ ... ],
  "recoveries": [ ... ],
  "payments": [ ... ],
  "journalEntry": { ... }
}
```

### Get Payrolls for Period
```
GET /payroll?period=2025-08&branchId=branch_123 (optional)

Response:
{
  "summary": {
    "period": "2025-08",
    "totalPayrolls": 15,
    "totalGrossSalary": 12000000,
    "totalDeductions": 3000000,
    "totalNetSalary": 9000000,
    "totalPaid": 4500000,
    "byStatus": {
      "draft": 5,
      "approved": 7,
      "posted": 2,
      "paid": 1
    }
  },
  "payrolls": [ ... ]
}
```

### Approve Payroll
```
POST /payroll/:id/approve

Response:
{
  "success": true,
  "payroll": {
    "status": "approved",
    "approvedBy": "user_...",
    "approvedAt": "2025-08-16T..."
  }
}
```

### Post Payroll to Accounting
```
POST /payroll/:id/post

Response:
{
  "success": true,
  "payroll": {
    "status": "posted",
    "postedBy": "user_...",
    "postedAt": "2025-08-16T...",
    "journalEntryId": "je_..."
  },
  "journalEntry": {
    "id": "je_...",
    "entryNo": "JE-20250816-002",
    "sourceType": "PAYROLL",
    "lines": [
      { "accountId": "acc_1", "debit": 800000, "credit": 0, ... },
      { "accountId": "acc_2", "debit": 0, "credit": 480000, ... },
      { "accountId": "acc_3", "debit": 0, "credit": 320000, ... }
    ]
  }
}
```

### Pay Salary
```
POST /payroll/:id/pay
Content-Type: application/json

{
  "amount": "number (required, > 0, <= remaining net salary)",
  "paymentAccountId": "string (required)",
  "paymentMethod": "cash | bank | mobile_money | cheque (optional, default: cash)",
  "referenceNo": "string (optional)"
}

Response:
{
  "success": true,
  "payment": {
    "id": "payment_...",
    "amount": 480000,
    "status": "completed",
    "journalEntryId": "je_..."
  },
  "payroll": {
    "paidAmount": 480000,
    "status": "paid"
  }
}
```

---

## HR Configuration

### Get Configuration
```
GET /config

Response:
{
  "config": {
    "tenantId": "tenant_...",
    "salaryExpenseAccountId": "acc_1",
    "salaryPayableAccountId": "acc_2",
    "salaryAdvanceAccountId": "acc_3",
    "payeTaxAccountId": "acc_4",
    "socialSecurityAccountId": "acc_5",
    "isConfigured": true,
    "configuredBy": "user_...",
    "configuredAt": "2025-08-01T..."
  },
  "isConfigured": true
}
```

### Check Configuration Status
```
GET /config/status

Response:
{
  "isConfigured": true,
  "missingAccounts": [],
  "config": { ... }
}
```

### Get Available Accounts
```
GET /config/available-accounts

Response:
{
  "expenseAccounts": [
    { "id": "acc_...", "code": "6100", "name": "Salaries & Wages", "type": "expense" },
    ...
  ],
  "liabilityAccounts": [
    { "id": "acc_...", "code": "2100", "name": "Salaries Payable", "type": "liability" },
    ...
  ],
  "assetAccounts": [
    { "id": "acc_...", "code": "1250", "name": "Employee Advances", "type": "asset" },
    ...
  ]
}
```

### Update Account Mapping
```
POST /config/mapping
Content-Type: application/json

{
  "salaryExpenseAccountId": "acc_1 (required if setting)",
  "salaryPayableAccountId": "acc_2 (required if setting)",
  "salaryAdvanceAccountId": "acc_3 (required if setting)",
  "payeTaxAccountId": "acc_4 (optional)",
  "socialSecurityAccountId": "acc_5 (optional)"
}

Response:
{
  "success": true,
  "config": {
    "isConfigured": true,
    "salaryExpenseAccountId": "acc_1",
    ...
  }
}
```

### Initialize Default Accounts
```
POST /config/initialize-accounts
Content-Type: application/json

{
  "branchId": "string (required)"
}

Response:
{
  "success": true,
  "accounts": {
    "salaryExpense": { "id": "acc_...", "name": "Staff Salaries & Wages", ... },
    "salaryPayable": { "id": "acc_...", "name": "Salaries Payable", ... },
    "salaryAdvance": { "id": "acc_...", "name": "Employee Salary Advances", ... }
  },
  "config": { ... }
}
```

---

## HR Administration

### Get HR Dashboard
```
GET /dashboard?branchId=branch_123 (optional)

Response:
{
  "employees": {
    "total": 25
  },
  "payroll": {
    "period": "2025-08",
    "total": 25,
    "pending": 5,
    "approved": 7,
    "salaryPayable": 4500000,
    "salaryPaid": 2000000
  },
  "salaryAdvances": {
    "totalIssued": 1000000,
    "totalRecovered": 600000,
    "totalOutstanding": 400000,
    "activeAdvances": 8,
    "employeesWithAdvances": 7,
    "issuedThisMonth": 2
  }
}
```

### Get Employees List
```
GET /employees?branchId=branch_123&status=active (optional filters)

Response:
{
  "employees": [
    {
      "id": "emp_...",
      "firstName": "John",
      "lastName": "Doe",
      "status": "active",
      "salaryConfig": { ... },
      "salaryAdvances": [ ... ]
    },
    ...
  ],
  "total": 25
}
```

### Get Employee Details
```
GET /employees/:id

Response:
{
  "id": "emp_...",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "basicSalary": 700000,
  "salaryConfig": { ... },
  "salaryAdvances": [ ... ],
  "payrollRecords": [ ... ]
}
```

### Update Employee Salary Config
```
PUT /employees/:id/salary-config
Content-Type: application/json

{
  "basicSalary": 700000,
  "transportAllowance": 100000,
  "houseAllowance": 50000,
  "mobileAllowance": 20000,
  "otherAllowances": 0,
  "paye": 80000,
  "socialSecurityTax": 40000,
  "healthInsurance": 20000,
  "otherDeductions": 0
}

Response:
{
  "success": true,
  "config": {
    "basicSalary": 700000,
    "totalAllowances": 170000,
    "grossSalary": 870000,
    "totalDeductions": 140000,
    ...
  }
}
```

### Get Audit Logs
```
GET /audit-logs?recordType=salary_advance&recordId=adv_...&employeeId=emp_...&action=created&limit=100

Response:
{
  "logs": [
    {
      "id": "log_...",
      "recordType": "salary_advance",
      "recordId": "adv_...",
      "action": "created",
      "description": "Salary advance issued: 200000",
      "amount": 200000,
      "userId": "user_...",
      "createdAt": "2025-08-16T...",
      "employee": { "firstName": "John", "lastName": "Doe" }
    },
    ...
  ],
  "total": 15
}
```

### Get Record Audit Trail
```
GET /audit-logs/:recordType/:recordId

Response:
{
  "trail": [
    {
      "action": "created",
      "description": "Salary advance issued: 200000",
      "createdAt": "2025-08-16T10:00:00Z"
    },
    {
      "action": "direct_repayment",
      "description": "Direct repayment of salary advance: 50000",
      "createdAt": "2025-08-17T14:30:00Z"
    }
  ],
  "total": 2
}
```

---

## Error Responses

### Configuration Not Set Up
```json
{
  "success": false,
  "error": "Salary Advance Account Not Configured",
  "missingAccounts": ["salaryAdvance"]
}
```

### Invalid Amount
```json
{
  "success": false,
  "error": "Cannot recover more than outstanding advance (200,000)"
}
```

### Duplicate Payroll
```json
{
  "success": false,
  "error": "Payroll already exists for employee_id in period 2025-08"
}
```

### Account Type Mismatch
```json
{
  "success": false,
  "error": "Account type validation failed",
  "validation": [
    {
      "field": "salaryExpenseAccountId",
      "error": "Must be an Expense type account"
    }
  ]
}
```

---

## Status Codes

- **200**: Successful GET
- **201**: Successful POST (resource created)
- **400**: Bad request (validation error)
- **404**: Resource not found
- **500**: Server error

## Important Notes

1. **All amounts are in UGX** (Uganda Shilling)
2. **Dates are ISO 8601 format** (2025-08-16T10:30:00Z)
3. **Period format is YYYY-MM** (2025-08)
4. **All financial operations are transactional** (atomic)
5. **Reversals never delete** entries, they create offsetting entries
6. **Double-post prevention** via sourceType + sourceId uniqueness

## Common Workflow

```
1. Ensure HR Accounting is configured
   GET /config/status → Check isConfigured

2. Issue salary advance to employee
   POST /salary-advances → Get advance ID

3. Create payroll
   POST /payroll → Get payroll ID (status: draft)

4. Approve payroll
   POST /payroll/:id/approve → Status: approved

5. Post payroll to accounting
   POST /payroll/:id/post → Status: posted, creates journal entry

6. Pay salary
   POST /payroll/:id/pay → Status: paid or partially_paid

7. Check audit trail
   GET /audit-logs/:recordType/:recordId
```
