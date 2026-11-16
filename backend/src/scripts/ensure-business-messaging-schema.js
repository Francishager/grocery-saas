import prisma from '../db.js';

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS business_conversations (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "participantOneId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "participantTwoId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "participantOneTypingAt" TIMESTAMP(3),
    "participantTwoTypingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_conversations_distinct_participants CHECK ("participantOneId" <> "participantTwoId")
  )`);
  await prisma.$executeRawUnsafe('ALTER TABLE business_conversations ADD COLUMN IF NOT EXISTS "participantOneTypingAt" TIMESTAMP(3)');
  await prisma.$executeRawUnsafe('ALTER TABLE business_conversations ADD COLUMN IF NOT EXISTS "participantTwoTypingAt" TIMESTAMP(3)');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "business_conversations_tenantId_participantOneId_participantTwoId_key" ON business_conversations ("tenantId", "participantOneId", "participantTwoId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_conversations_tenantId_updatedAt_idx" ON business_conversations ("tenantId", "updatedAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_conversations_tenantId_participantOneId_updatedAt_idx" ON business_conversations ("tenantId", "participantOneId", "updatedAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_conversations_tenantId_participantTwoId_updatedAt_idx" ON business_conversations ("tenantId", "participantTwoId", "updatedAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS business_messages (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "conversationId" TEXT NOT NULL REFERENCES business_conversations(id) ON DELETE CASCADE,
    "senderId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "recipientId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    "replyToMessageId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe('ALTER TABLE business_messages ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE business_messages ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_messages_conversationId_createdAt_idx" ON business_messages ("conversationId", "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_messages_tenantId_recipientId_readAt_idx" ON business_messages ("tenantId", "recipientId", "readAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_messages_replyToMessageId_idx" ON business_messages ("replyToMessageId")');
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_messages_replyToMessageId_fkey') THEN
      ALTER TABLE business_messages ADD CONSTRAINT "business_messages_replyToMessageId_fkey"
        FOREIGN KEY ("replyToMessageId") REFERENCES business_messages(id) ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS business_message_reactions (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "messageId" TEXT NOT NULL REFERENCES business_messages(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "business_message_reactions_messageId_userId_key" ON business_message_reactions ("messageId", "userId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "business_message_reactions_tenantId_messageId_idx" ON business_message_reactions ("tenantId", "messageId")');

  console.log('Private business messaging tables, delivery fields, replies, and reactions are ready.');
} catch (error) {
  console.error('Unable to prepare private business messaging schema:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
