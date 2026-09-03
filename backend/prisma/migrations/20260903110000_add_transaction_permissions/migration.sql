ALTER TABLE "user_permissions"
  ADD COLUMN "canViewTransactionAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canUseAnyTransactionAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canUseOtherCashAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateTransactionAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canEditTransactionAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canDeleteTransactionAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateWithdrawal" BOOLEAN NOT NULL DEFAULT false;
