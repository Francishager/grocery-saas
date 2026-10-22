import prisma from '../db.js';
import { readFile } from 'node:fs/promises';

try {
  const sql = await readFile(new URL('../../prisma/migrations/20261023130000_restaurant_menu_catalog/migration.sql', import.meta.url), 'utf8');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
      await tx.$executeRawUnsafe(statement);
    }
  }, { timeout: 30000 });
  console.log('Restaurant menu catalog schema ready.');
} catch (error) {
  console.error('Unable to prepare restaurant menu catalog schema.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
