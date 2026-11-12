ALTER TABLE "employees"
  ADD COLUMN "salaryPayableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "openingSalaryAdvanceBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "openingSalaryPayableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "openingHrBalanceDate" TIMESTAMP(3),
  ADD COLUMN "openingHrBalanceNote" TEXT;

ALTER TABLE "salary_advances"
  ADD COLUMN "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "paymentAccountId" DROP NOT NULL;

UPDATE "employees" employee
SET "salaryPayableBalance" = COALESCE((
  SELECT SUM(GREATEST(payroll."netSalary" - payroll."paidAmount", 0))
  FROM "payroll" payroll
  WHERE payroll."employeeId" = employee."id"
    AND payroll."tenantId" = employee."tenantId"
    AND payroll."status" IN ('posted', 'partially_paid', 'paid')
), 0);
