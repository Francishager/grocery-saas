CREATE TABLE "business_conversations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "participantOneId" TEXT NOT NULL,
  "participantTwoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_conversations_distinct_participants" CHECK ("participantOneId" <> "participantTwoId"),
  CONSTRAINT "business_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_conversations_participantOneId_fkey" FOREIGN KEY ("participantOneId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_conversations_participantTwoId_fkey" FOREIGN KEY ("participantTwoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "business_conversations_tenantId_participantOneId_participantTwoId_key"
  ON "business_conversations"("tenantId", "participantOneId", "participantTwoId");
CREATE INDEX "business_conversations_tenantId_updatedAt_idx"
  ON "business_conversations"("tenantId", "updatedAt");
CREATE INDEX "business_conversations_tenantId_participantOneId_updatedAt_idx"
  ON "business_conversations"("tenantId", "participantOneId", "updatedAt");
CREATE INDEX "business_conversations_tenantId_participantTwoId_updatedAt_idx"
  ON "business_conversations"("tenantId", "participantTwoId", "updatedAt");

CREATE TABLE "business_messages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "business_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "business_messages_conversationId_createdAt_idx"
  ON "business_messages"("conversationId", "createdAt");
CREATE INDEX "business_messages_tenantId_recipientId_readAt_idx"
  ON "business_messages"("tenantId", "recipientId", "readAt");
