import prisma from '../db.js';
import { readFile } from 'node:fs/promises';

try {
  // Check if table already exists
  const existingTable = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'subscription_payment_refunds'
    );
  `);

  if (existingTable[0].exists) {
    console.log('Subscription payment refund schema already exists.');
  } else {
    const sql = await readFile(new URL('../../prisma/migrations/20261020120000_subscription_payment_refunds/migration.sql', import.meta.url), 'utf8');
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    }, { timeout: 30000 });
    console.log('Subscription payment refund schema ready.');
  }
} catch (error) {
  console.error('Unable to prepare subscription payment refunds schema.', error.code || '');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
