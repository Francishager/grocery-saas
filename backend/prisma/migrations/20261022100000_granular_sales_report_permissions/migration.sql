ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewReportSalesSummary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesDaily" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesWeekly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesMonthly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesByProduct" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesByCategory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesByCustomer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesByUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesServiceJobs" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesByBranch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesDiscounts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewReportSalesReturns" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_permissions"
SET "canViewReportSalesSummary" = true,
    "canViewReportSalesDaily" = true,
    "canViewReportSalesWeekly" = true,
    "canViewReportSalesMonthly" = true,
    "canViewReportSalesByProduct" = true,
    "canViewReportSalesByCategory" = true,
    "canViewReportSalesByCustomer" = true,
    "canViewReportSalesByUser" = true,
    "canViewReportSalesServiceJobs" = true,
    "canViewReportSalesByBranch" = true,
    "canViewReportSalesDiscounts" = true,
    "canViewReportSalesReturns" = true
WHERE "canViewSalesReport" = true;
