ALTER TABLE "advisor_turns" ADD COLUMN IF NOT EXISTS "feedback" INTEGER;
ALTER TABLE "advisor_turns" ADD COLUMN IF NOT EXISTS "feedbackUpdatedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "advisor_artifacts" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "advisor_conversations"("id") ON DELETE CASCADE,
  "requestId" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "leaseToken" TEXT, "busyUntil" TIMESTAMP(3),
  "data" JSONB, "image" BYTEA, "imageMime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "advisor_artifacts_conversationId_requestId_key" ON "advisor_artifacts"("conversationId", "requestId");
CREATE INDEX IF NOT EXISTS "advisor_artifacts_conversationId_createdAt_idx" ON "advisor_artifacts"("conversationId", "createdAt");
