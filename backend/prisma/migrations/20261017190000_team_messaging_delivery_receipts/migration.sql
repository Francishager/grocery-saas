ALTER TABLE "users"
  ADD COLUMN "teamMessagingLastSeenAt" TIMESTAMP(3);

ALTER TABLE "business_messages"
  ADD COLUMN "deliveredAt" TIMESTAMP(3);
