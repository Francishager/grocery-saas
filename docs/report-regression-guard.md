# Report regression guard

Executable regression tests protect report, accounting, dashboard, and permission behavior. Future changes must preserve these contracts and add a failing test for new defects.

## Gates

Run locally with `npm run test:reports`. The root command runs backend and frontend tests using synthetic fixtures and an injected database client; no production database is touched. The frontend prebuild script runs the component tests before Vite. The backend Docker build runs the backend suite before creating the runtime image. CI runs the complete guard on Node 18 and 24 and builds the frontend.

Repository administrators should make both report-regression checks required in the deployment branch ruleset and disallow bypasses. This repository change cannot configure those remote settings.

## Protected contracts

- Each protected report GET route exists exactly once and rejects anonymous requests.
- Sales and financial permissions remain separate. Tenant and assigned-branch scope is enforced.
- Opening physical cash plus signed till movements equals closing cash. Bank/safe-only movements do not reduce a cash till, and transfers count once.
- Transactions after the report end date are excluded.
- Cancelled-sale cash trails remain reconcilable. Partial credit invoices split received cash and outstanding credit.
- Expenses use business date, signed reversal lines, posted journals, source deduplication, and actual cash impact.
- Revenue excludes sales tax, saved cost determines COGS, and expense reversals increase net profit.
- Totals and drilldowns are not truncated. Inactive accounts with history remain visible.
- Accounting and Reports use the same balances and period boundaries. Real differences remain visible rather than being filled with invented equity.
- Valid zero and negative card values remain visible, missing headers cannot crash the daily report, and drilldowns sum to their cards.

The guard covers Daily Business Report, financial statements, expense and profit summaries, bank transactions, dashboard endpoints, COGS, receivable adjustments, outstanding balances, and accounting synchronization.

These tests protect behavior but do not repair historical ledger gaps. Use `backend/scripts/audit-report-reconciliation.mjs` for an authorized read-only production reconciliation. Never add production credentials or customer records to test fixtures.
