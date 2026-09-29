# Receivables GL migration (operator runbook)

Automatic receivables posting is tenant opt-in. Configure the seven accounts on **Tenant > Receivables > Payment Reconciliation** and enable it only after review. New posting is transactional and source-linked; existing tenant records are not silently backfilled at deploy time.

Historical journals require a reviewed plan. Run from `backend/` using an environment that points to the intended database:

```powershell
node scripts/receivables-gl-migration.mjs --tenant <tenant-id> --plan-out .\receivables-plan.json --signoff-template .\receivables-signoff.json
```

Review both files. The plan lists postable missing journals, already-posted records, and blocked/ambiguous records. It scans existing tenant journals for matching source ids, references, entry numbers, or descriptions and blocks possible legacy/manual duplicates for review. Legacy payments without explicit allocations, unmatched cash transactions, and credit notes without exact tax data are not guessed. **Apply is refused while any record is blocked**; the reviewer must resolve those cases and generate a new plan. The sign-off template is intentionally unapproved. A tenant owner or active user with accounting-edit permission must set `approved` to `true`, enter their `approvedByUserId` and `approvedAt`, and retain the exact fingerprint and `acknowledgedBlockedCount` after review. The approver, fingerprint, plan and application timestamp are also recorded in the database in the same transaction as the migration journals.

Only after independent approval, use the *same database*, same tenant, and same plan state:

```powershell
$env:ALLOW_RECEIVABLE_GL_MIGRATION = 'YES'
node scripts/receivables-gl-migration.mjs --tenant <tenant-id> --apply --signoff .\receivables-signoff.json
```

Apply re-runs the read-only plan inside a serializable database transaction and refuses if its fingerprint differs. The switch is not a substitute for backups, a period-close policy, accountant review, or a test against a restored production snapshot. This tool does not migrate supplier/AP, expenses, payroll, tax filings, opening balances, prior reversals, or stock-return COGS where source cost cannot be proven. It does not assert IFRS/IAS compliance.
