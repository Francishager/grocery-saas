# JibuSales IFRS Readiness Roadmap

## Goal and limitation

Build JibuSales as an auditable accounting platform that can support businesses applying full IFRS Accounting Standards or the IFRS for SMEs Accounting Standard. Software controls and reports can support an entity's compliance; they cannot certify that entity's financial statements. The business remains responsible for selecting its applicable framework, accounting policies, estimates, source records, and financial-statement approval with its accountant or auditor.

Framework editions must be explicit. In particular, the [2025 third edition of IFRS for SMEs](https://www.ifrs.org/issued-standards/ifrs-for-smes/) is effective for annual periods beginning on or after 1 January 2027; earlier application is permitted. Do not silently apply that edition to prior periods.

## Non-negotiable data safeguards

- No deployment-time rewrite, deletion, or automatic correction of tenant transactions, customer/supplier balances, inventory quantities, or account balances.
- Schema changes are additive and backward-compatible. Backfills are separately runnable, tenant-scoped, dry-run first, repeatable, and produce before/after evidence.
- Historical inconsistencies are reported as exceptions. They are not resolved with `MAX`, guessed allocations, balance overrides, or silent journal postings.
- Posted transactions are immutable. Corrections use linked reversals or adjustments with actor, timestamp, reason, source reference, and approval where required.
- A tenant adopts a framework and effective date explicitly. Existing tenants retain current behavior until reviewed and opted in; new transactions after adoption follow the selected policy set.
- Period close and migration activation require balanced journals, reconciled subledgers, and signed-off exception reports.

## Accounting source of truth

The general ledger must be the authoritative financial record. Sales, receipts, payment allocations, refunds, credit/debit notes, purchases, payroll, stock movements, and account transfers are distinct source events. Each event is posted exactly once using a stable idempotency key and carries a tenant, branch, business date, currency, source type, source ID, and journal reference.

Subledgers (receivables, payables, inventory, payroll, and cash accounts) must reconcile to their general-ledger control accounts. Cached fields such as `SaleRecord.amountPaid`, `Customer.balance`, and account balance snapshots are projections, not independent evidence. Differences between a projection and its source events must be visible and actionable.

## Phased delivery and acceptance gates

### Phase 0: Baseline and framework selection

- Inventory every posting route, model, report, manual journal path, reversal path, and tenant migration.
- Document current debit/credit mappings and identify duplicated or non-idempotent posting paths.
- Add tenant reporting-framework metadata, version, functional currency, fiscal-year boundaries, and effective date using nullable/additive fields first.
- Acceptance: read-only tenant audit identifies source records, ledger postings, unbalanced journals, duplicate references, and subledger/control-account differences without changing data.

### Phase 1: Ledger integrity and customer payment allocation

- Make journal postings atomic, balanced, immutable, and idempotent. Require explicit reversals rather than deletes.
- Represent receipt allocation to one or more invoices explicitly. Store unapplied receipts as customer advances/liabilities rather than overpaying an invoice's receivable.
- Treat sale-level `amountPaid` as a derived/cache field. Do not use `max(sale.amountPaid, linked receipt total)` as accounting policy; retain it only as a labeled legacy display fallback until tenant migration is approved.
- Acceptance: replaying any request cannot double-post; linked receipt allocations equal source receipts; receivables control account agrees with the open-item subledger; disagreements appear in an exception report.

### Phase 2: Revenue, inventory, and returns

- Implement framework-specific revenue treatment for goods, services, discounts, taxes collected for authorities, bundles, deposits, returns, and unfulfilled obligations ([IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/) / IFRS for SMEs Section 23 as selected).
- Establish an [IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/) / SME inventory cost policy, cost layers, stock-count adjustments, net-realisable-value write-downs, and reversals. Preserve the sale-time cost used for COGS.
- Preserve original line-level tax and cost evidence on sales returns and credit notes; never infer historical tax when source evidence exists.
- Acceptance: revenue, inventory, COGS, tax liabilities, and return reversals reconcile from source lines through journals to reports.

### Phase 3: Financial instruments, payroll, assets, and other balances

- Add receivables impairment/expected-credit-loss assessment, approvals, assumptions, and disclosures ([IFRS 9](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/) or the applicable SME sections).
- Reconcile supplier open items, employee benefits/payroll liabilities, fixed assets and depreciation, leases, provisions, and foreign currency when those features are used.
- Keep statutory tax/payroll calculations country-specific and separate from IFRS financial reporting policies.
- Acceptance: valuation inputs, estimates, and changes are versioned and auditable; reports distinguish accounting balances from tax returns and operational KPIs.

### Phase 4: Statements, disclosures, and controls

- Produce framework/version-specific statement of financial position, profit or loss (and OCI where applicable), changes in equity, cash flows, comparatives, and notes.
- Support locked periods, approval controls, audit exports, accounting-policy notes, and reproducible report-to-ledger drill-down.
- Validate outputs against accountant-prepared reference cases for each supported framework and jurisdiction.
- Acceptance: independent Ugandan accounting review, external SME/full-IFRS review cases, end-to-end regression, migration rehearsal, and rollback rehearsal all pass before any compliance marketing claim.

## Immediate implementation status

- New customer receipts use explicit `CustomerPaymentAllocation` records with exact two-decimal amounts. Sale-level paid amounts remain projections; an unapplied amount is exposed separately and does not reduce invoice receivables.
- New receivable sales start in explicit-allocation mode. The first receipt on a legacy sale snapshots its prior provisional paid amount and both original source values. No old payment is backfilled, deleted, or overwritten.
- Legacy sales without allocations continue to use the compatibility fallback until a reviewed cutover. Mismatches remain visible using their original cutover evidence.
- `canViewReceivableReconciliation` gates the exception report; `canReviewReceivableReconciliation` gates append-only review decisions. Reviews require a source fingerprint and note, and explicitly do not alter financial records.
- Automated tests cover legacy compatibility, explicit invoice allocations, customer-account allocations, and unapplied receipts.

This is a receivables control milestone, not IFRS compliance. It does not yet create or reconcile the balanced general-ledger journals required for every receipt, customer advance, or correction. The next gate is integrating these events with the general ledger and adding signed-off migration/reconciliation tooling.
