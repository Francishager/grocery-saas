import prisma from '../db.js';
import { readFile } from 'node:fs/promises';

try {
  const sql = await readFile(new URL('../../prisma/migrations/20261021120000_audit_subject_branch_context/migration.sql', import.meta.url), 'utf8');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
  }, { timeout: 30000 });
  console.log('Audit subject and branch schema ready.');
} catch (error) {
  console.error('Unable to prepare audit subject and branch schema.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
