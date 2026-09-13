import prisma from '../db.js';
import { readFile } from 'node:fs/promises';

// Additive and idempotent: existing businesses inherit unrestricted access (NULL).
try {
  const columns = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND (
      (column_name = 'workingHours' AND table_name IN ('tenants', 'users'))
      OR (column_name = 'canUseBusinessAI' AND table_name = 'user_permissions')
    )
  `;
  if (columns.length !== 3) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
      await tx.$executeRaw`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "workingHours" JSONB`;
      await tx.$executeRaw`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workingHours" JSONB`;
      await tx.$executeRaw`ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "canUseBusinessAI" BOOLEAN NOT NULL DEFAULT false`;
    }, { timeout: 30000 });
  }
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const migration of ['20260913120000_advisor_memory', '20260913150000_advisor_creative_tools']) {
      const sql = await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8');
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    }
  }, { timeout: 30000 });
  console.log('Business access and advisor memory schema ready.');
} catch (error) {
  console.error('Unable to prepare business access schema. Apply pending access migrations before starting the backend.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
