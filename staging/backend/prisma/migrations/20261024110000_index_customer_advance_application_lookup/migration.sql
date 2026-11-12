CREATE INDEX IF NOT EXISTS "journal_lines_accountId_entryId_idx"
ON "journal_lines"("accountId", "entryId");
