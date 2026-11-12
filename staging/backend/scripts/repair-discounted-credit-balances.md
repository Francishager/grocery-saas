# Historical Discount Overcredits

Run from `backend` using the database configured by `DATABASE_URL`:

```sh
node scripts/repair-discounted-credit-balances.mjs --tenant=TENANT_ID
node scripts/repair-discounted-credit-balances.mjs --tenant=TENANT_ID --apply
```

The default is a read-only dry run. Use `--customer=CUSTOMER_ID` with a tenant to
limit the repair further, or explicitly use `--all-tenants` to inspect all tenants.
Deployment alone does not execute this script.

Each reported repair includes the customer balance before and after, original and
corrected credit-note amounts, and linked sale balances. Apply mode updates those
records together in a serializable transaction and saves the evidence in AuditLog.
Rerunning the script does not add the correction again. Cash and stock do not move.

Automatic repairs cover active notes exceeding the net value of a completed,
unpaid discounted sale by no more than its discount. The customer balance must
already match the recalculated balance or differ by exactly the overcredit.
Cases involving payments, inconsistent totals, mismatched ownership, or other
balance differences are reported as `review` and left unchanged. Partial returns
whose total credit does not exceed the net sale require a separate item-level
audit; this script cannot infer their intended quantities or discounts.

After applying, rerun the dry run and inspect its summary and any `review` records.
Original note amounts remain available in AuditLog under
`reconcile_discount_credit`. Historical exported documents are not rewritten.
