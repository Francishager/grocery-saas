import prisma from '../db.js'

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS financial_year_closes (
    id TEXT PRIMARY KEY,
    "tenantId" TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    snapshot JSONB NOT NULL,
    "lifecycleEvents" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdById" TEXT NOT NULL,
    "signedOffById" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT financial_year_closes_tenant_period_key UNIQUE ("tenantId", "startDate", "endDate")
  )`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS financial_year_closes_tenant_status_period_idx ON financial_year_closes ("tenantId", status, "startDate", "endDate")`)
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION jibusales_guard_closed_financial_year_journal() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD."tenantId" <> NEW."tenantId" THEN
        RAISE EXCEPTION 'A journal entry cannot be moved between business accounts.' USING ERRCODE = '55000';
      END IF;
      PERFORM pg_advisory_xact_lock(981273, hashtext(CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantId" ELSE NEW."tenantId" END));
      IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'posted' AND EXISTS (SELECT 1 FROM financial_year_closes fy WHERE fy.status = 'closed' AND OLD.date::date BETWEEN fy."startDate"::date AND fy."endDate"::date) THEN
          RAISE EXCEPTION 'This posting date belongs to a closed financial year. Reopen the period with authorization before changing its ledger.' USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND EXISTS (SELECT 1 FROM financial_year_closes fy WHERE fy.status = 'closed' AND OLD.date::date BETWEEN fy."startDate"::date AND fy."endDate"::date) THEN
        RAISE EXCEPTION 'This posting date belongs to a closed financial year. Reopen the period with authorization before changing its ledger.' USING ERRCODE = '55000';
      END IF;
      IF NEW.status = 'posted' AND EXISTS (SELECT 1 FROM financial_year_closes fy WHERE fy.status = 'closed' AND NEW.date::date BETWEEN fy."startDate"::date AND fy."endDate"::date) THEN
        RAISE EXCEPTION 'This posting date belongs to a closed financial year. Reopen the period with authorization before changing its ledger.' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`)
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS journal_entries_closed_year_guard ON journal_entries')
  await prisma.$executeRawUnsafe(`CREATE TRIGGER journal_entries_closed_year_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION jibusales_guard_closed_financial_year_journal()`)
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION jibusales_guard_closed_financial_year_journal_lines() RETURNS trigger AS $$
    DECLARE parent_id TEXT;
    DECLARE parent_tenant_id TEXT;
    BEGIN
      parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."entryId" ELSE NEW."entryId" END;
      SELECT je."tenantId" INTO parent_tenant_id FROM journal_entries je WHERE je.id = parent_id;
      IF parent_tenant_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(981273, hashtext(parent_tenant_id));
      END IF;
      IF EXISTS (
        SELECT 1 FROM journal_entries je JOIN financial_year_closes fy ON fy.status = 'closed'
        WHERE je.id = parent_id AND je.status = 'posted' AND je.date::date BETWEEN fy."startDate"::date AND fy."endDate"::date
      ) THEN
        RAISE EXCEPTION 'Journal lines in a closed financial year cannot be changed. Reopen the period with authorization first.' USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`)
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS journal_lines_closed_year_guard ON journal_lines')
  await prisma.$executeRawUnsafe(`CREATE TRIGGER journal_lines_closed_year_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
    FOR EACH ROW EXECUTE FUNCTION jibusales_guard_closed_financial_year_journal_lines()`)
  console.log('Financial-year close storage and ledger period guards are ready.')
} catch (error) {
  console.error('Unable to prepare financial-year close storage:', error.code || error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
