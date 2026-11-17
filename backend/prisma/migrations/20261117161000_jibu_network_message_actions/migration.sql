ALTER TABLE "jibu_network_messages"
  ADD COLUMN "replyToMessageId" TEXT;

ALTER TABLE "jibu_network_messages"
  ADD CONSTRAINT "jibu_network_messages_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId") REFERENCES "jibu_network_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "jibu_network_messages_replyToMessageId_idx"
  ON "jibu_network_messages"("replyToMessageId");

CREATE TABLE "jibu_network_message_reactions" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jibu_network_message_reactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jibu_network_message_reactions_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "jibu_network_messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "jibu_network_message_reactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "jibu_network_message_reactions_messageId_userId_key"
  ON "jibu_network_message_reactions"("messageId", "userId");
CREATE INDEX "jibu_network_message_reactions_messageId_idx"
  ON "jibu_network_message_reactions"("messageId");
