CREATE TABLE IF NOT EXISTS "advisor_collections" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'project', "instructions" TEXT NOT NULL DEFAULT '',
  "parentId" TEXT REFERENCES "advisor_collections"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "advisor_collections_tenantId_userId_idx" ON "advisor_collections"("tenantId", "userId");
CREATE TABLE IF NOT EXISTS "advisor_conversations" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "collectionId" TEXT REFERENCES "advisor_collections"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL DEFAULT 'New chat', "scopeKey" TEXT NOT NULL,
  "memory" TEXT NOT NULL DEFAULT '', "memoryThrough" INTEGER NOT NULL DEFAULT 0,
  "nextSequence" INTEGER NOT NULL DEFAULT 1, "busyUntil" TIMESTAMP(3), "activeRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "advisor_conversations_tenantId_userId_updatedAt_idx" ON "advisor_conversations"("tenantId", "userId", "updatedAt");
CREATE TABLE IF NOT EXISTS "advisor_turns" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES "advisor_conversations"("id") ON DELETE CASCADE,
  "requestId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "input" TEXT NOT NULL, "output" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending', "context" JSONB, "truncated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "advisor_turns_conversationId_requestId_key" ON "advisor_turns"("conversationId", "requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "advisor_turns_conversationId_sequence_key" ON "advisor_turns"("conversationId", "sequence");
