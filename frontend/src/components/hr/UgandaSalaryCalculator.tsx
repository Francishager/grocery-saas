import { useEffect, useRef, useState } from "react"
import { Calculator, Loader2, ReceiptText, RotateCcw } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Employee = {
  id: string; firstName?: string; middleName?: string; lastName?: string; employeeNumber?: string
  basicSalary?: number; salary?: number; taxId?: string | null; socialSecurityNumber?: string | null
}
type TaxBand = { from: number; to: number | null; rate: number; taxableAmount: number; tax: number }
export type SalaryPreview = {
  input: Record<string, any>
  employee?: Employee | null
  calculation: {
    grossSalary?: number; taxableIncome: number; paye: number; payeScheduleLabel?: string
    nonCashBenefits?: number; housingBenefit?: number; rentToEmployer?: number
    employeeSocialSecurity?: number; employerSocialSecurity?: number; localServiceTax?: number; annualLST?: number
    totalDeductions?: number; netSalary?: number; employerCost?: number; working?: TaxBand[]
    months?: { period: string; taxableIncome: number; paye: number; scheduleLabel: string; working: TaxBand[] }[]
  }
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const modes = [{ value: "net", label: "Net Pay" }, { value: "gross", label: "Gross Pay" }, { value: "paye", label: "PAYE" }] as const
const ugx = (value = 0) => `UGX ${value.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const selectClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
const employeeName = (employee: Employee) => [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")
function initialForm() {
  const now = new Date()
  const year = Math.min(2026, Math.max(2025, now.getFullYear()))
  return {
    calculatorMode: "net", employeeId: "", period: `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    toMonth: now.getMonth() + 1, basicSalary: "", netPay: "", taxablePay: "", nonCashBenefits: "",
    housingValue: "", rentToEmployer: "", housedByEmployer: false, deductLST: false, payeBeforeLST: false,
    payeMode: "on", socialSecurityMode: "on", showWorking: true, residencyStatus: "resident", multipleEmployment: false,
    allowances: "", bonus: "", overtime: "", otherEarnings: "", healthInsurance: "", otherDeductions: "", salaryAdvanceRecovery: "",
  }
}

function Working({ bands }: { bands: TaxBand[] }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-sm" aria-label="PAYE tax bands">
      <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3">Rate</th><th className="py-2 pr-3 text-right">Taxable amount</th><th className="py-2 text-right">PAYE</th></tr></thead>
      <tbody>{bands.map((band, i) => <tr key={i} className="border-b last:border-0">
        <td className="py-2 pr-3 align-top">{band.rate * 100}%<span className="block text-xs text-muted-foreground">{band.from.toLocaleString()} {band.to === null ? "+" : `to ${band.to.toLocaleString()}`}</span></td>
        <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{band.taxableAmount.toLocaleString("en-UG", { minimumFractionDigits: 2 })}</td>
        <td className="whitespace-nowrap py-2 text-right tabular-nums">{band.tax.toLocaleString("en-UG", { minimumFractionDigits: 2 })}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export default function UgandaSalaryCalculator({ employees, canCreatePayroll, onUseInPayroll }: {
  employees: Employee[]; canCreatePayroll: boolean; onUseInPayroll: (preview: SalaryPreview) => void
}) {
  const [form, setForm] = useState(initialForm)
  const [preview, setPreview] = useState<SalaryPreview | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const revision = useRef(0)
  const pending = useRef(false)
  useEffect(() => () => { revision.current++ }, [])
  const update = (changes: Partial<ReturnType<typeof initialForm>>) => {
    revision.current++
    setPreview(null)
    setError("")
    setForm((previous) => ({ ...previous, ...changes }))
  }
  const selectedEmployee = employees.find((employee) => employee.id === form.employeeId)
  const payeOnly = form.calculatorMode === "paye"
  const month = Number(form.period.slice(5))
  const primaryKey = payeOnly ? "taxablePay" : form.calculatorMode === "gross" ? "netPay" : "basicSalary"
  const primaryLabel = payeOnly ? "Taxable pay (period total)" : form.calculatorMode === "gross" ? "Desired net pay" : "Gross pay"

  const amountField = (key: keyof ReturnType<typeof initialForm>, label: string, required = false) => <div className="min-w-0" key={key}>
    <Label htmlFor={`salary-${key}`}>{label}</Label>
    <Input id={`salary-${key}`} className="mt-1 h-10 tabular-nums" type="number" inputMode="decimal" min="0" max="1000000000000" step="0.01"
      required={required} value={String(form[key])} onChange={(event) => update({ [key]: event.target.value })} />
  </div>
  const checkbox = (key: "housedByEmployer" | "deductLST" | "payeBeforeLST" | "multipleEmployment" | "showWorking", label: string, disabled = false) => <label className="flex min-h-10 items-center gap-3 text-sm">
    <input className="h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={form[key]} disabled={disabled} onChange={(event) => update({ [key]: event.target.checked })} />{label}
  </label>

  const calculate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    const request = ++revision.current
    setLoading(true)
    setError("")
    setPreview(null)
    try {
      const response = await apiFetch("/api/hr/payroll/calculate", { method: "POST", body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok || data.success === false) throw new Error(data.error || "Unable to calculate salary")
      if (request === revision.current) setPreview(data)
    } catch (err) {
      if (request === revision.current) setError(err instanceof Error ? err.message : "Unable to calculate salary")
    } finally {
      pending.current = false
      setLoading(false)
    }
  }
  const clear = () => {
    revision.current++
    setForm({ ...initialForm(), calculatorMode: form.calculatorMode })
    setPreview(null)
    setError("")
  }
  const result = preview?.calculation
  const rows: [string, number | undefined][] = result ? [
    ["Gross pay", result.grossSalary], ["Non-cash benefits", result.nonCashBenefits], ["Taxable housing benefit", result.housingBenefit],
    ["Taxable pay", result.taxableIncome], ["PAYE", result.paye], ["Employee NSSF (5%)", result.employeeSocialSecurity],
    ["Local Service Tax", result.localServiceTax], ["Rent to employer", result.rentToEmployer],
    ["Health insurance", Number(preview?.input.healthInsurance)], ["Other deductions", Number(preview?.input.otherDeductions)],
    ["Advance recovery", Number(preview?.input.salaryAdvanceRecovery)], ["Total deductions", result.totalDeductions],
    ["Employer NSSF (10%)", result.employerSocialSecurity], ["Employer cash cost", result.employerCost],
  ] : []

  return <section aria-label="Uganda salary calculator" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div><h2 className="text-lg font-semibold">Salary Calculator</h2><p className="text-sm text-muted-foreground">Uganda / UGX</p></div>
      <div className="flex rounded-md border p-1" role="group" aria-label="Calculation mode">
        {modes.map((mode) => <Button key={mode.value} type="button" size="sm" aria-pressed={form.calculatorMode === mode.value}
          variant={form.calculatorMode === mode.value ? "default" : "ghost"} disabled={loading} onClick={() => update({ calculatorMode: mode.value })}>{mode.label}</Button>)}
      </div>
    </div>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
      <form className="min-w-0" onSubmit={calculate}>
        <fieldset disabled={loading} className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div><Label htmlFor="salary-year">Year</Label><select id="salary-year" className={`${selectClass} mt-1`} value={form.period.slice(0, 4)} onChange={(event) => update({ period: `${event.target.value}-${form.period.slice(5)}` })}><option>2026</option><option>2025</option></select></div>
            <div><Label htmlFor="salary-month">{payeOnly ? "From" : "Month"}</Label><select id="salary-month" className={`${selectClass} mt-1`} value={month} onChange={(event) => update({ period: `${form.period.slice(0, 4)}-${event.target.value.padStart(2, "0")}`, toMonth: Math.max(Number(event.target.value), form.toMonth) })}>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></div>
            {payeOnly && <div><Label htmlFor="salary-to">To</Label><select id="salary-to" className={`${selectClass} mt-1`} value={form.toMonth} onChange={(event) => update({ toMonth: Number(event.target.value) })}>{months.map((name, index) => <option key={name} value={index + 1} disabled={index + 1 < month}>{name}</option>)}</select></div>}
          </div>
          {!payeOnly && <div>
            <Label htmlFor="salary-employee">Employee (optional)</Label>
            <select id="salary-employee" className={`${selectClass} mt-1`} value={form.employeeId} onChange={(event) => {
              const employee = employees.find((item) => item.id === event.target.value)
              update({ employeeId: event.target.value, basicSalary: employee ? String(employee.basicSalary ?? employee.salary ?? "") : form.basicSalary })
            }}><option value="">No employee selected</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)} {employee.employeeNumber ? `(${employee.employeeNumber})` : ""}</option>)}</select>
            {selectedEmployee && <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><div><dt className="inline">TIN: </dt><dd className="inline">{selectedEmployee.taxId || "Not recorded"}</dd></div><div><dt className="inline">NSSF No.: </dt><dd className="inline">{selectedEmployee.socialSecurityNumber || "Not recorded"}</dd></div></dl>}
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {amountField(primaryKey, `${primaryLabel} (UGX)`, true)}
            {!payeOnly && amountField("nonCashBenefits", "Taxable non-cash benefits (UGX)")}
          </div>
          {!payeOnly && <div className="space-y-3 border-y py-3">
            {checkbox("housedByEmployer", "Housed by employer")}
            {form.housedByEmployer && <div className="grid gap-4 sm:grid-cols-2">{amountField("housingValue", "Value of housing (UGX)")}{amountField("rentToEmployer", "Rent to employer (UGX)")}</div>}
            <div className="grid gap-x-4 sm:grid-cols-2">
              <label className="flex min-h-10 items-center gap-3 text-sm"><input className="h-4 w-4 accent-primary" type="checkbox" checked={form.socialSecurityMode === "on"} onChange={(event) => update({ socialSecurityMode: event.target.checked ? "on" : "off" })} />Deduct NSSF</label>
              {checkbox("deductLST", "Deduct LST")}
              <label className="flex min-h-10 items-center gap-3 text-sm"><input className="h-4 w-4 accent-primary" type="checkbox" checked={form.payeMode === "on"} onChange={(event) => update({ payeMode: event.target.checked ? "on" : "off" })} />Deduct PAYE</label>
              {checkbox("payeBeforeLST", "Deduct PAYE before LST", !form.deductLST)}
            </div>
            {form.deductLST && <p className="text-xs text-muted-foreground">LST installment: {month >= 7 && month <= 10 ? "July to October" : "Not due this month"}</p>}
          </div>}
          <div className="grid items-end gap-4 sm:grid-cols-2"><div><Label htmlFor="salary-residency">Residency</Label><select id="salary-residency" className={`${selectClass} mt-1`} value={form.residencyStatus} onChange={(event) => update({ residencyStatus: event.target.value })}><option value="resident">Resident</option><option value="non_resident">Non-resident</option></select></div>{checkbox("multipleEmployment", "Multiple employment")}</div>
          {!payeOnly && <details className="border-b pb-4"><summary className="cursor-pointer text-sm font-medium">Additional earnings &amp; deductions</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{([
            ["allowances", "Additional allowances"], ["bonus", "Bonus"], ["overtime", "Overtime"], ["otherEarnings", "Other earnings"],
            ["healthInsurance", "Health insurance"], ["otherDeductions", "Other deductions"], ["salaryAdvanceRecovery", "Advance recovery"],
          ] as const).map(([key, label]) => amountField(key, `${label} (UGX)`))}</div></details>}
          {checkbox("showWorking", "Show working")}
        </fieldset>
        {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}Calculate</Button>
          <Button type="button" variant="outline" onClick={clear} disabled={loading}><RotateCcw className="h-4 w-4" />Clear All</Button>
        </div>
      </form>
      <div className="min-w-0 border-t pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-live="polite" aria-busy={loading}>
        <h3 className="text-base font-semibold">Calculation Result</h3>
        {!result ? <div className="py-10 text-sm text-muted-foreground">{loading ? "Calculating..." : "No calculation yet"}</div> : <>
          <div className="my-4 border-y py-4"><p className="text-sm text-muted-foreground">{payeOnly ? "Total PAYE" : form.calculatorMode === "gross" ? "Required gross pay" : "Net pay"}</p><p data-testid="salary-result" className="mt-1 break-words text-2xl font-semibold tabular-nums">{ugx(payeOnly ? result.paye : form.calculatorMode === "gross" ? result.grossSalary : result.netSalary)}</p></div>
          {!payeOnly && <>
            <p className="mb-3 text-xs text-muted-foreground">{result.payeScheduleLabel}</p>
            <dl className="space-y-2 text-sm">{rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{label}</dt><dd className="ml-auto whitespace-nowrap font-medium tabular-nums">{ugx(value)}</dd></div>)}<div className="flex flex-wrap justify-between gap-2 border-t pt-3 font-semibold"><dt>Net pay</dt><dd className="ml-auto tabular-nums">{ugx(result.netSalary)}</dd></div></dl>
            {Number(result.netSalary) < 0 && <p className="mt-3 text-sm text-destructive" role="alert">Deductions exceed gross pay. Review the amounts before creating payroll.</p>}
            {form.deductLST && <p className="mt-3 text-xs text-muted-foreground">Annual LST assessment: {ugx(result.annualLST)}</p>}
            {preview?.input.showWorking && <div className="mt-5"><h4 className="text-sm font-semibold">PAYE Working (UGX)</h4><Working bands={result.working || []} /></div>}
            {canCreatePayroll && <Button className="mt-5 max-w-full whitespace-normal" type="button" variant="outline" disabled={!preview?.input.employeeId || Number(result.netSalary) < 0} onClick={() => preview && onUseInPayroll(preview)}><ReceiptText className="h-4 w-4 shrink-0" />Use in Payroll Posting</Button>}
          </>}
          {payeOnly && <div className="space-y-4">{result.months?.map((item) => <div key={item.period} className="border-b pb-3"><div className="flex flex-wrap justify-between gap-2 text-sm font-medium"><span>{months[Number(item.period.slice(5)) - 1]} {item.period.slice(0, 4)}</span><span className="tabular-nums">{ugx(item.paye)}</span></div><p className="mt-1 text-xs text-muted-foreground">Taxable pay: {ugx(item.taxableIncome)}</p>{preview?.input.showWorking && <Working bands={item.working} />}</div>)}</div>}
        </>}
      </div>
    </div>
  </section>
}
