import prisma from '../db.js';
import { readFile } from 'node:fs/promises';

try {
  const sql = await readFile(new URL('../../prisma/migrations/20260928100000_tenant_trash/migration.sql', import.meta.url), 'utf8');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
  }, { timeout: 30000 });
  console.log('Tenant Trash schema ready.');
} catch (error) {
  console.error('Unable to prepare Tenant Trash. Apply the tenant trash migration before starting.', error.code || '');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
