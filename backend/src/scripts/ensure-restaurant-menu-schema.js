import prisma from '../db.js';
import { readFile } from 'node:fs/promises';

try {
  // Check if table already exists
  const existingTable = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'restaurant_menu_entries'
    );
  `);

  if (existingTable[0].exists) {
    console.log('Restaurant menu catalog schema already exists.');
  } else {
    const sql = await readFile(new URL('../../prisma/migrations/20261023130000_restaurant_menu_catalog/migration.sql', import.meta.url), 'utf8');
    const statements = sql.split(';').map(value => value.trim()).filter(Boolean);
    
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '15s'");
      // Execute only CREATE TABLE and INDEX statements, skip INSERT to avoid data issues
      for (const statement of statements) {
        if (!statement.toUpperCase().startsWith('INSERT')) {
          await tx.$executeRawUnsafe(statement);
        }
      }
    }, { timeout: 30000 });
    console.log('Restaurant menu catalog schema ready.');
  }
} catch (error) {
  // Log error but don't exit - allow server to start
  console.error('Unable to prepare restaurant menu catalog schema.', error.code || '');
  process.exitCode = 0;
} finally {
  await prisma.$disconnect();
}
