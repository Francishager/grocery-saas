ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewCustomerPhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerAddress" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerBalance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerSalesHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerPaymentsHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerReturnsHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerCreditNotesHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerWithdrawalsHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewCustomerBusinessActivity" BOOLEAN NOT NULL DEFAULT false;
