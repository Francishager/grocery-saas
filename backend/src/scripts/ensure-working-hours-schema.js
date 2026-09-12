import prisma from '../db.js';

// Additive and idempotent: existing businesses inherit unrestricted access (NULL).
try {
  const columns = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'workingHours'
      AND table_name IN ('tenants', 'users')
  `;
  if (columns.length !== 2) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
      await tx.$executeRaw`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "workingHours" JSONB`;
      await tx.$executeRaw`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workingHours" JSONB`;
    }, { timeout: 30000 });
  }
  console.log('Working-hours schema ready.');
} catch (error) {
  console.error('Unable to prepare working-hours schema. Apply the working-hours migration before starting the backend.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
