import prisma from '../db.js';

try {
  await prisma.$executeRawUnsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS "jibuId" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS "jibuCountryCode" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS "jibuNetworkEnabled" BOOLEAN NOT NULL DEFAULT FALSE');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS users_jibu_id_key ON users ("jibuId")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_conversations (
    id TEXT PRIMARY KEY,
    "participantOneId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "participantTwoId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "requestedById" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jibu_network_conversations_distinct_participants CHECK ("participantOneId" <> "participantTwoId"),
    CONSTRAINT jibu_network_conversations_requester_participant CHECK ("requestedById" IN ("participantOneId", "participantTwoId"))
  )`);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS jibu_network_conversations_pair_key ON jibu_network_conversations ("participantOneId", "participantTwoId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_conversations_one_status_updated_idx ON jibu_network_conversations ("participantOneId", status, "updatedAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_conversations_two_status_updated_idx ON jibu_network_conversations ("participantTwoId", status, "updatedAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_messages (
    id TEXT PRIMARY KEY,
    "conversationId" TEXT NOT NULL REFERENCES jibu_network_conversations(id) ON DELETE CASCADE,
    "senderId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_messages_conversation_created_idx ON jibu_network_messages ("conversationId", "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_messages_sender_created_idx ON jibu_network_messages ("senderId", "createdAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_contacts (
    id TEXT PRIMARY KEY,
    "ownerId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "contactUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jibu_network_contacts_not_self CHECK ("ownerId" <> "contactUserId")
  )`);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS jibu_network_contacts_owner_contact_key ON jibu_network_contacts ("ownerId", "contactUserId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_contacts_owner_created_idx ON jibu_network_contacts ("ownerId", "createdAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_follows (
    id TEXT PRIMARY KEY,
    "followerId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "followeeId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jibu_network_follows_not_self CHECK ("followerId" <> "followeeId")
  )`);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS jibu_network_follows_pair_key ON jibu_network_follows ("followerId", "followeeId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_follows_followee_created_idx ON jibu_network_follows ("followeeId", "createdAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_updates (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT 'emerald',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe('ALTER TABLE jibu_network_updates ADD COLUMN IF NOT EXISTS "imageUrl" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE jibu_network_updates ADD COLUMN IF NOT EXISTS "imagePublicId" TEXT');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_updates_user_expiry_created_idx ON jibu_network_updates ("userId", "expiresAt", "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_updates_expiry_idx ON jibu_network_updates ("expiresAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_blocks (
    id TEXT PRIMARY KEY,
    "blockerId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "blockedUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jibu_network_blocks_not_self CHECK ("blockerId" <> "blockedUserId")
  )`);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS jibu_network_blocks_pair_key ON jibu_network_blocks ("blockerId", "blockedUserId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_blocks_blocked_idx ON jibu_network_blocks ("blockedUserId")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_reports (
    id TEXT PRIMARY KEY,
    "reporterId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "reportedUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "conversationId" TEXT,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jibu_network_reports_not_self CHECK ("reporterId" <> "reportedUserId")
  )`);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_reports_status_created_idx ON jibu_network_reports (status, "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_reports_reported_created_idx ON jibu_network_reports ("reportedUserId", "createdAt")');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS jibu_network_rate_limits (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0)
  )`);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS jibu_network_rate_limits_user_action_window_key ON jibu_network_rate_limits ("userId", action, "windowStart")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS jibu_network_rate_limits_window_idx ON jibu_network_rate_limits ("windowStart")');

  await prisma.feature.upsert({
    where: { name: 'social_network' },
    create: { name: 'social_network', displayName: 'JibuSales Network', description: 'Opt-in cross-business chats, status updates and following feed with request acceptance and user safety controls.', module: 'social_network', category: 'module', isActive: true },
    update: { displayName: 'JibuSales Network', description: 'Opt-in cross-business chats, status updates and following feed with request acceptance and user safety controls.', module: 'social_network', category: 'module', isActive: true },
  });
  console.log('JibuSales Network additive schema and opt-in feature are ready. Existing plans remain unchanged.');
} catch (error) {
  console.error('Unable to prepare JibuSales Network schema:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
