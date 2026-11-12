import prisma from '../db.js'

try {
  const statements = [
    `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "securitySetupCompletedAt" TIMESTAMP(3)`,
    `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS "businessSwitchSecurityMethod" TEXT`,
    `CREATE TABLE IF NOT EXISTS security_passkeys (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "credentialId" TEXT NOT NULL UNIQUE,
      "rpId" TEXT NOT NULL DEFAULT '',
      "publicKey" BYTEA NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "deviceType" TEXT NOT NULL DEFAULT 'singleDevice',
      "backedUp" BOOLEAN NOT NULL DEFAULT FALSE,
      name TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastUsedAt" TIMESTAMP(3)
    )`,
    `ALTER TABLE security_passkeys ADD COLUMN IF NOT EXISTS "rpId" TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS security_passkeys_user_created_idx ON security_passkeys ("userId", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS user_security_challenges (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge TEXT NOT NULL,
      purpose TEXT NOT NULL,
      "targetTenantId" TEXT,
      origin TEXT NOT NULL DEFAULT '',
      "rpId" TEXT NOT NULL DEFAULT '',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE user_security_challenges ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE user_security_challenges ADD COLUMN IF NOT EXISTS "rpId" TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS user_security_challenges_user_purpose_expiry_idx ON user_security_challenges ("userId", purpose, "expiresAt")`,
  ]
  for (const statement of statements) await prisma.$executeRawUnsafe(statement)
  console.log('Mandatory user security enrollment schema is ready.')
} catch (error) {
  console.error('Unable to prepare user security enrollment schema:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
