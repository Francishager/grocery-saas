CREATE TABLE "subscription_payment_refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "recordedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_payment_refunds_paymentId_refundedAt_idx"
ON "subscription_payment_refunds"("paymentId", "refundedAt");

ALTER TABLE "subscription_payment_refunds"
ADD CONSTRAINT "subscription_payment_refunds_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "subscription_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
