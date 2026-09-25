ALTER TABLE "subscription_payments"
    ALTER COLUMN "paidAt" DROP DEFAULT,
    ALTER COLUMN "paidAt" DROP NOT NULL,
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed',
    ADD COLUMN "provider" TEXT,
    ADD COLUMN "gatewayPaymentMethod" TEXT,
    ADD COLUMN "merchantReference" TEXT,
    ADD COLUMN "gatewayTrackingId" TEXT,
    ADD COLUMN "checkoutUrl" TEXT,
    ADD COLUMN "checkoutReturnPath" TEXT,
    ADD COLUMN "payerName" TEXT,
    ADD COLUMN "payerPhone" TEXT,
    ADD COLUMN "payerEmail" TEXT;

CREATE UNIQUE INDEX "subscription_payments_merchantReference_key" ON "subscription_payments"("merchantReference");
CREATE UNIQUE INDEX "subscription_payments_gatewayTrackingId_key" ON "subscription_payments"("gatewayTrackingId");
