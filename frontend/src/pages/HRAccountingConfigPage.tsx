import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  AlertCircle,
  BadgeDollarSign,
  Calculator,
  CheckCircle2,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  Settings,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { apiFetch } from "@/lib/api"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Account = {
  id: string
  code?: string
  name: string
  type?: string
  subType?: string
  balance?: number
  description?: string | null
}

type Employee = {
  id: string
  firstName?: string
  middleName?: string
  lastName?: string
  employeeNumber?: string
  basicSalary?: number
  salary?: number
  status?: string
}

type Payroll = {
  id: string
  payrollNo?: string
  period: string
  employee?: Employee
  grossSalary: number
  netSalary: number
  totalDeductions: number
  paidAmount?: number
  status: string
  journalEntryId?: string | null
}

type SalaryAdvance = {
  id: string
  advanceNo?: string
  employee?: Employee
  amount: number
  totalRecovered: number
  outstandingAmount: number
  status: string
  date?: string
  journalEntryId?: string | null
}

const HR_ACCOUNTING_VIEWS = new Set(["overview", "mappings", "payroll", "payments", "advances"])

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "safe", label: "Safe" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
]

const PAYMENT_METHOD_ACCOUNT_LABELS: Record<string, string> = {
  cash: "cash or safe",
  safe: "safe or cash",
  mobile_money: "mobile money",
  bank: "bank",
  bank_transfer: "bank",
  cheque: "bank",
  card: "card",
}

const emptyMapping = {
  salaryExpenseAccountId: "",
  salaryPayableAccountId: "",
  salaryAdvanceAccountId: "",
  payeTaxAccountId: "",
  socialSecurityAccountId: "",
}

const defaultPayrollPeriod = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number | string | null | undefined) => formatCurrency(Number(value || 0))
const asArray = (payload: any) => Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
const employeeName = (employee?: Employee | null) =>
  [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ").trim() || "Employee"
const normalizeValue = (value?: string | null) => String(value || "").trim().toLowerCase()

const getTransactionAccountType = (account: Account) => {
  const subType = normalizeValue(account.subType)
  if (subType.startsWith("transaction_")) return subType.replace("transaction_", "")
  if (String(account.description || "").includes("cashAccount:")) return "cash"
  return null
}

const transactionAccountMatchesMethod = (account: Account, paymentMethod?: string | null) => {
  const type = getTransactionAccountType(account)
  const method = normalizeValue(paymentMethod || "cash")
  if (!type) return false
  if (method === "cash") return type === "cash" || type === "safe"
  if (method === "safe") return type === "safe" || type === "cash"
  if (method === "bank" || method === "bank_transfer" || method === "cheque") return type === "bank"
  if (method === "mobile_money") return type === "mobile_money"
  if (method === "card") return type === "card"
  return type === method
}

const paymentAccountPlaceholder = (paymentMethod?: string | null) =>
  `Select ${PAYMENT_METHOD_ACCOUNT_LABELS[normalizeValue(paymentMethod || "cash")] || "payment"} account`

async function fetchJson(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || data?.message || "Request failed")
  return data
}

function statusBadgeVariant(status?: string) {
  if (["paid", "posted", "fully_recovered"].includes(String(status))) return "default"
  if (["cancelled", "reversed"].includes(String(status))) return "destructive"
  return "secondary"
}

function accountLabel(account?: Account) {
  if (!account) return "-"
  return [account.code, account.name].filter(Boolean).join(" - ")
}

function AccountSelect({
  value,
  onChange,
  accounts,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  accounts: Account[]
  placeholder: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {accountLabel(account)} ({money(account.balance)})
        </option>
      ))}
    </select>
  )
}

function EmployeeSelect({
  value,
  onChange,
  employees,
}: {
  value: string
  onChange: (value: string) => void
  employees: Employee[]
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Select employee</option>
      {employees.map((employee) => (
        <option key={employee.id} value={employee.id}>
          {[employee.employeeNumber, employeeName(employee)].filter(Boolean).join(" - ")}
        </option>
      ))}
    </select>
  )
}

export default function HRAccountingConfigPage() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const activeTab = HR_ACCOUNTING_VIEWS.has(String(tab)) ? String(tab) : "overview"

  const [config, setConfig] = useState<any>(null)
  const [availableAccounts, setAvailableAccounts] = useState<{
    expenseAccounts: Account[]
    liabilityAccounts: Account[]
    assetAccounts: Account[]
  }>({ expenseAccounts: [], liabilityAccounts: [], assetAccounts: [] })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payrollPeriod, setPayrollPeriod] = useState(defaultPayrollPeriod())
  const [payrollSummary, setPayrollSummary] = useState<any>(null)
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [advanceSummary, setAdvanceSummary] = useState<any>(null)
  const [advances, setAdvances] = useState<SalaryAdvance[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState(emptyMapping)
  const [loading, setLoading] = useState(true)
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [payrollForm, setPayrollForm] = useState({
    employeeId: "",
    basicSalary: "",
    allowances: "",
    bonus: "",
    overtime: "",
    otherEarnings: "",
    paye: "",
    socialSecurityTax: "",
    healthInsurance: "",
    otherDeductions: "",
    salaryAdvanceRecovery: "",
    notes: "",
  })
  const [paymentForm, setPaymentForm] = useState({
    payrollId: "",
    amount: "",
    paymentAccountId: "",
    paymentMethod: "cash",
    referenceNo: "",
  })
  const [advanceForm, setAdvanceForm] = useState({
    employeeId: "",
    amount: "",
    paymentAccountId: "",
    paymentMethod: "cash",
    date: today(),
    reason: "",
    recoveryMethod: "payroll",
    recoveryPlan: "",
    recoveryAmount: "",
  })
  const [repaymentForm, setRepaymentForm] = useState({
    advanceId: "",
    amount: "",
    paymentAccountId: "",
    paymentMethod: "cash",
    date: today(),
    notes: "",
  })

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === payrollForm.employeeId),
    [employees, payrollForm.employeeId]
  )

  const isConfigured = Boolean(
    config?.isConfigured ||
      (config?.salaryExpenseAccountId && config?.salaryPayableAccountId && config?.salaryAdvanceAccountId)
  )
  const payablePayrolls = payrolls.filter((payroll) =>
    ["posted", "partially_paid"].includes(payroll.status) && Number(payroll.netSalary || 0) > Number(payroll.paidAmount || 0)
  )
  const outstandingAdvances = advances.filter((advance) =>
    ["outstanding", "partially_recovered"].includes(advance.status) && Number(advance.outstandingAmount || 0) > 0
  )
  const paymentAccountOptions = useMemo(
    () => availableAccounts.assetAccounts.filter((account) => transactionAccountMatchesMethod(account, paymentForm.paymentMethod)),
    [availableAccounts.assetAccounts, paymentForm.paymentMethod]
  )
  const advancePaymentAccountOptions = useMemo(
    () => availableAccounts.assetAccounts.filter((account) => transactionAccountMatchesMethod(account, advanceForm.paymentMethod)),
    [availableAccounts.assetAccounts, advanceForm.paymentMethod]
  )
  const repaymentPaymentAccountOptions = useMemo(
    () => availableAccounts.assetAccounts.filter((account) => transactionAccountMatchesMethod(account, repaymentForm.paymentMethod)),
    [availableAccounts.assetAccounts, repaymentForm.paymentMethod]
  )

  const loadConfiguration = async () => {
    const [configRes, accountsRes] = await Promise.all([
      fetchJson("/api/hr/config"),
      fetchJson("/api/hr/config/available-accounts"),
    ])
    setConfig(configRes.config)
    setAvailableAccounts({
      expenseAccounts: accountsRes.expenseAccounts || [],
      liabilityAccounts: accountsRes.liabilityAccounts || [],
      assetAccounts: accountsRes.assetAccounts || [],
    })
    setSelectedAccounts({
      salaryExpenseAccountId: configRes.config?.salaryExpenseAccountId || "",
      salaryPayableAccountId: configRes.config?.salaryPayableAccountId || "",
      salaryAdvanceAccountId: configRes.config?.salaryAdvanceAccountId || "",
      payeTaxAccountId: configRes.config?.payeTaxAccountId || "",
      socialSecurityAccountId: configRes.config?.socialSecurityAccountId || "",
    })
  }

  const loadEmployees = async () => {
    try {
      const data = await fetchJson("/api/hr/employees?take=500")
      setEmployees(asArray(data).filter((employee: Employee) => employee.status !== "terminated"))
    } catch {
      const legacy = await fetchJson("/api/hr")
      setEmployees(asArray(legacy).filter((employee: Employee) => employee.status !== "terminated"))
    }
  }

  const loadPayroll = async () => {
    if (!payrollPeriod) return
    setPayrollLoading(true)
    try {
      const data = await fetchJson(`/api/hr/payroll?period=${encodeURIComponent(payrollPeriod)}`)
      setPayrollSummary(data.summary || null)
      setPayrolls(data.payrolls || data || [])
    } finally {
      setPayrollLoading(false)
    }
  }

  const loadAdvances = async () => {
    const data = await fetchJson("/api/hr/salary-advances")
    setAdvanceSummary(data.summary || null)
    setAdvances(data.advances || data.summary?.advances || [])
  }

  const loadAll = async () => {
    try {
      setLoading(true)
      setError("")
      await Promise.all([loadConfiguration(), loadEmployees(), loadPayroll(), loadAdvances()])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load HR accounting data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadPayroll().catch((err) => setError(err instanceof Error ? err.message : "Failed to load payroll"))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollPeriod])

  useEffect(() => {
    if (paymentForm.paymentAccountId && !paymentAccountOptions.some((account) => account.id === paymentForm.paymentAccountId)) {
      setPaymentForm((prev) => ({ ...prev, paymentAccountId: "" }))
    }
  }, [paymentAccountOptions, paymentForm.paymentAccountId])

  useEffect(() => {
    if (advanceForm.paymentAccountId && !advancePaymentAccountOptions.some((account) => account.id === advanceForm.paymentAccountId)) {
      setAdvanceForm((prev) => ({ ...prev, paymentAccountId: "" }))
    }
  }, [advancePaymentAccountOptions, advanceForm.paymentAccountId])

  useEffect(() => {
    if (repaymentForm.paymentAccountId && !repaymentPaymentAccountOptions.some((account) => account.id === repaymentForm.paymentAccountId)) {
      setRepaymentForm((prev) => ({ ...prev, paymentAccountId: "" }))
    }
  }, [repaymentPaymentAccountOptions, repaymentForm.paymentAccountId])

  const notifySuccess = (message: string) => {
    setSuccess(message)
    toast({ title: message })
    window.setTimeout(() => setSuccess(""), 3500)
  }

  const handleSaveMapping = async () => {
    try {
      setSaving(true)
      setError("")
      const response = await fetchJson("/api/hr/config/mapping", {
        method: "POST",
        body: JSON.stringify(selectedAccounts),
      })
      setConfig(response.config)
      notifySuccess("HR account mapping updated")
      await loadConfiguration()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mapping")
    } finally {
      setSaving(false)
    }
  }

  const handleInitializeAccounts = async () => {
    try {
      setSaving(true)
      setError("")
      const response = await fetchJson("/api/hr/config/initialize-accounts", {
        method: "POST",
        body: JSON.stringify({ branchId: localStorage.getItem("selectedBranchId") || undefined }),
      })
      setConfig(response.config)
      notifySuccess("Default HR accounts created and mapped")
      await loadConfiguration()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create default HR accounts")
    } finally {
      setSaving(false)
    }
  }

  const handleEmployeePayrollChange = (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId)
    setPayrollForm((prev) => ({
      ...prev,
      employeeId,
      basicSalary: employee ? String(employee.basicSalary || employee.salary || "") : prev.basicSalary,
    }))
  }

  const createPayroll = async () => {
    if (!payrollForm.employeeId || !payrollPeriod) {
      setError("Select employee and payroll period")
      return
    }
    try {
      setSaving(true)
      setError("")
      await fetchJson("/api/hr/payroll", {
        method: "POST",
        body: JSON.stringify({
          ...payrollForm,
          period: payrollPeriod,
          basicSalary: Number(payrollForm.basicSalary || selectedEmployee?.basicSalary || 0),
          allowances: Number(payrollForm.allowances || 0),
          bonus: Number(payrollForm.bonus || 0),
          overtime: Number(payrollForm.overtime || 0),
          otherEarnings: Number(payrollForm.otherEarnings || 0),
          paye: Number(payrollForm.paye || 0),
          socialSecurityTax: Number(payrollForm.socialSecurityTax || 0),
          healthInsurance: Number(payrollForm.healthInsurance || 0),
          otherDeductions: Number(payrollForm.otherDeductions || 0),
          salaryAdvanceRecovery: Number(payrollForm.salaryAdvanceRecovery || 0),
        }),
      })
      setPayrollForm((prev) => ({ ...prev, employeeId: "", notes: "" }))
      notifySuccess("Payroll record created")
      await loadPayroll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create payroll")
    } finally {
      setSaving(false)
    }
  }

  const payrollAction = async (payroll: Payroll, action: "approve" | "post") => {
    try {
      setSaving(true)
      setError("")
      await fetchJson(`/api/hr/payroll/${payroll.id}/${action}`, { method: "POST" })
      notifySuccess(action === "approve" ? "Payroll approved" : "Payroll posted to accounting")
      await Promise.all([loadPayroll(), loadAdvances()])
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} payroll`)
    } finally {
      setSaving(false)
    }
  }

  const preparePayment = (payroll: Payroll) => {
    const remaining = Math.max(0, Number(payroll.netSalary || 0) - Number(payroll.paidAmount || 0))
    setPaymentForm((prev) => ({ ...prev, payrollId: payroll.id, amount: String(remaining || "") }))
    navigate("/tenant/hr/accounting/payments")
  }

  const paySalary = async () => {
    if (!paymentForm.payrollId || !paymentForm.paymentAccountId || Number(paymentForm.amount || 0) <= 0) {
      setError("Select payroll, payment account, and amount")
      return
    }
    try {
      setSaving(true)
      setError("")
      await fetchJson(`/api/hr/payroll/${paymentForm.payrollId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          paymentAccountId: paymentForm.paymentAccountId,
          paymentMethod: paymentForm.paymentMethod,
          referenceNo: paymentForm.referenceNo || undefined,
        }),
      })
      setPaymentForm({ payrollId: "", amount: "", paymentAccountId: "", paymentMethod: "cash", referenceNo: "" })
      notifySuccess("Salary payment recorded and posted")
      await loadPayroll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record salary payment")
    } finally {
      setSaving(false)
    }
  }

  const issueAdvance = async () => {
    if (!advanceForm.employeeId || !advanceForm.paymentAccountId || Number(advanceForm.amount || 0) <= 0) {
      setError("Select employee, payment account, and advance amount")
      return
    }
    try {
      setSaving(true)
      setError("")
      await fetchJson("/api/hr/salary-advances", {
        method: "POST",
        body: JSON.stringify({
          ...advanceForm,
          amount: Number(advanceForm.amount),
          recoveryAmount: Number(advanceForm.recoveryAmount || 0),
        }),
      })
      setAdvanceForm({
        employeeId: "",
        amount: "",
        paymentAccountId: "",
        paymentMethod: "cash",
        date: today(),
        reason: "",
        recoveryMethod: "payroll",
        recoveryPlan: "",
        recoveryAmount: "",
      })
      notifySuccess("Advance or loan issued and posted")
      await loadAdvances()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue advance")
    } finally {
      setSaving(false)
    }
  }

  const repayAdvance = async () => {
    if (!repaymentForm.advanceId || !repaymentForm.paymentAccountId || Number(repaymentForm.amount || 0) <= 0) {
      setError("Select advance, receiving account, and amount")
      return
    }
    try {
      setSaving(true)
      setError("")
      await fetchJson(`/api/hr/salary-advances/${repaymentForm.advanceId}/direct-repayment`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(repaymentForm.amount),
          paymentAccountId: repaymentForm.paymentAccountId,
          paymentMethod: repaymentForm.paymentMethod,
          date: repaymentForm.date,
          notes: repaymentForm.notes || undefined,
        }),
      })
      setRepaymentForm({ advanceId: "", amount: "", paymentAccountId: "", paymentMethod: "cash", date: today(), notes: "" })
      notifySuccess("Advance repayment recorded")
      await loadAdvances()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record repayment")
    } finally {
      setSaving(false)
    }
  }

  const selectedPaymentPayroll = payrolls.find((payroll) => payroll.id === paymentForm.payrollId)
  const selectedRepaymentAdvance = advances.find((advance) => advance.id === repaymentForm.advanceId)

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            <Calculator className="h-7 w-7 text-primary" />
            HR Accounting
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure salary accounts, post payroll, pay salaries, and manage employee advances with real accounting entries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={isConfigured ? "default" : "secondary"} className="h-8">
            {isConfigured ? "Configured" : "Needs setup"}
          </Badge>
          <Button variant="outline" onClick={loadAll} disabled={saving}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Payroll This Period</p>
                <p className="mt-2 text-2xl font-bold">{money(payrollSummary?.totalNetSalary)}</p>
                <p className="text-xs text-muted-foreground">{payrollSummary?.totalPayrolls || 0} payroll records</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Salary Paid</p>
                <p className="mt-2 text-2xl font-bold">{money(payrollSummary?.totalPaid)}</p>
                <p className="text-xs text-muted-foreground">Current period payments</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Outstanding Advances</p>
                <p className="mt-2 text-2xl font-bold">{money(advanceSummary?.totalOutstanding)}</p>
                <p className="text-xs text-muted-foreground">{advanceSummary?.advancesCount || 0} open advances/loans</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Posted Payroll</p>
                <p className="mt-2 text-2xl font-bold">{payrollSummary?.byStatus?.posted || 0}</p>
                <p className="text-xs text-muted-foreground">{payrollSummary?.byStatus?.paid || 0} fully paid</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-4 w-4" />
                  Required Accounts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Salary Expense", selectedAccounts.salaryExpenseAccountId, availableAccounts.expenseAccounts],
                  ["Salary Payable", selectedAccounts.salaryPayableAccountId, availableAccounts.liabilityAccounts],
                  ["Advance / Loan Asset", selectedAccounts.salaryAdvanceAccountId, availableAccounts.assetAccounts],
                  ["PAYE Tax", selectedAccounts.payeTaxAccountId, availableAccounts.liabilityAccounts],
                  ["Social Security", selectedAccounts.socialSecurityAccountId, availableAccounts.liabilityAccounts],
                ].map(([label, id, list]) => {
                  const account = (list as Account[]).find((item) => item.id === id)
                  return (
                    <div key={String(label)} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <span className="font-medium">{String(label)}</span>
                      <span className="min-w-0 break-words text-right text-muted-foreground">{accountLabel(account)}</span>
                    </div>
                  )
                })}
                <Button variant="outline" onClick={() => navigate("/tenant/hr/accounting/mappings")}>Review mappings</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  Workflow Status
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Draft Payroll", payrollSummary?.byStatus?.draft || 0, "Needs approval"],
                  ["Approved Payroll", payrollSummary?.byStatus?.approved || 0, "Ready to post"],
                  ["Posted / Payable", payablePayrolls.length, "Ready for salary payment"],
                  ["Open Advances", outstandingAdvances.length, "Recover through payroll or direct repayment"],
                ].map(([label, value, detail]) => (
                  <div key={String(label)} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{String(label)}</p>
                    <p className="mt-1 text-xl font-semibold">{String(value)}</p>
                    <p className="text-xs text-muted-foreground">{String(detail)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "mappings" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Account Mappings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Salary Expense Account *</Label>
                <AccountSelect value={selectedAccounts.salaryExpenseAccountId} onChange={(value) => setSelectedAccounts((prev) => ({ ...prev, salaryExpenseAccountId: value }))} accounts={availableAccounts.expenseAccounts} placeholder="Select expense account" />
              </div>
              <div>
                <Label>Salary Payable Account *</Label>
                <AccountSelect value={selectedAccounts.salaryPayableAccountId} onChange={(value) => setSelectedAccounts((prev) => ({ ...prev, salaryPayableAccountId: value }))} accounts={availableAccounts.liabilityAccounts} placeholder="Select liability account" />
              </div>
              <div>
                <Label>Employee Advance / Loan Account *</Label>
                <AccountSelect value={selectedAccounts.salaryAdvanceAccountId} onChange={(value) => setSelectedAccounts((prev) => ({ ...prev, salaryAdvanceAccountId: value }))} accounts={availableAccounts.assetAccounts} placeholder="Select asset account" />
              </div>
              <div>
                <Label>PAYE Tax Account</Label>
                <AccountSelect value={selectedAccounts.payeTaxAccountId} onChange={(value) => setSelectedAccounts((prev) => ({ ...prev, payeTaxAccountId: value }))} accounts={availableAccounts.liabilityAccounts} placeholder="Select tax liability account" />
              </div>
              <div>
                <Label>Social Security Account</Label>
                <AccountSelect value={selectedAccounts.socialSecurityAccountId} onChange={(value) => setSelectedAccounts((prev) => ({ ...prev, socialSecurityAccountId: value }))} accounts={availableAccounts.liabilityAccounts} placeholder="Select liability account" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveMapping} disabled={saving}>Save Mapping</Button>
              <Button variant="outline" onClick={handleInitializeAccounts} disabled={saving}>Auto-Create Default Accounts</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "payroll" && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4" />
                Create Payroll Record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <Label>Period</Label>
                  <Input type="month" value={payrollPeriod} onChange={(event) => setPayrollPeriod(event.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label>Employee</Label>
                  <EmployeeSelect value={payrollForm.employeeId} onChange={handleEmployeePayrollChange} employees={employees} />
                </div>
                <div>
                  <Label>Basic Salary</Label>
                  <Input type="number" value={payrollForm.basicSalary} onChange={(event) => setPayrollForm((prev) => ({ ...prev, basicSalary: event.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-5">
                {[
                  ["allowances", "Allowances"],
                  ["bonus", "Bonus"],
                  ["overtime", "Overtime"],
                  ["otherEarnings", "Other Earnings"],
                  ["salaryAdvanceRecovery", "Advance Recovery"],
                  ["paye", "PAYE"],
                  ["socialSecurityTax", "Social Security"],
                  ["healthInsurance", "Health Insurance"],
                  ["otherDeductions", "Other Deductions"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Input type="number" value={(payrollForm as any)[key]} onChange={(event) => setPayrollForm((prev) => ({ ...prev, [key]: event.target.value }))} />
                  </div>
                ))}
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={payrollForm.notes} onChange={(event) => setPayrollForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional payroll note" />
              </div>
              <Button onClick={createPayroll} disabled={saving || !isConfigured}>Create Payroll</Button>
            </CardContent>
          </Card>

          <PayrollTable
            payrolls={payrolls}
            loading={payrollLoading}
            onApprove={(payroll) => payrollAction(payroll, "approve")}
            onPost={(payroll) => payrollAction(payroll, "post")}
            onPay={preparePayment}
            saving={saving}
          />
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Record Salary Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-5">
                <div className="md:col-span-2">
                  <Label>Posted Payroll</Label>
                  <select value={paymentForm.payrollId} onChange={(event) => {
                    const payroll = payrolls.find((item) => item.id === event.target.value)
                    const remaining = payroll ? Math.max(0, Number(payroll.netSalary || 0) - Number(payroll.paidAmount || 0)) : ""
                    setPaymentForm((prev) => ({ ...prev, payrollId: event.target.value, amount: String(remaining || "") }))
                  }} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select posted payroll</option>
                    {payablePayrolls.map((payroll) => (
                      <option key={payroll.id} value={payroll.id}>
                        {payroll.payrollNo || payroll.id} - {employeeName(payroll.employee)} - Due {money(Number(payroll.netSalary || 0) - Number(payroll.paidAmount || 0))}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input type="number" value={paymentForm.amount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))} />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value, paymentAccountId: "" }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input value={paymentForm.referenceNo} onChange={(event) => setPaymentForm((prev) => ({ ...prev, referenceNo: event.target.value }))} />
                </div>
              </div>
              <div>
                <Label>{PAYMENT_METHOD_ACCOUNT_LABELS[paymentForm.paymentMethod] || "Payment"} Account</Label>
                <AccountSelect value={paymentForm.paymentAccountId} onChange={(value) => setPaymentForm((prev) => ({ ...prev, paymentAccountId: value }))} accounts={paymentAccountOptions} placeholder={paymentAccountPlaceholder(paymentForm.paymentMethod)} />
              </div>
              {selectedPaymentPayroll && (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  Remaining payable for {employeeName(selectedPaymentPayroll.employee)} is {money(Number(selectedPaymentPayroll.netSalary || 0) - Number(selectedPaymentPayroll.paidAmount || 0))}.
                </p>
              )}
              <Button onClick={paySalary} disabled={saving || !isConfigured}>Record Payment</Button>
            </CardContent>
          </Card>
          <PayrollTable payrolls={payrolls} loading={payrollLoading} onApprove={(payroll) => payrollAction(payroll, "approve")} onPost={(payroll) => payrollAction(payroll, "post")} onPay={preparePayment} saving={saving} />
        </div>
      )}

      {activeTab === "advances" && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeDollarSign className="h-4 w-4" />
                  Issue Advance / Loan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Employee</Label>
                  <EmployeeSelect value={advanceForm.employeeId} onChange={(value) => setAdvanceForm((prev) => ({ ...prev, employeeId: value }))} employees={employees} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" value={advanceForm.amount} onChange={(event) => setAdvanceForm((prev) => ({ ...prev, amount: event.target.value }))} />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={advanceForm.date} onChange={(event) => setAdvanceForm((prev) => ({ ...prev, date: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <select value={advanceForm.paymentMethod} onChange={(event) => setAdvanceForm((prev) => ({ ...prev, paymentMethod: event.target.value, paymentAccountId: "" }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{PAYMENT_METHOD_ACCOUNT_LABELS[advanceForm.paymentMethod] || "Payment"} Account</Label>
                  <AccountSelect value={advanceForm.paymentAccountId} onChange={(value) => setAdvanceForm((prev) => ({ ...prev, paymentAccountId: value }))} accounts={advancePaymentAccountOptions} placeholder={paymentAccountPlaceholder(advanceForm.paymentMethod)} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Recovery Method</Label>
                    <select value={advanceForm.recoveryMethod} onChange={(event) => setAdvanceForm((prev) => ({ ...prev, recoveryMethod: event.target.value }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                      <option value="payroll">Payroll deduction</option>
                      <option value="direct_repayment">Direct repayment</option>
                    </select>
                  </div>
                  <div>
                    <Label>Planned Recovery Amount</Label>
                    <Input type="number" value={advanceForm.recoveryAmount} onChange={(event) => setAdvanceForm((prev) => ({ ...prev, recoveryAmount: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Input value={advanceForm.reason} onChange={(event) => setAdvanceForm((prev) => ({ ...prev, reason: event.target.value }))} />
                </div>
                <Button onClick={issueAdvance} disabled={saving || !isConfigured}>Issue and Post</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Direct Repayment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Open Advance / Loan</Label>
                  <select value={repaymentForm.advanceId} onChange={(event) => {
                    const advance = advances.find((item) => item.id === event.target.value)
                    setRepaymentForm((prev) => ({ ...prev, advanceId: event.target.value, amount: advance ? String(advance.outstandingAmount || "") : "" }))
                  }} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select advance</option>
                    {outstandingAdvances.map((advance) => (
                      <option key={advance.id} value={advance.id}>
                        {advance.advanceNo || advance.id} - {employeeName(advance.employee)} - {money(advance.outstandingAmount)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" value={repaymentForm.amount} onChange={(event) => setRepaymentForm((prev) => ({ ...prev, amount: event.target.value }))} />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={repaymentForm.date} onChange={(event) => setRepaymentForm((prev) => ({ ...prev, date: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <select value={repaymentForm.paymentMethod} onChange={(event) => setRepaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value, paymentAccountId: "" }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{PAYMENT_METHOD_ACCOUNT_LABELS[repaymentForm.paymentMethod] || "Receiving"} Account</Label>
                  <AccountSelect value={repaymentForm.paymentAccountId} onChange={(value) => setRepaymentForm((prev) => ({ ...prev, paymentAccountId: value }))} accounts={repaymentPaymentAccountOptions} placeholder={paymentAccountPlaceholder(repaymentForm.paymentMethod)} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={repaymentForm.notes} onChange={(event) => setRepaymentForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
                {selectedRepaymentAdvance && (
                  <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    Outstanding balance is {money(selectedRepaymentAdvance.outstandingAmount)} for {employeeName(selectedRepaymentAdvance.employee)}.
                  </p>
                )}
                <Button onClick={repayAdvance} disabled={saving || !isConfigured}>Record Repayment</Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outstanding Advances / Loans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-sm">
                  <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Advance No.</th>
                      <th className="px-3 py-2 text-left">Employee</th>
                      <th className="px-3 py-2 text-right">Issued</th>
                      <th className="px-3 py-2 text-right">Recovered</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Journal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advances.map((advance) => (
                      <tr key={advance.id} className="border-b">
                        <td className="px-3 py-2 font-mono">{advance.advanceNo || advance.id}</td>
                        <td className="px-3 py-2">{employeeName(advance.employee)}</td>
                        <td className="px-3 py-2 text-right">{money(advance.amount)}</td>
                        <td className="px-3 py-2 text-right">{money(advance.totalRecovered)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{money(advance.outstandingAmount)}</td>
                        <td className="px-3 py-2"><Badge variant={statusBadgeVariant(advance.status)}>{advance.status}</Badge></td>
                        <td className="px-3 py-2">{advance.journalEntryId ? "Posted" : "Pending"}</td>
                      </tr>
                    ))}
                    {!advances.length && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No advances or loans found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function PayrollTable({
  payrolls,
  loading,
  onApprove,
  onPost,
  onPay,
  saving,
}: {
  payrolls: Payroll[]
  loading: boolean
  onApprove: (payroll: Payroll) => void
  onPost: (payroll: Payroll) => void
  onPay: (payroll: Payroll) => void
  saving: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payroll Records</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Payroll No.</th>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Deductions</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Journal</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Loading payroll...
                  </td>
                </tr>
              )}
              {!loading && payrolls.map((payroll) => {
                const remaining = Math.max(0, Number(payroll.netSalary || 0) - Number(payroll.paidAmount || 0))
                return (
                  <tr key={payroll.id} className="border-b">
                    <td className="px-3 py-2 font-mono">{payroll.payrollNo || payroll.id}</td>
                    <td className="px-3 py-2">{employeeName(payroll.employee)}</td>
                    <td className="px-3 py-2 text-right">{money(payroll.grossSalary)}</td>
                    <td className="px-3 py-2 text-right">{money(payroll.totalDeductions)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(payroll.netSalary)}</td>
                    <td className="px-3 py-2 text-right">{money(payroll.paidAmount)}</td>
                    <td className="px-3 py-2"><Badge variant={statusBadgeVariant(payroll.status)}>{payroll.status}</Badge></td>
                    <td className="px-3 py-2">{payroll.journalEntryId ? "Posted" : "Pending"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {payroll.status === "draft" && <Button size="sm" variant="outline" onClick={() => onApprove(payroll)} disabled={saving}>Approve</Button>}
                        {payroll.status === "approved" && <Button size="sm" onClick={() => onPost(payroll)} disabled={saving}>Post</Button>}
                        {["posted", "partially_paid"].includes(payroll.status) && remaining > 0 && <Button size="sm" variant="outline" onClick={() => onPay(payroll)} disabled={saving}>Pay</Button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && !payrolls.length && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No payroll records for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
