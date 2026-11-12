import prisma from '../db.js';
import { ALL_PERMISSION_KEYS } from '../utils/permissions.js';

const permissionColumns = [...new Set(ALL_PERMISSION_KEYS)].filter(key => /^can[A-Za-z0-9]+$/.test(key));

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026110101)');
    const additions = permissionColumns.map(column => `ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN NOT NULL DEFAULT false`).join(', ');
    await tx.$executeRawUnsafe(`ALTER TABLE "user_permissions" ${additions}`);
    const nullChecks = permissionColumns.map(column => `"${column}" IS NULL`).join(' OR ');
    const falseAssignments = permissionColumns.map(column => `"${column}" = COALESCE("${column}", false)`).join(', ');
    await tx.$executeRawUnsafe(`UPDATE "user_permissions" SET ${falseAssignments} WHERE ${nullChecks}`);
    const constraints = permissionColumns.map(column => `ALTER COLUMN "${column}" SET DEFAULT false, ALTER COLUMN "${column}" SET NOT NULL`).join(', ');
    await tx.$executeRawUnsafe(`ALTER TABLE "user_permissions" ${constraints}`);
    await tx.$executeRawUnsafe('ALTER TABLE IF EXISTS "property_rent_payments" ADD COLUMN IF NOT EXISTS "mobileProvider" TEXT');
    await tx.$executeRawUnsafe('ALTER TABLE IF EXISTS "property_rent_payments" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT');
  }, { timeout: 30000 });
  console.log('Payment permission and rent mobile-money columns are ready.');
} catch (error) {
  console.error('Failed to ensure payment permission and rent mobile-money columns:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
