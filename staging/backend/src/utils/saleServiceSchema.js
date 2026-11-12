import { readFile } from 'node:fs/promises';
import prisma from '../db.js';

let prepared;
export function ensureSaleServiceSchema() {
  if (!prepared) {
    prepared = (async () => {
      const sql = await readFile(new URL('../../prisma/migrations/20260922180000_sale_service_jobs/migration.sql', import.meta.url), 'utf8');
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2092218000)');
        for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      }, { timeout: 30000 });
    })().catch(error => { prepared = undefined; throw error; });
  }
  return prepared;
}
