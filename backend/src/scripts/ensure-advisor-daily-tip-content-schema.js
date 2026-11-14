import prisma from '../db.js';

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026111402)');
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "advisor_daily_tip_contents" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "tipDate" TEXT NOT NULL,
        "slot" TEXT NOT NULL,
        "businessType" TEXT,
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "advisor_daily_tip_contents_pkey" PRIMARY KEY ("id")
      )
    `);
    await tx.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "advisor_daily_tip_contents_tenantId_tipDate_slot_key"
      ON "advisor_daily_tip_contents"("tenantId", "tipDate", "slot")
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "advisor_daily_tip_contents_tenantId_createdAt_idx"
      ON "advisor_daily_tip_contents"("tenantId", "createdAt")
    `);
  }, { timeout: 30000 });
  console.log('AI Advisor daily tip cache schema is ready.');
} catch (error) {
  console.error('Unable to prepare AI Advisor daily tip cache schema:', error.code || '', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
