# Report reconciliation audit - 23 September 2026

## Changes

- Daily report totals and source rows no longer stop at 700/1,500 records. Removed a duplicate, unreachable daily-report endpoint.
- Cash at Hand, expected cash, net movement and staff tills use the same account movements and historical balances. Cash receipts, repayments, refunds, transfers and opening floats are included once.
- Safe-to-bank transfers do not reduce a cash till. Transfer destinations are informational breakdowns, not additional deductions.
- Cash, credit and profit card drilldowns show the amount represented by the card, including cash paid when a credit invoice was created.
- Dashboard, financial, legacy profit/expense, executive and decision reports include journal expenses. Expense reversals have opposite signs on their own dates. Expenses use their business date rather than appearing in both the business-date and creation-date periods.
- Bank Transactions reconstructs the opening balance and recognizes incoming transfers as inflows.
- Manual and HR journal lines are included in General Ledger, with source-document reference deduplication.
- Trial Balance and Balance Sheet share recorded account balances with Accounting reports. Inactive accounts with history remain visible. Balance Sheet uses recorded equity plus unclosed earnings and exposes differences.
- Financial statement exports include all account names/lines. Cash exports include the full reconciling till ledger.
- Financial/daily reports no longer silently fall back to incomplete offline data after an API failure. Valid zero card totals stay zero.

## Verification

Read-only production checks, September 2026:

- 24 tenants: daily cash cards versus tills, opening-to-closing movement, cash and expense drilldowns, daily versus financial expenses, legacy profit, and cash flow passed.
- 24 tenants: Accounting and Reports trial balances agreed; balance-sheet differences agreed with trial-balance differences; account drilldowns reconciled to their balances.
- REZO's latest targeted recheck also passed dashboard, bank, cash-sale, credit-sale and gross-profit drilldown checks.
- REZO's targeted snapshot at 2026-09-23 06:40:10 UTC: Cash at Hand UGX 24,480,000; recognized September expenses UGX 26,023,700; gross profit UGX 20,119,900; 1,407 report rows. Live transactions continued during the audit, so earlier snapshots have different cash totals.
- Frontend production build passed. Existing large-bundle and jsPDF import warnings remain.
- Report calculation, endpoint, dashboard, COGS, receivable and accounting regression tests passed.

No production balances or transactions were changed by this report audit. The fixes apply when the updated backend/frontend are deployed; no data migration is needed for the reporting changes.

## Remaining historical ledger discrepancies

These are recorded general-ledger differences, not conclusions about missing physical money. The statement audit at 2026-09-23 06:34:11 UTC found ten tenants with a nonzero debit-minus-credit difference:

| Tenant | Difference |
| --- | ---: |
| Urban Tech Investments | 638,500 |
| Baze Mart Shopping Center | 50,000 |
| Mega Win Supermart | 3,500 |
| WELLNESS CENTER (C4 CRETE MASTERS LTD) | 1,295,888 |
| MASE HARDWARE & ELECTRONICS | 650,000 |
| S & A CURTAINS & FURNITURE | 450,000 |
| CLIMAX MATRESS DEALERS | 6,013,000 |
| ABBA SHAK ENTERPRISES LIMITED | 1,223,000 |
| BUMUGENYI FAMILY HARDWARE | 628,000 |
| REZO FAMILY RICE STORE | 2,861,309,709 |

Account details identify balances not represented by journal entries. These can include opening balances, synchronized operating-account activity and legacy adjustments; their source and correct counterpart account must be established before historical accounting entries can be posted. The application must not fill this difference with invented equity.

A zero difference is not proof that every source transaction is posted, particularly for tenants with no chart-of-accounts data. The checks establish consistency of the tested report calculations, not full financial-statement completeness or certification of every specialized module.

## Repeating the read-only checks

Set DATABASE_URL outside source control, then run from the repository root:

```powershell
node backend/scripts/audit-report-reconciliation.mjs
node backend/scripts/audit-report-reconciliation.mjs --statements
node backend/scripts/audit-report-reconciliation.mjs --tenant=cms8rr22503iycxem8r0h3zuj --dashboard
```

The dashboard comparison is intended for the current month because dashboard KPIs use that period.

Accounting reference: internal movements between cash/cash-equivalent accounts are cash management movements under [IAS 7, paragraph 9](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ias-7-statement-of-cash-flows.pdf).
