ALTER TABLE "subscription_payments"
    ADD COLUMN "cancelledAt" TIMESTAMP(3),
    ADD COLUMN "cancelledById" TEXT,
    ADD COLUMN "cancelledByEmail" TEXT,
    ADD COLUMN "cancellationReason" TEXT;
