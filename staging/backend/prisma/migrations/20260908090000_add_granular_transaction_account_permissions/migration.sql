ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canUseOwnCashAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseOtherStaffCashAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseSafeAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseBankAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseMobileMoneyAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canUseCardAccount" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_permissions"
SET
  "canUseOwnCashAccount" = "canUseOwnCashAccount" OR COALESCE("canUseCash", false),
  "canUseOtherStaffCashAccount" = "canUseOtherStaffCashAccount" OR COALESCE("canUseOtherCashAccount", false) OR COALESCE("canUseAnyTransactionAccount", false),
  "canUseSafeAccount" = "canUseSafeAccount" OR COALESCE("canUseOtherCashAccount", false) OR COALESCE("canUseAnyTransactionAccount", false),
  "canUseBankAccount" = "canUseBankAccount" OR COALESCE("canUseBank", false) OR COALESCE("canUseAnyTransactionAccount", false),
  "canUseMobileMoneyAccount" = "canUseMobileMoneyAccount" OR COALESCE("canUseMobileMoney", false) OR COALESCE("canUseAnyTransactionAccount", false),
  "canUseCardAccount" = "canUseCardAccount" OR COALESCE("canUseCard", false) OR COALESCE("canUseAnyTransactionAccount", false);
ALTER TABLE "customer_payments"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_payments_idempotencyKey_key"
  ON "customer_payments"("idempotencyKey");
