import prisma from '../db.js';

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

try {
  const tenantTable = await prisma.$queryRawUnsafe(`
    SELECT c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'Tenant' AND c.relkind = 'r'
    LIMIT 1
  `);

  if (tenantTable.length) {
    const uniqueConstraints = await prisma.$queryRawUnsafe(`
      SELECT con.conname AS name
      FROM pg_constraint con
      JOIN pg_class tbl ON tbl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE ns.nspname = 'public'
        AND tbl.relname = 'Tenant'
        AND con.contype = 'u'
        AND (
          SELECT array_agg(att.attname::text ORDER BY column_key.ordinality)
          FROM unnest(con.conkey) WITH ORDINALITY AS column_key(attnum, ordinality)
          JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = column_key.attnum
        ) = ARRAY['email']::text[]
    `);

    for (const constraint of uniqueConstraints) {
      await prisma.$executeRawUnsafe(`ALTER TABLE public."Tenant" DROP CONSTRAINT ${quoteIdentifier(constraint.name)}`);
    }

    const uniqueIndexes = await prisma.$queryRawUnsafe(`
      SELECT idx_ns.nspname AS schema_name, idx.relname AS index_name
      FROM pg_index i
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
      JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum::text = i.indkey::text
      WHERE tbl_ns.nspname = 'public'
        AND tbl.relname = 'Tenant'
        AND i.indisunique
        AND NOT i.indisprimary
        AND i.indnkeyatts = 1
        AND i.indnatts = 1
        AND att.attname = 'email'
    `);

    for (const index of uniqueIndexes) {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${quoteIdentifier(index.schema_name)}.${quoteIdentifier(index.index_name)}`);
    }
  }

  console.log('Tenant contact email uniqueness repair complete; owner login email remains unique.');
} catch (error) {
  console.error('Unable to relax tenant contact email uniqueness:', error.code || '', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
