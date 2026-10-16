ALTER TABLE "business_messages"
  ADD COLUMN "replyToMessageId" TEXT;

ALTER TABLE "business_messages"
  ADD CONSTRAINT "business_messages_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId") REFERENCES "business_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "business_messages_replyToMessageId_idx"
  ON "business_messages"("replyToMessageId");

CREATE TABLE "business_message_reactions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_message_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_message_reactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "business_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_message_reactions_messageId_userId_key"
  ON "business_message_reactions"("messageId", "userId");
CREATE INDEX "business_message_reactions_tenantId_messageId_idx"
  ON "business_message_reactions"("tenantId", "messageId");
