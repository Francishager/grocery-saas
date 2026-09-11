# Uganda Salary Calculator

The calculator at `/tenant/hr/accounting/calculator` uses the authenticated,
read-only `POST /api/hr/payroll/calculate` endpoint. It does not create payroll,
payments or journals. Optional employee selection is scoped to the current tenant.

## Supported calculations

- Net Pay: cash earnings less PAYE, employee NSSF, LST, rent and other deductions.
- Gross Pay: the minimum gross amount yielding the requested net amount, with
  cent precision. Each LST band is searched separately because net pay is not
  globally monotonic across LST thresholds.
- PAYE: total taxable income for the selected month range, allocated equally
  across those months. Remaining cents are allocated to the first months. Each
  month uses its own effective tax schedule, including the July 2026 transition.
- Working: progressive tax band amounts and tax, with 40% marginal tax above
  UGX 10 million (30% plus the 10% surcharge).

Years 2025 and 2026 are supported. Add verified schedules before exposing later
years. Values are UGX; this calculator does not perform currency conversion.
The inputs model monthly employment pay, not bonuses subject to special reliefs,
termination benefits, or variable monthly earnings within a multi-month range.

## Sources and conventions

- URA, rates effective 1 July 2026:
  https://ura.go.ug/en/changes-to-paye-return-form-following-the-income-tax-amendment-act-2026/
- URA, employment benefits and the housing valuation rule:
  https://ura.go.ug/en/dt-faqs/
- NSSF, 5% employee and 10% employer contributions on gross monthly wages:
  https://www.nssfug.org/about-us/membership/
- KCCA, annual LST bands, net-of-PAYE basis and first-four-month installments:
  https://www.kcca.go.ug/uploads/Local_Service_Tax_FAQs.pdf
- Requested interaction reference:
  https://aren.software/calculators/uganda

Non-cash benefits are taxable values supplied by the user, not additional cash
earnings. Housing is the lesser of net market rent and 15% of employment income
including that net rent. The employee's rent contribution also reduces cash paid.
NSSF is not subtracted from the PAYE basis. A missing TIN does not exempt PAYE.

LST is optional and charged in four installments in July through October.
The reference's order option is retained: PAYE-first uses income after PAYE to
assess LST; LST-first assesses LST on cash earnings and deducts the installment
from taxable employment income. The user must select the order and LST option
appropriate to their assessment and payments already made. This preview does
not infer annual LST already paid to a local authority.

Payroll transfer retains the calculated PAYE and NSSF instead of overwriting
them with employee-profile defaults. LST and rent are included in the existing
other-deductions field, itemized in payroll notes; non-cash benefits and housing
valuation are also documented there. No automatic posting or payment occurs.
Editing the prepared payroll inputs requires recalculation before payroll can
be created, preventing benefits and taxes from being silently dropped.

## Verification

`node --test backend/tests/uganda-salary-preview.test.js backend/tests/salary-calculator-api.test.js`

`node --test frontend/tests/salary-calculator.test.mjs`

Browser tests use isolated fixtures and the actual calculation engine, including
desktop, tablet and phone layouts and payroll transfer. They do not write to a
business database. Set `PLAYWRIGHT_MODULE_PATH` when Playwright is installed in a
shared runtime rather than the project's dependencies.
