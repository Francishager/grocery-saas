import prisma from '../db.js';

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(2026110301)');
    await tx.$executeRawUnsafe(`
      ALTER TABLE "products"
      ALTER COLUMN "quantity" TYPE DECIMAL(18, 3)
      USING ROUND("quantity"::numeric, 3),
      ALTER COLUMN "quantity" SET DEFAULT 0,
      ALTER COLUMN "quantity" SET NOT NULL
    `);
  }, { timeout: 30000 });
  console.log('Fractional product stock schema is ready (3 decimal places).');
} catch (error) {
  console.error('Unable to prepare fractional product stock schema:', error.code || '', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
