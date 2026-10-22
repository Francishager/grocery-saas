import prisma from '../db.js';
import { REPORT_PERMISSION_ITEMS, reportPermissionKey } from '../utils/permissions.js';

try {
  const existing = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'user_permissions'
  `;
  const existingColumns = new Set(existing.map(({ column_name }) => column_name));
  const missingByLegacyPermission = new Map();
  for (const [id, , , , legacyPermission] of REPORT_PERMISSION_ITEMS) {
    const column = reportPermissionKey(id);
    if (existingColumns.has(column)) continue;
    await prisma.$executeRawUnsafe(`ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "${column}" BOOLEAN NOT NULL DEFAULT false`);
    if (!missingByLegacyPermission.has(legacyPermission)) missingByLegacyPermission.set(legacyPermission, []);
    missingByLegacyPermission.get(legacyPermission).push(column);
  }
  for (const [legacyPermission, columns] of missingByLegacyPermission) {
    const assignments = columns.map((column) => `"${column}" = true`).join(', ');
    await prisma.$executeRawUnsafe(`UPDATE "user_permissions" SET ${assignments} WHERE "${legacyPermission}" = true`);
  }
  console.log('Granular report permission columns are ready.');
} catch (error) {
  console.error('Failed to ensure granular report permission columns:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
