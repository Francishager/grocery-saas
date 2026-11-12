ALTER TABLE "user_permissions"
  ADD COLUMN IF NOT EXISTS "canApplyReceivableReconciliation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "customer_receivable_reconciliation_reviews"
  DROP CONSTRAINT IF EXISTS "customer_receivable_reconciliation_reviews_decision_check";

ALTER TABLE "customer_receivable_reconciliation_reviews"
  ADD CONSTRAINT "customer_receivable_reconciliation_reviews_decision_check"
  CHECK ("decision" IN (
    'sale_amount_confirmed',
    'receipt_rows_confirmed',
    'requires_adjustment',
    'investigate_duplicate',
    'receipts_confirmed_and_sale_projection_reconciled'
  ));
