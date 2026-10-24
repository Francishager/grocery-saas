ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canViewCustomerNotes" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canRecordCustomerPayment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canPrintCustomerReceipts" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_permissions"
SET "canViewCustomerNotes" = "canViewCustomer";

UPDATE "user_permissions"
SET "canRecordCustomerPayment" = "canCreateReceivable";

UPDATE "user_permissions"
SET "canPrintCustomerReceipts" =
  "canViewCustomerSalesHistory" OR "canViewCustomerPaymentsHistory" OR
  "canViewCustomerReturnsHistory" OR "canViewCustomerCreditNotesHistory" OR
  "canViewCustomerWithdrawalsHistory";
