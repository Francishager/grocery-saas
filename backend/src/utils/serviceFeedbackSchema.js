import { readFile } from 'node:fs/promises';
import prisma from '../db.js';

let ready;

// Docker serves requests while its schema sync runs. Prepare these additive
// changes before querying new columns, including for existing businesses.
export function ensureServiceFeedbackSchema() {
  if (!ready) {
    ready = (async () => {
      const sql = await readFile(new URL('../../prisma/migrations/20260921120000_service_feedback_qr/migration.sql', import.meta.url), 'utf8');
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2092112000)');
        for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
          await tx.$executeRawUnsafe(statement);
        }
      }, { timeout: 30000 });
    })().catch(error => { ready = undefined; throw error; });
  }
  return ready;
}
