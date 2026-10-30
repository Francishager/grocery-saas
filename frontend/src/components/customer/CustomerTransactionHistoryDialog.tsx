import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CalendarClock, CreditCard, Loader2, ReceiptText, UserRound, Wallet, Edit, Trash2, Gauge, CircleDollarSign, Clock3, Download, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api'
import { RichTextDisplay, markdownToHtml } from '@/components/RichTextArea'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { cn, formatCurrency, formatDisplayDate } from '@/lib/utils'
import { displayReference } from '@/lib/displayReference'
import TransactionReceiptButton from '@/components/TransactionReceiptButton'

export type CustomerHistoryTarget = {
  id?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
  maskedPhone?: string
  maskedEmail?: string
}

type CustomerHistoryTransaction = {
  id: string
  source: string
  type: string
  date?: string | null
  dueDate?: string | null
  reference?: string | null
  originalReference?: string | null
  receiptStatus?: 'cancelled' | 'adjusted' | null
  description?: string | null
  reason?: string | null
  debit?: number
  credit?: number
  amount?: number
  amountPaid?: number
  refundAmount?: number
  remainingBalance?: number
  balance?: number
  affectsBalance?: boolean
  paymentMethod?: string | null
  status?: string | null
  branch?: string | null
  staff?: string | null
  items?: Array<{
    id?: string
    productName?: string
    sku?: string
    quantity?: number
    unitName?: string
    unitPrice?: number
    discount?: number
    total?: number
  }>
}

type CustomerCreditHistory = {
  asOf: string
  currentBalance: number
  receivableExposure: number
  customerFunds: number
  creditLimit?: number
  availableLimit?: number
  utilizationPercent?: number | null
  aging: {
    notDue: number
    days1To30: number
    days31To60: number
    days61To90: number
    over90Days: number
    noDueDate: number
  }
  openSales: Array<{
    id: string
    reference: string
    date: string
    dueDate?: string | null
    total: number
    amountPaid: number
    balance: number
    status: string
    daysPastDue: number | null
  }>
}

type CustomerHistoryResponse = {
  unavailableActivitySections?: string[]
  customer: CustomerHistoryTarget & {
    address?: string | null
    maskedAddress?: string
    notes?: string | null
    maskedNotes?: string
    status?: string
    creditLimit?: number
    balance?: number
    openingBalance?: number
    openingBalanceDate?: string | null
    trustScore?: number
    availableForWithdrawal?: number
    canDelete?: boolean
  }
  summary: {
    currentBalance?: number
    availableCredit?: number
    receivableSales?: number
    cashSales?: number
    payments?: number
    withdrawals?: number
    creditNotes?: number
    returns?: number
    transactionCount?: number
    openingBalance?: number
    openingBalanceDate?: string | null
    openingBalanceNote?: string | null
    availableForWithdrawal?: number
    lastTransactionDate?: string | null
  }
  access: {
    phone: boolean
    email: boolean
    address: boolean
    balance: boolean
    creditLimit: boolean
    sales: boolean
    payments: boolean
    returns: boolean
    creditNotes: boolean
    withdrawals: boolean
    businessActivity: boolean
    creditHistory: boolean
    notes: boolean
    recordPayment: boolean
    printReceipts: boolean
    edit: boolean
    delete: boolean
    withdraw: boolean
  }
  creditHistory?: CustomerCreditHistory
  transactions: CustomerHistoryTransaction[]
}

type RentalLedgerResponse = {
  customer: { profilePhotoUrl?: string | null; nationalId?: string | null; nationalIdFrontUrl?: string | null; nationalIdBackUrl?: string | null }
  tenancies: Array<{ id: string; tenantName: string; agreementRef?: string | null; agreementNotes?: string | null; status: string; startDate: string; endDate?: string | null; rentAmount: number; currency: string; balance: number; depositRequired?: number; depositHeld?: number; rentAdvanceBalance?: number; maritalStatus?: string | null; spouseNames?: string | null; childrenCount?: number | null; householdSize?: number | null; placeOfOrigin?: string | null; arrearsAging?: RentAging; unit: { unitCode: string; property: { name: string; owner?: { name: string } | null } } }>
  entries: Array<{ id: string; tenancyId?: string; date: string; type: string; reference: string; description: string; debit: number; credit: number; runningBalance: number; rentMonths?: number | null; rentPeriods?: string[]; arrearsMonths?: number | null; paymentMethod?: string | null; status?: string; propertyName?: string; unitCode?: string; currency?: string; planNo?: string | null; receivedBy?: string | null; transactionRef?: string | null; notes?: string | null }>
  closingBalance: number
  arrearsAging: RentAging
  access: { identity: boolean; personalDetails: boolean; managePersonalDetails: boolean }
}

function formatRentPeriods(periods?: string[]) {
  return [...new Set(periods || [])].sort().map(period => {
    const [year, month] = period.split('-').map(Number)
    return Number.isInteger(year) && month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : period
  }).join(', ')
}
type RentAging = { notDue: number; days1To30: number; days31To60: number; days61To90: number; over90Days: number; overdueTotal: number }
type HouseholdTenancy = { id: string; maritalStatus?: string | null; spouseNames?: string | null; childrenCount?: number | null; householdSize?: number | null; placeOfOrigin?: string | null; status: string; startDate: string; endDate?: string | null; agreementRef?: string | null; unit: { unitCode: string; property: { name: string } } }
type RentPlanInstallment = { id: string; sequence: number; dueDate: string; amount: number; amountPaid: number; status: string }
type RentPlanPayment = { id: string; receiptNo: string; amount: number; paymentDate: string; paymentMethod: string; status: string; rentPeriods?: string[]; receivedBy?: string | null; transactionRef?: string | null; planInstallmentAllocations?: Array<{ amount: number; installment: { sequence: number } }> }
type RentPaymentPlan = { id: string; planNo: string; status: string; totalAmount: number; amountPaid: number; installmentCount: number; frequency: string; startDate: string; notes?: string | null; tenancy: { tenantName: string; currency: string; unit: { unitCode: string; property: { name: string } } }; installments: RentPlanInstallment[]; payments: RentPlanPayment[] }
type RentPlanProfileData = { plans: RentPaymentPlan[]; eligibleCharges: Array<{ id: string; tenancyId: string; tenancyName: string; propertyName: string; unitCode: string; currency: string; period: string; dueDate: string; description: string; amount: number; amountPaid: number; balance: number }> }
type RentPaymentAccount = { id: string; name: string; type: string; paymentMethod: string }
type RentalAgreementDraft = { id: string; rentalNo: string; hireDate: string; expectedReturnDate: string; status: string; bookingState?: string; contractDraft?: string | null; contractGeneratedAt?: string | null }

function escapeAgreementHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function agreementHtml(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeAgreementHtml(title)}</title><style>body{font:14px/1.6 Arial,sans-serif;color:#171717;margin:24mm}h1{font-size:22px}h2{font-size:17px;margin-top:24px}strong{font-weight:700}.meta{color:#555}</style></head><body>${body}</body></html>`
}

const normalizeText = (value?: string | null) => String(value || '').replace(/_/g, ' ')
const localDateInputValue = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function HouseholdDetailsFields({ defaults = {} }: { defaults?: Partial<HouseholdTenancy> }) {
  return (
    <section className="mt-4 space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">Household details</h3>
        <p className="mt-1 text-xs text-muted-foreground">Optional renter household details.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Marital status
          <select name="maritalStatus" defaultValue={defaults.maritalStatus || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3">
            <option value="">Not provided</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="separated">Separated</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
        <label className="block text-sm">Spouse name(s)
          <input name="spouseNames" defaultValue={defaults.spouseNames || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3" />
        </label>
        <label className="block text-sm">Number of children
          <input name="childrenCount" type="number" min="0" max="100" step="1" defaultValue={defaults.childrenCount ?? ''} placeholder="Not provided" className="mt-1 h-10 w-full rounded-md border bg-background px-3" />
        </label>
        <label className="block text-sm">Household / family size
          <input name="householdSize" type="number" min="1" max="100" step="1" defaultValue={defaults.householdSize ?? ''} placeholder="Not provided" className="mt-1 h-10 w-full rounded-md border bg-background px-3" />
        </label>
        <label className="block text-sm sm:col-span-2">Place of origin
          <input name="placeOfOrigin" defaultValue={defaults.placeOfOrigin || ''} placeholder="Town, district, region or country" className="mt-1 h-10 w-full rounded-md border bg-background px-3" />
        </label>
      </div>
    </section>
  )
}

function metric(label: string, value: number | undefined, tone?: string) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 break-words text-sm font-semibold sm:text-base', tone)}>{formatCurrency(Number(value || 0))}</p>
    </div>
  )
}

function countMetric(label: string, value: number | undefined) {
  return <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold sm:text-base">{Number(value || 0).toLocaleString()}</p></div>
}

function maskedMetric(label: string) {
  return (
    <div className="rounded-md border bg-muted/20 p-3" aria-label={`${label} hidden by permissions`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tracking-[0.18em] text-muted-foreground sm:text-base">******</p>
    </div>
  )
}

function RentArrearsAging({ aging }: { aging?: RentAging }) {
  const buckets = [
    { label: 'Due, not yet overdue', amount: Number(aging?.notDue || 0), tone: 'bg-sky-600' },
    { label: '1–30 days overdue', amount: Number(aging?.days1To30 || 0), tone: 'bg-amber-500' },
    { label: '31–60 days overdue', amount: Number(aging?.days31To60 || 0), tone: 'bg-orange-600' },
    { label: '61–90 days overdue', amount: Number(aging?.days61To90 || 0), tone: 'bg-rose-600' },
    { label: 'Over 90 days overdue', amount: Number(aging?.over90Days || 0), tone: 'bg-red-800' },
  ]
  const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0)
  return <section aria-label="Rent arrears aging" className="space-y-4 rounded-md border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">Rent arrears aging</h3><p className="text-xs text-muted-foreground">Open rent charges grouped by days past due.</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Total overdue</p><p className="text-lg font-semibold text-rose-700">{formatCurrency(Number(aging?.overdueTotal || 0))}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{buckets.map(bucket => <div key={bucket.label} className="rounded-md bg-muted/30 p-3"><div className="flex items-start justify-between gap-2"><p className="text-xs text-muted-foreground">{bucket.label}</p><p className="text-sm font-semibold">{formatCurrency(bucket.amount)}</p></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${bucket.label} share of open rent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round(bucket.amount / total * 100) : 0}><div className={`h-full ${bucket.tone}`} style={{ width: `${total ? Math.min(100, bucket.amount / total * 100) : 0}%` }} /></div></div>)}</div>
  </section>
}

function CreditUtilizationGauge({ percent, availableLimit, trustScore }: { percent: number | null; availableLimit: number; trustScore: number }) {
  const gradientId = `credit-utilization-${useId().replace(/:/g, '')}`
  const value = percent == null ? 0 : Math.max(0, percent)
  const needlePercent = Math.min(100, value)
  const angle = Math.PI - (needlePercent / 100) * Math.PI
  const centerX = 120
  const centerY = 120
  const needleX = centerX + 76 * Math.cos(angle)
  const needleY = centerY - 76 * Math.sin(angle)
  const normalizedTrustScore = Math.min(100, Math.max(0, Number(trustScore) || 0))
  const status = percent == null ? 'No limit set' : value > 100 ? 'Over limit' : value >= 80 ? 'Near limit' : 'Within limit'
  const statusTone = percent == null ? 'text-muted-foreground' : value > 100 ? 'text-red-700' : value >= 80 ? 'text-amber-700' : 'text-emerald-700'

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Limit utilization</p>
        <Gauge className="h-4 w-4 text-muted-foreground" />
      </div>
      <svg viewBox="0 0 240 158" className="mx-auto mt-1 h-36 w-full max-w-[290px]" role="img" aria-label={percent == null ? 'No customer credit limit is set' : `Credit limit utilization ${value.toLocaleString()} percent, ${status}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#15803d" />
            <stop offset="72%" stopColor="#65a30d" />
            <stop offset="86%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="15" strokeLinecap="round" />
        <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke={`url(#${gradientId})`} strokeWidth="15" strokeLinecap="round" pathLength="100" strokeDasharray={`${percent == null ? 0 : needlePercent} 100`} />
        {[0, 25, 50, 75, 100].map((mark) => {
          const markAngle = Math.PI - (mark / 100) * Math.PI
          const x1 = centerX + 82 * Math.cos(markAngle)
          const y1 = centerY - 82 * Math.sin(markAngle)
          const x2 = centerX + 91 * Math.cos(markAngle)
          const y2 = centerY - 91 * Math.sin(markAngle)
          return <line key={mark} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.58" strokeWidth="2" />
        })}
        <line x1={centerX} y1={centerY} x2={needleX} y2={needleY} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx={centerX} cy={centerY} r="7" fill="currentColor" />
        <text x="20" y="146" textAnchor="start" className="fill-muted-foreground" fontSize="11">0%</text>
        <text x="120" y="24" textAnchor="middle" className="fill-muted-foreground" fontSize="11">50%</text>
        <text x="220" y="146" textAnchor="end" className="fill-muted-foreground" fontSize="11">100%</text>
      </svg>
      <div className="-mt-2 text-center">
        <p className="text-xl font-semibold tabular-nums">{percent == null ? '—' : `${value.toLocaleString()}%`}</p>
        <p className={cn('text-xs font-medium', statusTone)}>{status}</p>
        {percent != null && <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(availableLimit)} limit remaining</p>}
      </div>
      <div className="mt-4 border-t pt-3" aria-label={`Repayment trust score ${normalizedTrustScore} out of 100`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">Repayment trust</span>
          <span className="font-semibold tabular-nums">{normalizedTrustScore}/100</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Repayment trust score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalizedTrustScore}>
          <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${normalizedTrustScore}%` }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Limit use shows current exposure; trust reflects repayment history. Consider both together.</p>
      </div>
    </div>
  )
}

function transactionTone(row: CustomerHistoryTransaction) {
  if (Number(row.debit || 0) > 0) return 'text-red-700'
  if (Number(row.credit || 0) > 0) return 'text-green-700'
  return 'text-foreground'
}

function customerActivityReceipt(row: CustomerHistoryTransaction, customerName?: string | null) {
  const isCreditNote = row.source === 'credit_note'
  const isReturn = row.source === 'sale_return'
  const isPayment = row.source === 'customer_payment' || row.source === 'property_sale_payment'
  const amount = Number(row.amount || row.debit || row.credit || 0)
  const title = isCreditNote
    ? 'Customer Credit Note'
    : isReturn
      ? row.paymentMethod === 'credit' ? 'Sales Return Credit Receipt' : 'Sales Return Refund Receipt'
      : isPayment
        ? 'Customer Payment Receipt'
      : `${row.type || 'Customer transaction'} receipt`
  const fields = [
    { label: 'Transaction type', value: row.type },
    ...(row.originalReference && !isPayment ? [{ label: 'Original sale', value: row.originalReference }] : []),
    ...(row.reason ? [{ label: 'Reason', value: row.reason }] : []),
    ...(isPayment ? [{ label: 'Payment applied to', value: row.originalReference || 'Customer account' }] : []),
    ...(isCreditNote ? [
      { label: 'Credit note value', value: formatCurrency(amount) },
      { label: 'Refund recorded', value: formatCurrency(Number(row.refundAmount || 0)) },
      { label: 'Returned items', value: row.items?.length ? 'Listed below' : 'No item quantities recorded on this note' },
    ] : []),
    ...(isReturn ? row.paymentMethod === 'credit'
      ? [{ label: 'Customer balance credit', value: formatCurrency(amount) }]
      : [{ label: 'Refund method', value: row.paymentMethod }, { label: 'Refund amount', value: formatCurrency(amount) }]
      : []),
    ...(!isCreditNote && !isReturn ? [{ label: 'Payment method', value: row.paymentMethod }] : []),
    { label: 'Staff', value: row.staff },
    ...(!isCreditNote && !isReturn ? [
      { label: 'Debit', value: row.debit ? formatCurrency(Number(row.debit)) : '' },
      { label: 'Credit', value: row.credit ? formatCurrency(Number(row.credit)) : '' },
    ] : []),
    { label: 'Status', value: row.status },
  ]

  return {
    title,
    reference: displayReference(row.reference, row.id, row.type || 'Transaction'),
    date: row.date || new Date(),
    amount,
    amountLabel: isPayment ? 'Payment received' : undefined,
    partyLabel: 'Customer',
    partyName: customerName || undefined,
    itemsLabel: isPayment && row.items?.length ? 'Items on linked invoice' : undefined,
    items: row.items?.map((item) => ({
      name: item.productName || 'Item',
      quantity: Number(item.quantity || 0),
      unitName: item.unitName || '',
      unitPrice: Number(item.unitPrice || 0),
      discount: Number(item.discount || 0),
      total: Number(item.total || 0),
    })),
    fields,
  }
}

export default function CustomerTransactionHistoryDialog({
  customer,
  open,
  onOpenChange,
  onRecordPayment,
  onWithdraw,
  onEditCustomer,
  onDeleteCustomer,
  viewMode = 'profile',
  presentation = 'dialog',
}: {
  customer: CustomerHistoryTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecordPayment?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onWithdraw?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onEditCustomer?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  onDeleteCustomer?: (customer: CustomerHistoryTarget & Record<string, unknown>) => void
  viewMode?: 'profile' | 'details'
  presentation?: 'dialog' | 'page'
}) {
  const navigate = useNavigate()
  const [data, setData] = useState<CustomerHistoryResponse | null>(null)
  const [rentalData, setRentalData] = useState<RentalLedgerResponse | null>(null)
  const [rentalAgreements, setRentalAgreements] = useState<RentalAgreementDraft[]>([])
  const [rentalAgreementsLoading, setRentalAgreementsLoading] = useState(false)
  const [rentalAgreementsError, setRentalAgreementsError] = useState('')
  const [rentPlanData, setRentPlanData] = useState<RentPlanProfileData | null>(null)
  const [rentPlanReload, setRentPlanReload] = useState(0)
  const [rentPlanError, setRentPlanError] = useState('')
  const [rentPlanAccounts, setRentPlanAccounts] = useState<RentPaymentAccount[]>([])
  const [defaultRentPlanAccountId, setDefaultRentPlanAccountId] = useState('')
  const [createPlanTenancyId, setCreatePlanTenancyId] = useState('')
  const [planPaymentTarget, setPlanPaymentTarget] = useState<RentPaymentPlan | null>(null)
  const [cancelPlanTarget, setCancelPlanTarget] = useState<RentPaymentPlan | null>(null)
  const [planCancelReason, setPlanCancelReason] = useState('')
  const [planPaymentMethod, setPlanPaymentMethod] = useState('cash')
  const [planPaymentAccountId, setPlanPaymentAccountId] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingPlanPayment, setSavingPlanPayment] = useState(false)
  const [savingPlanCancellation, setSavingPlanCancellation] = useState(false)
  const [householdTenancies, setHouseholdTenancies] = useState<HouseholdTenancy[]>([])
  const [rentalReload, setRentalReload] = useState(0)
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [savingIdentity, setSavingIdentity] = useState(false)
  const [identityError, setIdentityError] = useState('')
  const [editingHouseholdTenancyId, setEditingHouseholdTenancyId] = useState<string | null>(null)
  const [savingHousehold, setSavingHousehold] = useState(false)
  const [householdError, setHouseholdError] = useState('')
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const propertyManagementEnabled = hasFeature('property_management.landlord') || hasFeature('property_management.agent')
  const canViewRentalAgreements = hasFeature('rentals') && hasPermission('canViewRental')
  const canLoadRentalProfile = propertyManagementEnabled && hasPermission('canViewPropertyStatements')
  const canLoadHouseholdProfile = propertyManagementEnabled && (hasPermission('canViewTenantPersonalDetails') || hasPermission('canManageTenantPersonalDetails'))
  const canViewRentPaymentPlans = propertyManagementEnabled && (hasPermission('canViewRentPaymentPlans') || hasPermission('canManageRentPaymentPlans'))
  const canManageRentPaymentPlans = propertyManagementEnabled && hasPermission('canManageRentPaymentPlans')
  const canRecordRentPayment = propertyManagementEnabled && hasPermission('canRecordRentPayment')
  const canPrintRentReceipts = propertyManagementEnabled && (hasPermission('canViewPropertyCollections') || canRecordRentPayment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !customer?.id) {
      setData(null)
      setRentalData(null)
      setHouseholdTenancies([])
      setError('')
      return
    }

    const controller = new AbortController()
    const loadHistory = async () => {
      setLoading(true)
      setError('')
      setRentalData(null)
      setHouseholdTenancies([])
      try {
        const response = await apiFetch(`/api/receivables/customers/${customer.id}/history?limit=${viewMode === 'details' ? 1 : 500}`, {
          signal: controller.signal,
        } as RequestInit)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'Failed to load customer history')
        setData(payload)
        if (canLoadRentalProfile) {
          const rentalResponse = await apiFetch(`/api/property-management/customers/${customer.id}/rent-ledger`, { signal: controller.signal } as RequestInit)
          if (rentalResponse.ok) setRentalData(await rentalResponse.json())
        }
        if (canLoadHouseholdProfile) {
          const householdResponse = await apiFetch(`/api/property-management/customers/${customer.id}/household`, { signal: controller.signal } as RequestInit)
          if (householdResponse.ok) setHouseholdTenancies((await householdResponse.json()).tenancies || [])
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.message || 'Failed to load customer history')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadHistory()
    return () => controller.abort()
  }, [open, customer?.id, viewMode, rentalReload, canLoadRentalProfile, canLoadHouseholdProfile])

  useEffect(() => {
    if (!open || !customer?.id || !canViewRentalAgreements) {
      setRentalAgreements([])
      setRentalAgreementsError('')
      setRentalAgreementsLoading(false)
      return
    }
    const controller = new AbortController()
    setRentalAgreementsLoading(true)
    setRentalAgreementsError('')
    void apiFetch(`/api/rentals?customerId=${encodeURIComponent(customer.id)}&page=1&limit=500`, { signal: controller.signal } as RequestInit)
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'Could not load rental agreements.')
        if (!controller.signal.aborted) setRentalAgreements(Array.isArray(payload?.rentals) ? payload.rentals : [])
      })
      .catch(error => { if (error?.name !== 'AbortError') setRentalAgreementsError(error?.message || 'Could not load rental agreements.') })
      .finally(() => { if (!controller.signal.aborted) setRentalAgreementsLoading(false) })
    return () => controller.abort()
  }, [open, customer?.id, canViewRentalAgreements, rentalReload])

  useEffect(() => {
    if (!open || !customer?.id || !canViewRentPaymentPlans) {
      setRentPlanData(null)
      setRentPlanError('')
      return
    }
    const controller = new AbortController()
    setRentPlanError('')
    void apiFetch(`/api/property-management/customers/${customer.id}/payment-plans`, { signal: controller.signal } as RequestInit)
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'Could not load renter payment plans.')
        if (!controller.signal.aborted) setRentPlanData(payload)
      })
      .catch(error => { if (error?.name !== 'AbortError') setRentPlanError(error?.message || 'Could not load renter payment plans.') })
    return () => controller.abort()
  }, [open, customer?.id, canViewRentPaymentPlans, rentPlanReload])

  useEffect(() => {
    if (!open || !canViewRentPaymentPlans || !canRecordRentPayment) {
      setRentPlanAccounts([])
      setDefaultRentPlanAccountId('')
      return
    }
    const controller = new AbortController()
    void apiFetch('/api/property-management/payment-accounts', { signal: controller.signal } as RequestInit)
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'Could not load permitted payment accounts.')
        if (!controller.signal.aborted) {
          setRentPlanAccounts(payload.accounts || [])
          setDefaultRentPlanAccountId(payload.defaultCashAccountId || '')
        }
      })
      .catch(error => { if (error?.name !== 'AbortError') setRentPlanAccounts([]) })
    return () => controller.abort()
  }, [open, canViewRentPaymentPlans, canRecordRentPayment])

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const tenancyId = rentalData?.tenancies.find(row => row.status === 'active')?.id || rentalData?.tenancies[0]?.id
    if (!tenancyId) return
    setSavingIdentity(true)
    setIdentityError('')
    try {
      const response = await apiFetch(`/api/property-management/tenancies/${tenancyId}/profile`, { method: 'PUT', body: new FormData(event.currentTarget) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Could not update renter identity.')
      setEditingIdentity(false)
      setRentalReload(value => value + 1)
    } catch (err: any) { setIdentityError(err?.message || 'Could not update renter identity.') }
    finally { setSavingIdentity(false) }
  }

  async function saveHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingHouseholdTenancyId) return
    const form = new FormData(event.currentTarget)
    setSavingHousehold(true)
    setHouseholdError('')
    try {
      const response = await apiFetch(`/api/property-management/tenancies/${editingHouseholdTenancyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maritalStatus: form.get('maritalStatus'), spouseNames: form.get('spouseNames'), childrenCount: form.get('childrenCount'), householdSize: form.get('householdSize'), placeOfOrigin: form.get('placeOfOrigin') }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Could not update renter household details.')
      setEditingHouseholdTenancyId(null)
      setRentalReload(value => value + 1)
    } catch (err: any) { setHouseholdError(err?.message || 'Could not update renter household details.') }
    finally { setSavingHousehold(false) }
  }

  async function createRentPaymentPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customer?.id || !createPlanTenancyId) return
    const form = new FormData(event.currentTarget)
    setSavingPlan(true)
    setRentPlanError('')
    try {
      const response = await apiFetch(`/api/property-management/customers/${customer.id}/payment-plans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          tenancyId: createPlanTenancyId, installmentCount: Number(form.get('installmentCount')),
          frequency: form.get('frequency'), startDate: form.get('startDate'), notes: form.get('notes'), idempotencyKey: crypto.randomUUID(),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Could not create rent payment plan.')
      setCreatePlanTenancyId('')
      setRentPlanReload(value => value + 1)
    } catch (error: any) { setRentPlanError(error?.message || 'Could not create rent payment plan.') }
    finally { setSavingPlan(false) }
  }

  async function recordRentPlanPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!planPaymentTarget) return
    const form = new FormData(event.currentTarget)
    setSavingPlanPayment(true)
    setRentPlanError('')
    try {
      const response = await apiFetch(`/api/property-management/payment-plans/${planPaymentTarget.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          amount: Number(form.get('amount')), paymentDate: form.get('paymentDate'), paymentMethod: planPaymentMethod,
          cashAccountId: planPaymentAccountId, transactionRef: form.get('transactionRef'), notes: form.get('notes'), idempotencyKey: crypto.randomUUID(),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Could not record rent plan payment.')
      setPlanPaymentTarget(null)
      setRentPlanReload(value => value + 1)
    } catch (error: any) { setRentPlanError(error?.message || 'Could not record rent plan payment.') }
    finally { setSavingPlanPayment(false) }
  }

  async function cancelRentPaymentPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cancelPlanTarget) return
    setSavingPlanCancellation(true)
    setRentPlanError('')
    try {
      const response = await apiFetch(`/api/property-management/payment-plans/${cancelPlanTarget.id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: planCancelReason }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Could not cancel rent payment plan.')
      setCancelPlanTarget(null)
      setPlanCancelReason('')
      setRentPlanReload(value => value + 1)
    } catch (error: any) { setRentPlanError(error?.message || 'Could not cancel rent payment plan.') }
    finally { setSavingPlanCancellation(false) }
  }

  const customerInfo = data?.customer || customer
  const transactions = data?.transactions || []
  const canViewLedger = Boolean(data && (
    data.access.sales || data.access.payments || data.access.returns || data.access.creditNotes ||
    data.access.withdrawals || data.access.businessActivity || data.access.balance
  ))
  const canViewCreditHistory = Boolean(data?.access.creditHistory && data.creditHistory)
  const canViewRent = canLoadRentalProfile
  const canViewTenantHousehold = canLoadHouseholdProfile && householdTenancies.length > 0
  const hasRentalTenancies = Boolean(rentalData?.tenancies.length)
  const canViewTenancyAgreements = canViewRent || canViewRentalAgreements
  const canEditRentalDetails = hasPermission('canManageTenancies')
  const creditActivity = transactions.filter((row) => [
    'opening_balance', 'receivable_sale', 'property_sale', 'property_sale_payment', 'sale_payment_adjustment', 'customer_payment',
    'customer_credit_application', 'credit_note', 'sale_return', 'customer_withdrawal',
  ].includes(row.source))
  const commercialActivity = transactions.filter(row => {
    if (['receivable_sale', 'property_sale', 'pos_sale', 'customer_invoice'].includes(row.source)) return data?.access.sales
    if (['customer_payment', 'property_sale_payment', 'sale_payment_adjustment'].includes(row.source)) return data?.access.payments
    if (row.source === 'customer_withdrawal') return data?.access.withdrawals
    if (row.source === 'credit_note') return data?.access.creditNotes
    if (row.source === 'sale_return') return data?.access.returns
    return false
  })
  const canViewSalesAndPayments = Boolean(data && (
    data.access.sales || data.access.payments || data.access.withdrawals || data.access.creditNotes || data.access.returns || hasRentalTenancies
  ))
  const hasCommercialHistory = commercialActivity.length > 0
  const hasTradeTransactions = transactions.length > 0
  const hasTradePosition = Boolean(hasCommercialHistory || (data?.access.balance && (
    Number(data.summary.currentBalance || 0) !== 0 || Number(data.summary.openingBalance ?? data.customer.openingBalance ?? 0) !== 0 ||
    Number(data.customer.creditLimit || 0) > 0
  )))
  const rentalCharges = rentalData?.entries.filter(row => row.type === 'rent_due') || []
  const rentalPayments = rentalData?.entries.filter(row => ['rent_payment', 'rent_plan_payment'].includes(row.type)) || []
  const totalRentCharged = rentalCharges.reduce((total, row) => total + Number(row.debit || 0), 0)
  const totalRentCollected = rentalPayments.reduce((total, row) => total + Number(row.credit || 0), 0)
  const activeTenancies = rentalData?.tenancies.filter(row => row.status === 'active') || []
  const eligiblePlanTenancies = useMemo(() => {
    const grouped = new Map<string, { tenancyId: string; tenancyName: string; propertyName: string; unitCode: string; currency: string; balance: number; chargeCount: number }>()
    for (const charge of rentPlanData?.eligibleCharges || []) {
      const current = grouped.get(charge.tenancyId) || { tenancyId: charge.tenancyId, tenancyName: charge.tenancyName, propertyName: charge.propertyName, unitCode: charge.unitCode, currency: charge.currency, balance: 0, chargeCount: 0 }
      current.balance += Number(charge.balance || 0)
      current.chargeCount += 1
      grouped.set(charge.tenancyId, current)
    }
    return [...grouped.values()].map(row => ({ ...row, balance: Math.round(row.balance * 100) / 100 }))
  }, [rentPlanData?.eligibleCharges])
  const activeRentPlanBalance = (rentPlanData?.plans || []).filter(plan => plan.status === 'active').reduce((sum, plan) => sum + Math.max(0, Number(plan.totalAmount) - Number(plan.amountPaid)), 0)
  const lastDate = useMemo(() => data?.summary?.lastTransactionDate ? formatDisplayDate(data.summary.lastTransactionDate) : 'No activity yet', [data?.summary?.lastTransactionDate])

  const agreementDocumentAction = (title: string, draft: string, action: 'print' | 'download') => {
    const document = agreementHtml(title, `<h1>${markdownToHtml(title)}</h1><hr>${markdownToHtml(draft)}`)
    if (action === 'download') {
      const url = URL.createObjectURL(new Blob([document], { type: 'text/html;charset=utf-8' }))
      const link = window.document.createElement('a')
      link.href = url
      link.download = `${title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'tenancy-agreement'}.html`
      link.click()
      URL.revokeObjectURL(url)
      return
    }
    const popup = window.open('', '_blank')
    if (!popup) return
    popup.opener = null
    popup.document.write(document)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const content = (
    <div className="space-y-4">
        {presentation === 'page' ? (
          <div className="flex flex-wrap items-start gap-3 border-b pb-4">
            <Button variant="outline" onClick={() => navigate('/tenant/receivables/customers')}>Back to customers</Button>
            <div>
              <h1 className="text-xl font-semibold">{customerInfo?.name || 'Customer'}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{hasRentalTenancies ? 'Shared customer and tenant profile with separate trade and rental accounts.' : 'Customer profile and transaction ledger available to your role.'}</p>
            </div>
          </div>
        ) : <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-lg">
            <UserRound className="h-5 w-5 text-primary" />
            <span className="min-w-0 break-words">{customerInfo?.name || 'Customer'}</span>
          </DialogTitle>
          <DialogDescription>{viewMode === 'details' ? (hasRentalTenancies ? 'Customer and linked rental details available to your role.' : 'Customer details available to your role.') : (hasRentalTenancies ? 'Shared customer profile with separate trade and rental account activity.' : 'Customer profile and the transaction history available to your role.')}</DialogDescription>
        </DialogHeader>}

        {loading && (
          <div className="flex min-h-48 items-center justify-center rounded-md border">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data?.unavailableActivitySections?.length ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Customer and trade history loaded. Some optional activity is temporarily unavailable: {data.unavailableActivitySections.join(', ')}.</span>
          </div>
        ) : null}

        {!loading && !error && data && viewMode === 'details' && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-md border p-4">
              <h3 className="font-semibold">Contact details</h3>
              <dl className="mt-3 divide-y">
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{data.customer.name}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{data.access.phone ? data.customer.phone || 'Not provided' : data.customer.maskedPhone || '07xxxxxx'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Email</dt><dd className="break-all text-right font-medium">{data.access.email ? data.customer.email || 'Not provided' : data.customer.maskedEmail || 'x******@*****'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Address</dt><dd className="max-w-[70%] text-right font-medium">{data.access.address ? data.customer.address || 'Not provided' : data.customer.maskedAddress || '******'}</dd></div>
                <div className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">{data.customer.status || 'active'}</Badge></dd></div>
              </dl>
              {data.access.notes && data.customer.notes && <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm"><span className="font-medium">Notes: </span>{data.customer.notes}</p>}
              {!data.access.notes && data.customer.maskedNotes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Customer notes: {data.customer.maskedNotes}</p>}
            </section>
            <section className="rounded-md border p-4">
              <h3 className="font-semibold">{hasRentalTenancies ? 'Rental account summary' : 'Account summary'}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {hasRentalTenancies ? <>
                  {metric('Rent outstanding', rentalData?.closingBalance, 'text-amber-700')}
                  {metric('Rent charged', totalRentCharged)}
                  {metric('Rent collected', totalRentCollected, 'text-green-700')}
                </> : <>
                  {data.access.balance ? metric('Current balance', data.summary.currentBalance) : maskedMetric('Current balance')}
                  {data.access.creditLimit && metric('Credit limit', data.customer.creditLimit)}
                  {data.access.balance ? metric('Opening balance', data.summary.openingBalance ?? data.customer.openingBalance) : maskedMetric('Opening balance')}
                </>}
              </div>
              {data.access.balance && (data.summary.openingBalanceDate || data.customer.openingBalanceDate) && <p className="mt-3 text-xs text-muted-foreground">Opening balance date: {formatDisplayDate(data.summary.openingBalanceDate || data.customer.openingBalanceDate || '')}</p>}
            </section>
            {canViewRent && <section className="rounded-md border p-4 md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">Rental account</h3><p className="mt-1 text-sm text-muted-foreground">Rent is tracked separately from trade receivables and is not netted against the customer account.</p></div>
                <div className="grid grid-cols-2 gap-3 sm:min-w-72">{metric('Rent outstanding', rentalData?.closingBalance, 'text-amber-700')}{countMetric('Active agreements', rentalData?.tenancies.filter(row => row.status === 'active').length)}</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rentalData?.tenancies.map(row => <div key={row.id} className="rounded-md border p-3"><p className="font-medium">{row.unit.property.name} · {row.unit.unitCode}</p><p className="mt-1 text-xs text-muted-foreground">{row.agreementRef || 'Agreement not specified'} · {row.status}</p><p className="mt-2 text-sm">Monthly rent: {formatCurrency(Number(row.rentAmount), row.currency)}</p><p className="text-sm">Outstanding: {formatCurrency(Number(row.balance), row.currency)}</p></div>)}</div>
            </section>}
          </div>
        )}

        {!loading && !error && data && viewMode === 'profile' && (
          <Tabs key={`${customer?.id || ''}-${open}`} defaultValue="overview" className="space-y-4">
            <TabsList className="flex h-auto w-full flex-nowrap justify-start overflow-x-auto overscroll-x-contain sm:w-full">
              <TabsTrigger className="shrink-0" value="overview">Profile</TabsTrigger>
              {(canViewLedger || (hasRentalTenancies && canViewRent)) && <TabsTrigger className="shrink-0" value="ledger">{hasRentalTenancies && !hasTradeTransactions ? 'Rent ledger' : hasRentalTenancies ? 'Trade ledger' : 'Transaction ledger'} ({hasRentalTenancies && !hasTradeTransactions ? rentalData?.entries.length || 0 : Number(data.summary.transactionCount || 0)})</TabsTrigger>}
              {canViewSalesAndPayments && <TabsTrigger className="shrink-0" value="sales-payments">{hasRentalTenancies && !hasCommercialHistory ? 'Rent activity' : hasRentalTenancies ? 'Trade activity' : 'Account activity'}</TabsTrigger>}
              {(canViewCreditHistory || (hasRentalTenancies && canViewRent)) && <TabsTrigger className="shrink-0" value="credit-history">{hasRentalTenancies ? 'Tenant standing' : 'Credit History'}</TabsTrigger>}
              {canViewRent && <TabsTrigger className="shrink-0" value="rent">{hasRentalTenancies ? 'Tenancies & rent' : 'Rental profile'}</TabsTrigger>}
              {canViewTenancyAgreements && <TabsTrigger className="shrink-0" value="tenancy-agreements">Tenancy Agreement</TabsTrigger>}
              {canViewRentPaymentPlans && <TabsTrigger className="shrink-0" value="payment-plans">Payment Plans</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[1.2fr_2fr]">
              <div className="rounded-md border p-4">
                <div className="flex items-center gap-3">
                  {rentalData?.access.identity && rentalData.customer.profilePhotoUrl && <img src={rentalData.customer.profilePhotoUrl} alt={`${data.customer.name} profile`} className="h-16 w-16 rounded-full border object-cover" />}
                  <div><p className="text-xs font-semibold uppercase text-muted-foreground">{hasRentalTenancies ? 'Customer & tenant' : 'Customer'}</p>
                <h3 className="mt-2 break-words text-lg font-semibold">{data.customer.name}</h3>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>{data.access.phone ? data.customer.phone || 'No phone on file' : data.customer.maskedPhone || '07xxxxxx'}</p>
                  <p className="break-words">{data.access.email ? data.customer.email || 'No email on file' : data.customer.maskedEmail || 'x******@*****'}</p>
                  <p className="break-words">{data.access.address ? data.customer.address || 'No address on file' : data.customer.maskedAddress || '******'}</p>
                </div>
                {data.access.notes && data.customer.notes && <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm">{data.customer.notes}</p>}
                {rentalData?.access.identity && <div className="mt-4 border-t pt-3">
                  <p className="text-sm font-medium">National ID {rentalData.customer.nationalId ? `· ${rentalData.customer.nationalId}` : ''}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {rentalData.customer.nationalIdFrontUrl && <a href={rentalData.customer.nationalIdFrontUrl} target="_blank" rel="noreferrer"><img src={rentalData.customer.nationalIdFrontUrl} alt="National ID front" className="h-32 w-full rounded border object-cover" /><span className="mt-1 block text-xs text-muted-foreground">Front side</span></a>}
                    {rentalData.customer.nationalIdBackUrl && <a href={rentalData.customer.nationalIdBackUrl} target="_blank" rel="noreferrer"><img src={rentalData.customer.nationalIdBackUrl} alt="National ID back" className="h-32 w-full rounded border object-cover" /><span className="mt-1 block text-xs text-muted-foreground">Back side</span></a>}
                  </div>
                </div>}
                {!data.access.notes && data.customer.maskedNotes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Customer notes: {data.customer.maskedNotes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.customer.status && <Badge variant="outline">{data.customer.status}</Badge>}
                  <Badge variant="secondary">{data.access.balance ? `Trust ${Number(data.customer.trustScore || 0)}/100` : 'Trust ****'}</Badge>
                  <Badge variant="outline" className="gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Last {lastDate}
                  </Badge>
                </div>
              </div>

              <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {hasRentalTenancies ? <>
                  {metric('Rent outstanding', rentalData?.closingBalance, 'text-amber-700')}
                  {metric('Rent charged', totalRentCharged)}
                  {metric('Rent collected', totalRentCollected, 'text-green-700')}
                  {countMetric('Rental agreements', rentalData?.tenancies.length)}
                  {countMetric('Active tenancies', activeTenancies.length)}
                  {countMetric('Rental ledger entries', rentalData?.entries.length)}
                </> : <>
                {data.access.balance && metric(canViewRent ? 'Trade receivables balance' : 'Current balance', data.summary.currentBalance, Number(data.summary.currentBalance || 0) > 0 ? 'text-red-700' : 'text-green-700')}
                  {data.access.balance && data.access.creditLimit && metric(canViewRent ? 'Available trade credit' : 'Available credit', data.summary.availableCredit, Number(data.summary.availableCredit || 0) >= 0 ? 'text-green-700' : 'text-red-700')}
                {data.access.sales && metric(canViewRent ? 'Sales on trade account' : 'Sales on account', data.summary.receivableSales)}
                {data.access.sales && metric(canViewRent ? 'Counter sales' : 'Cash sales', data.summary.cashSales)}
                {data.access.payments && metric(canViewRent ? 'Trade account payments' : 'Customer payments', data.summary.payments, 'text-green-700')}
                {data.access.withdrawals && metric(canViewRent ? 'Trade account withdrawals' : 'Customer withdrawals', data.summary.withdrawals)}
                {data.access.creditNotes && metric(canViewRent ? 'Trade credit notes' : 'Credit notes', data.summary.creditNotes, 'text-green-700')}
                {data.access.returns && metric(canViewRent ? 'Trade returns' : 'Sales returns', data.summary.returns)}
                {countMetric(canViewRent ? 'Commercial transactions' : 'Transactions', data.summary.transactionCount)}
                </>}
                {hasRentalTenancies && hasTradePosition && <div className="sm:col-span-2 xl:col-span-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Trade account position</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.access.balance && metric('Trade receivables balance', data.summary.currentBalance)}
                  {data.access.balance && metric('Trade opening balance', data.summary.openingBalance ?? data.customer.openingBalance)}
                  {data.access.creditLimit && metric('Trade credit limit', data.customer.creditLimit)}
                  {data.access.balance && data.access.creditLimit && metric('Available trade credit', data.summary.availableCredit)}
                  {data.access.sales && hasCommercialHistory && metric('Sales on account', data.summary.receivableSales)}
                  {data.access.payments && hasCommercialHistory && metric('Customer payments', data.summary.payments, 'text-green-700')}
                  {data.access.withdrawals && hasCommercialHistory && metric('Customer withdrawals', data.summary.withdrawals)}
                  {data.access.creditNotes && hasCommercialHistory && metric('Credit notes', data.summary.creditNotes, 'text-green-700')}
                  {data.access.returns && hasCommercialHistory && metric('Sales returns', data.summary.returns)}
                </div></div>}
              </div>
            </div>

            {canViewTenantHousehold && <section className="space-y-3 rounded-md border p-4"><div><h3 className="font-semibold">Renter household details</h3><p className="text-xs text-muted-foreground">Optional details recorded on each tenancy.</p></div>{householdTenancies.map(row => <div key={row.id} className="space-y-3 border-t pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{row.unit.property.name} · {row.unit.unitCode}</p>{hasPermission('canManageTenantPersonalDetails') && <Button type="button" variant="outline" size="sm" onClick={() => { setEditingHouseholdTenancyId(editingHouseholdTenancyId === row.id ? null : row.id); setHouseholdError('') }}>{editingHouseholdTenancyId === row.id ? 'Close editor' : 'Edit household details'}</Button>}</div>{editingHouseholdTenancyId === row.id ? <form onSubmit={saveHousehold}><HouseholdDetailsFields defaults={row}/>{householdError && <p role="alert" className="mt-2 text-sm text-destructive">{householdError}</p>}<div className="mt-3 flex justify-end"><Button type="submit" disabled={savingHousehold}>{savingHousehold ? 'Saving…' : 'Save household details'}</Button></div></form> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs text-muted-foreground">Marital status</p><p className="text-sm">{row.maritalStatus ? normalizeText(row.maritalStatus) : 'Not provided'}</p></div><div><p className="text-xs text-muted-foreground">Spouse name(s)</p><p className="text-sm">{row.spouseNames || 'Not provided'}</p></div><div><p className="text-xs text-muted-foreground">Children</p><p className="text-sm">{row.childrenCount == null ? 'Not provided' : row.childrenCount === 0 ? 'No children' : row.childrenCount}</p></div><div><p className="text-xs text-muted-foreground">Household size</p><p className="text-sm">{row.householdSize ?? 'Not provided'}</p></div><div><p className="text-xs text-muted-foreground">Place of origin</p><p className="text-sm">{row.placeOfOrigin || 'Not provided'}</p></div></div>}</div>)}</section>}

            {(data.access.recordPayment || data.access.withdraw || data.access.edit || data.access.delete || (hasRentalTenancies && canEditRentalDetails && onEditCustomer)) && (
              <div className="flex flex-wrap gap-2 border-b pb-4">
                {data.access.recordPayment && onRecordPayment && (
                  <Button size="sm" onClick={() => onRecordPayment({ ...data.customer, ...data.summary })}>
                    Record Payment
                  </Button>
                )}
                {data.access.withdraw && onWithdraw && (
                  <Button size="sm" variant="outline" disabled={Number(data.summary.availableForWithdrawal ?? data.customer.availableForWithdrawal ?? 0) <= 0} onClick={() => onWithdraw({ ...data.customer, ...data.summary })}>
                    Withdraw Customer Funds
                  </Button>
                )}
                {(hasRentalTenancies ? canEditRentalDetails : data.access.edit) && onEditCustomer && (
                  <Button size="sm" variant="outline" onClick={() => onEditCustomer({ ...data.customer, ...data.summary, ...(hasRentalTenancies ? { rentalTenancies: rentalData?.tenancies } : {}) })}>
                    <Edit className="mr-1 h-4 w-4" />
                    {hasRentalTenancies ? 'Edit tenant details' : 'Edit customer'}
                  </Button>
                )}
                {data.access.delete && onDeleteCustomer && Number(data.summary.currentBalance || 0) === 0 && Number(data.summary.transactionCount || 0) === 0 && (
                  <Button size="sm" variant="destructive" onClick={() => onDeleteCustomer({ ...data.customer, ...data.summary, canDelete: true })}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete Customer
                  </Button>
                )}
              </div>
            )}

            </TabsContent>

            {(canViewLedger || (hasRentalTenancies && canViewRent)) && <TabsContent value="ledger" className="space-y-4">
            {hasRentalTenancies && !hasTradeTransactions ? <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[760px] w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Rental activity</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Rent charged</th><th className="px-3 py-2 text-right">Payment</th><th className="px-3 py-2 text-right">Balance</th></tr></thead><tbody>{rentalData?.entries.map(row => <tr key={`${row.type}-${row.id}`} className="border-t"><td className="whitespace-nowrap px-3 py-2">{formatDisplayDate(row.date)}</td><td className="px-3 py-2">{row.description}<div className="text-xs text-muted-foreground">{normalizeText(row.type)}</div></td><td className="px-3 py-2">{row.reference || '—'}</td><td className="px-3 py-2 text-right">{row.debit ? formatCurrency(row.debit) : '—'}</td><td className="px-3 py-2 text-right">{row.credit ? formatCurrency(row.credit) : '—'}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(row.runningBalance)}</td></tr>)}{!rentalData?.entries.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No rent charges or payments have been recorded for these agreements.</td></tr>}</tbody></table>
            </div> : <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[1320px] w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length ? transactions.map((row) => (
                    <tr key={row.id} className="border-t align-top hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">{row.date ? formatDisplayDate(row.date) : '-'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.affectsBalance ? 'default' : 'outline'}>{row.type}</Badge>
                      </td>
                              <td className="px-3 py-2 font-mono text-xs">{displayReference(row.reference, row.id, row.type || 'Transaction')}</td>
                      <td className="px-3 py-2">
                        <p className="break-words">{row.description || '-'}</p>
                        {row.branch && <p className="mt-1 text-xs text-muted-foreground">{row.branch}</p>}
                        {row.items?.length ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-medium text-primary">View goods/services ({row.items.length})</summary>
                            <div className="mt-2 overflow-x-auto rounded border">
                              <table className="min-w-[620px] w-full text-xs">
                                <thead className="bg-muted/40 text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Item</th>
                                    <th className="px-2 py-1 text-right">Qty</th>
                                    <th className="px-2 py-1 text-right">Price</th>
                                    <th className="px-2 py-1 text-right">Discount</th>
                                    <th className="px-2 py-1 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.items.map((item, index) => (
                                    <tr key={item.id || index} className="border-t">
                                      <td className="px-2 py-1">
                                        <span className="block break-words font-medium">{item.productName || 'Item'}</span>
                                        {item.sku && <span className="text-muted-foreground">{item.sku}</span>}
                                      </td>
                                      <td className="px-2 py-1 text-right">{item.quantity || 0} {item.unitName || ''}</td>
                                      <td className="px-2 py-1 text-right">{formatCurrency(Number(item.unitPrice || 0))}</td>
                                      <td className="px-2 py-1 text-right">{formatCurrency(Number(item.discount || 0))}</td>
                                      <td className="px-2 py-1 text-right font-medium">{formatCurrency(Number(item.total || 0))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 capitalize">{normalizeText(row.paymentMethod) || '-'}</td>
                      <td className="px-3 py-2">{row.staff || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(row.amount || 0))}</td>
                      <td className="px-3 py-2 text-right">{Number(row.debit || 0) > 0 ? formatCurrency(Number(row.debit)) : '-'}</td>
                      <td className="px-3 py-2 text-right">{Number(row.credit || 0) > 0 ? formatCurrency(Number(row.credit)) : '-'}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold', data.access.balance ? transactionTone(row) : 'text-muted-foreground')}>{data.access.balance ? formatCurrency(Number(row.balance || 0)) : '******'}</td>
                      <td className="px-3 py-2">
                        {data.access.printReceipts && (row.receiptStatus ? <Badge variant={row.receiptStatus === 'cancelled' ? 'destructive' : 'outline'}>{row.receiptStatus === 'cancelled' ? 'Cancelled' : 'Adjusted'}</Badge> : !['credit_note', 'sale_return'].includes(row.source) && !/opening balance|system adjustment/i.test(`${row.type} ${row.source}`) && <TransactionReceiptButton label={['customer_payment', 'property_sale_payment'].includes(row.source) ? 'Print payment receipt' : 'Print transaction'} data={customerActivityReceipt(row, data.customer.name)} />)}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                        {Object.values(data.access).some(Boolean) ? 'No transactions are available for this customer and your assigned permissions.' : 'No customer profile details or history are assigned to your role.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {data.access.balance && <><ReceiptText className="h-4 w-4" /><span>Debit increases the customer balance. Credit reduces the customer balance.</span></>}
              {data.access.sales && <><Wallet className="ml-2 h-4 w-4" /><span>Cash POS sales are shown as activity but do not change receivables.</span></>}
              {data.access.balance && <><CreditCard className="ml-2 h-4 w-4" /><span>{canViewRent ? 'Trade balance is separate from rent due.' : 'Current balance comes from the customer account.'}</span></>}
            </div>
            </TabsContent>}

            {canViewRent && <TabsContent value="rent" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {metric('Rent outstanding', rentalData?.closingBalance)}
                {countMetric('Rental agreements', rentalData?.tenancies.length)}
                {countMetric('Active agreements', rentalData?.tenancies.filter(row => row.status === 'active').length)}
              </div>
              <RentArrearsAging aging={rentalData?.arrearsAging} />
              <section className="overflow-hidden rounded-md border">
                <div className="border-b px-4 py-3"><h3 className="font-semibold">Tenancy history</h3></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Property / unit</th><th className="p-3">Agreement</th><th className="p-3">Period</th><th className="p-3 text-right">Monthly rent</th><th className="p-3 text-right">Outstanding</th><th className="p-3">Status</th></tr></thead><tbody>{rentalData?.tenancies.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.unit.property.name}<div className="text-xs text-muted-foreground">{row.unit.unitCode}{row.unit.property.owner?.name ? ` · ${row.unit.property.owner.name}` : ''}</div></td><td className="p-3">{row.agreementRef || '—'}</td><td className="p-3">{formatDisplayDate(row.startDate)}{row.endDate ? ` – ${formatDisplayDate(row.endDate)}` : ''}</td><td className="p-3 text-right">{formatCurrency(Number(row.rentAmount), row.currency)}</td><td className="p-3 text-right font-medium">{formatCurrency(Number(row.balance), row.currency)}</td><td className="p-3"><Badge variant={row.status === 'active' ? 'default' : 'outline'}>{row.status}</Badge></td></tr>)}{!rentalData?.tenancies.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No rental agreements are linked to this customer yet.</td></tr>}</tbody></table></div>
              </section>
              {hasPermission('canRecordRentPayment') && <div className="flex flex-wrap gap-2">{rentalData?.tenancies.filter(row => row.status === 'active' && row.balance > 0).map(row => <Button key={row.id} type="button" variant="outline" size="sm" onClick={() => navigate('/tenant/property-management/rent', { state: { recordRentPayment: row.id } })}>Record rent · {row.unit.property.name} / {row.unit.unitCode}</Button>)}</div>}
              {hasPermission('canManageTenancies') && <section className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Tenant identity documents</h3><p className="text-xs text-muted-foreground">Update the profile photo and both National ID sides.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setEditingIdentity(value => !value)}>{editingIdentity ? 'Close' : 'Update documents'}</Button></div>
                {editingIdentity && <form onSubmit={saveIdentity} className="mt-4 space-y-3"><label className="block text-sm">National ID number<input name="nationalId" defaultValue={rentalData?.customer.nationalId || ''} className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label><div className="grid gap-3 sm:grid-cols-3">{[['profilePhoto','Profile photo'],['nationalIdFront','National ID · front'],['nationalIdBack','National ID · back']].map(([name,label]) => <label key={name} className="block text-sm">{label}<input name={name} type="file" accept="image/*" className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1.5" /></label>)}</div>{identityError && <p role="alert" className="text-sm text-destructive">{identityError}</p>}<Button type="submit" disabled={savingIdentity}>{savingIdentity ? 'Saving…' : 'Save identity details'}</Button></form>}
              </section>}
              <section className="overflow-hidden rounded-md border">
                <div className="border-b px-4 py-3"><h3 className="font-semibold">Rent ledger</h3><p className="text-xs text-muted-foreground">Rent charges and receipts are shown from the rental ledger.</p></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Reference</th><th className="p-3 text-right">Charge</th><th className="p-3 text-right">Receipt</th><th className="p-3 text-right">Balance</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{rentalData?.entries.map(row => <tr key={`${row.type}-${row.id}`} className="border-t"><td className="p-3">{formatDisplayDate(row.date)}</td><td className="p-3">{row.description}</td><td className="p-3">{row.reference}</td><td className="p-3 text-right">{row.debit ? formatCurrency(row.debit, row.currency) : '—'}</td><td className="p-3 text-right">{row.credit ? formatCurrency(row.credit, row.currency) : '—'}</td><td className="p-3 text-right font-medium">{formatCurrency(row.runningBalance, row.currency)}</td><td className="p-3 text-right">{canPrintRentReceipts && row.credit > 0 && row.type !== 'opening_rent_settlement' && <TransactionReceiptButton label="Reprint" data={{ title: row.type === 'rent_plan_payment' ? 'Rent Payment Plan Receipt' : 'Rent Payment Receipt', reference: row.reference, date: row.date, amount: Number(row.credit), currency: row.currency, partyLabel: 'Renter', partyName: rentalData?.tenancies.find(tenancy => tenancy.id === row.tenancyId)?.tenantName, fields: [{ label: 'Property', value: row.propertyName }, { label: 'Unit', value: row.unitCode }, { label: 'Rent period', value: formatRentPeriods(row.rentPeriods) || null }, { label: 'Prior arrears added', value: row.arrearsMonths ? `${row.arrearsMonths} month(s)` : null }, { label: 'Repayment plan', value: row.planNo }, { label: 'Payment method', value: normalizeText(row.paymentMethod) }, { label: 'Received by', value: row.receivedBy }, { label: 'Transaction reference', value: row.transactionRef }, { label: 'Note', value: row.notes }] }} />}</td></tr>)}{!rentalData?.entries.length && <tr><td colSpan={7} className="p-5 text-center text-sm text-muted-foreground">No rental charges or receipts are recorded.</td></tr>}</tbody></table></div>
              </section>
            </TabsContent>}

            {canViewTenancyAgreements && <TabsContent value="tenancy-agreements" className="space-y-5">
              <div><h3 className="font-semibold">Tenancy agreements</h3><p className="mt-1 text-sm text-muted-foreground">Review saved agreement terms and print or download a formatted copy.</p></div>
              {canViewRent && rentalData?.tenancies.map(tenancy => {
                const title = `Tenancy Agreement ${tenancy.agreementRef || tenancy.unit.unitCode}`
                const draft = [
                  `**Agreement reference:** ${tenancy.agreementRef || 'Not provided'}`,
                  `**Renter:** ${tenancy.tenantName}`,
                  `**Property / unit:** ${tenancy.unit.property.name} / ${tenancy.unit.unitCode}`,
                  `**Term:** ${formatDisplayDate(tenancy.startDate)}${tenancy.endDate ? ` to ${formatDisplayDate(tenancy.endDate)}` : ' ongoing'}`,
                  `**Monthly rent:** ${formatCurrency(Number(tenancy.rentAmount), tenancy.currency)}`,
                  `**Security deposit required:** ${formatCurrency(Number(tenancy.depositRequired || 0), tenancy.currency)}`,
                  `**Security deposit held:** ${formatCurrency(Number(tenancy.depositHeld || 0), tenancy.currency)}`,
                  `**Status:** ${normalizeText(tenancy.status)}`,
                  '',
                  '**Agreement notes and terms**',
                  tenancy.agreementNotes || 'No agreement notes have been recorded.',
                ].join('\n')
                return <section key={`property-${tenancy.id}`} className="space-y-3 rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{title}</h4><p className="mt-1 text-sm text-muted-foreground">{tenancy.tenantName} · {tenancy.unit.property.name} / {tenancy.unit.unitCode}</p></div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => agreementDocumentAction(title, draft, 'print')}><Printer className="mr-1.5 h-4 w-4" />Print</Button><Button type="button" variant="outline" size="sm" onClick={() => agreementDocumentAction(title, draft, 'download')}><Download className="mr-1.5 h-4 w-4" />Download</Button></div></div>
                  <div className="rounded-md bg-muted/20 p-3"><RichTextDisplay value={draft} className="space-y-1 text-sm leading-6" /></div>
                </section>
              })}
              {canViewRentalAgreements && rentalAgreements.map(rental => <section key={`rental-${rental.id}`} className="space-y-3 rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">Tenancy Agreement · {rental.rentalNo}</h4><p className="mt-1 text-sm text-muted-foreground">{formatDisplayDate(rental.hireDate)} – {formatDisplayDate(rental.expectedReturnDate)} · {normalizeText(rental.bookingState || rental.status)}</p></div>{rental.contractDraft && <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => agreementDocumentAction(`Tenancy Agreement ${rental.rentalNo}`, rental.contractDraft || '', 'print')}><Printer className="mr-1.5 h-4 w-4" />Print</Button><Button type="button" variant="outline" size="sm" onClick={() => agreementDocumentAction(`Tenancy Agreement ${rental.rentalNo}`, rental.contractDraft || '', 'download')}><Download className="mr-1.5 h-4 w-4" />Download</Button></div>}</div>
                {rental.contractDraft ? <div className="max-h-[520px] overflow-y-auto rounded-md bg-muted/20 p-3"><RichTextDisplay value={rental.contractDraft} className="space-y-1 text-sm leading-6" /></div> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No agreement draft has been saved for this rental yet.</p>}
              </section>)}
              {rentalAgreementsLoading && <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">Loading rental agreements…</div>}
              {rentalAgreementsError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{rentalAgreementsError}</div>}
              {!rentalAgreementsLoading && !rentalAgreementsError && canViewRentalAgreements && rentalAgreements.length === 0 && (!canViewRent || !rentalData?.tenancies.length) && <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No tenancy agreements are linked to this customer.</div>}
            </TabsContent>}

            {canViewRentPaymentPlans && <TabsContent value="payment-plans" className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-semibold">Renter repayment plans</h3><p className="text-sm text-muted-foreground">Schedule eligible overdue rent and record installments from this profile.</p></div>
                {canManageRentPaymentPlans && <Button type="button" disabled={savingPlan || eligiblePlanTenancies.length === 0} title={eligiblePlanTenancies.length ? 'Create a plan for the oldest eligible overdue tenancy' : 'A repayment plan requires unplanned overdue rent'} onClick={() => { setRentPlanError(''); setCreatePlanTenancyId(eligiblePlanTenancies[0]?.tenancyId || '') }}><ReceiptText className="mr-2 h-4 w-4" />Create repayment plan</Button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {countMetric('Repayment plans', rentPlanData?.plans.length)}
                {metric('Balance under active plans', activeRentPlanBalance)}
                {metric('Unplanned overdue rent', (rentPlanData?.eligibleCharges || []).reduce((sum, charge) => sum + Number(charge.balance || 0), 0))}
              </div>
              <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">Plans cover existing overdue rent only. The agreement does not create new rent or duplicate receivables; JibuSales moves the agreed balance to its system-managed plan receivable account, then posts each actual receipt against that balance.</p>
              {rentPlanError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{rentPlanError}</p>}
              {createPlanTenancyId ? (() => {
                const tenancy = eligiblePlanTenancies.find(row => row.tenancyId === createPlanTenancyId)
                if (!tenancy) return null
                return <form onSubmit={createRentPaymentPlan} className="space-y-3 rounded-md border border-primary/30 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">Create arrears plan</h3><p className="text-sm text-muted-foreground">{tenancy.propertyName} · {tenancy.unitCode} · {tenancy.chargeCount} overdue rent charge(s)</p></div><p className="text-right text-sm font-semibold">{formatCurrency(tenancy.balance, tenancy.currency)}</p></div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm">Installments<select name="installmentCount" defaultValue="3" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="1">1 payment</option><option value="2">2 payments</option><option value="3">3 payments</option><option value="4">4 payments</option><option value="6">6 payments</option><option value="8">8 payments</option><option value="12">12 payments</option><option value="18">18 payments</option><option value="24">24 payments</option><option value="36">36 payments</option></select></label>
                    <label className="block text-sm">Frequency<select name="frequency" defaultValue="monthly" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
                    <label className="block text-sm">First payment due<input name="startDate" type="date" required defaultValue={localDateInputValue()} className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
                  </div>
                  <label className="block text-sm">Agreement notes<textarea name="notes" maxLength={1000} rows={2} placeholder="Agreed payment date, follow-up arrangement, or other terms" className="mt-1 w-full rounded-md border bg-background p-3" /></label>
                  <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreatePlanTenancyId('')}>Close</Button><Button type="submit" disabled={savingPlan}>{savingPlan ? 'Creating…' : 'Create plan and post reclassification'}</Button></div>
                </form>
              })() : null}

              {canManageRentPaymentPlans && eligiblePlanTenancies.length > 0 && <section className="space-y-3">
                <div><h3 className="font-semibold">Overdue rent available for a plan</h3><p className="text-xs text-muted-foreground">Each plan is tied to one tenancy and includes all currently unplanned overdue charges on that agreement.</p></div>
                <div className="overflow-x-auto rounded-md border"><table className="min-w-[680px] w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Property / unit</th><th className="px-3 py-2">Overdue periods</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{eligiblePlanTenancies.map(row => <tr key={row.tenancyId} className="border-t"><td className="px-3 py-2">{row.propertyName}<div className="text-xs text-muted-foreground">{row.unitCode}</div></td><td className="px-3 py-2">{row.chargeCount}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.balance, row.currency)}</td><td className="px-3 py-2 text-right"><Button type="button" size="sm" variant="outline" onClick={() => setCreatePlanTenancyId(row.tenancyId)}>Create plan</Button></td></tr>)}</tbody></table></div>
              </section>}

              {!rentPlanData && !rentPlanError && <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Loading payment plans…</div>}
              {rentPlanData && !rentPlanData.plans.length && !eligiblePlanTenancies.length && <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">No repayment plans or unplanned overdue rent for this renter.</div>}
              {rentPlanData?.plans.map(plan => {
                const remaining = Math.max(0, Number(plan.totalAmount) - Number(plan.amountPaid))
                const accountOptions = rentPlanAccounts.filter(account => account.paymentMethod === planPaymentMethod)
                const progress = plan.totalAmount > 0 ? Math.min(100, Math.round(Number(plan.amountPaid) / Number(plan.totalAmount) * 100)) : 0
                return <section key={plan.id} className="space-y-4 rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{plan.planNo}</h3><Badge variant={plan.status === 'active' ? 'default' : plan.status === 'completed' ? 'outline' : 'secondary'}>{normalizeText(plan.status)}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{plan.tenancy.unit.property.name} · {plan.tenancy.unit.unitCode} · {plan.installmentCount} {normalizeText(plan.frequency)} installments from {formatDisplayDate(plan.startDate)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Remaining</p><p className="text-lg font-semibold">{formatCurrency(remaining, plan.tenancy.currency)}</p></div></div>
                  <div><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Paid {formatCurrency(plan.amountPaid, plan.tenancy.currency)}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} /></div></div>
                  {plan.notes && <p className="whitespace-pre-wrap rounded bg-muted/30 p-3 text-sm">{plan.notes}</p>}
                  <div className="overflow-x-auto rounded-md border"><table className="min-w-[620px] w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Due date</th><th className="px-3 py-2 text-right">Installment</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Remaining</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{plan.installments.map(item => <tr key={item.id} className="border-t"><td className="px-3 py-2">{item.sequence}</td><td className="px-3 py-2">{formatDisplayDate(item.dueDate)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.amount, plan.tenancy.currency)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.amountPaid, plan.tenancy.currency)}</td><td className="px-3 py-2 text-right">{formatCurrency(Math.max(0, item.amount - item.amountPaid), plan.tenancy.currency)}</td><td className="px-3 py-2"><Badge variant={item.status === 'paid' ? 'outline' : item.status === 'overdue' ? 'destructive' : 'secondary'}>{normalizeText(item.status)}</Badge></td></tr>)}</tbody></table></div>
                  {plan.payments.length > 0 && <div className="space-y-2"><h4 className="text-sm font-semibold">Receipts</h4><div className="overflow-x-auto rounded-md border"><table className="min-w-[700px] w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Date / receipt</th><th className="px-3 py-2">Payment method</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Print</th></tr></thead><tbody>{plan.payments.map(payment => <tr key={payment.id} className="border-t"><td className="px-3 py-2">{formatDisplayDate(payment.paymentDate)}<div className="text-xs text-muted-foreground">{payment.receiptNo}</div></td><td className="px-3 py-2 capitalize">{normalizeText(payment.paymentMethod)}</td><td className="px-3 py-2">{payment.transactionRef || '—'}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(payment.amount, plan.tenancy.currency)}</td><td className="px-3 py-2 text-right"><TransactionReceiptButton label="Reprint" data={{ title: 'Rent Payment Receipt', reference: payment.receiptNo, date: payment.paymentDate, amount: Number(payment.amount), currency: plan.tenancy.currency, partyLabel: 'Renter', partyName: plan.tenancy.tenantName, fields: [{ label: 'Property', value: plan.tenancy.unit.property.name }, { label: 'Unit', value: plan.tenancy.unit.unitCode }, { label: 'Rent period', value: formatRentPeriods(payment.rentPeriods) || null }, { label: 'Repayment plan', value: plan.planNo }, { label: 'Payment method', value: normalizeText(payment.paymentMethod) }, { label: 'Received by', value: payment.receivedBy }, { label: 'Transaction reference', value: payment.transactionRef }, { label: 'Installments covered', value: payment.planInstallmentAllocations?.map(allocation => `#${allocation.installment.sequence}: ${formatCurrency(allocation.amount, plan.tenancy.currency)}`).join(', ') }] }} /></td></tr>)}</tbody></table></div></div>}
                  <div className="flex flex-wrap justify-end gap-2">{canRecordRentPayment && plan.status === 'active' && remaining > 0.01 && <Button type="button" size="sm" onClick={() => { setPlanPaymentTarget(plan); const method = rentPlanAccounts.find(account => account.id === defaultRentPlanAccountId)?.paymentMethod || rentPlanAccounts[0]?.paymentMethod || 'cash'; setPlanPaymentMethod(method); setPlanPaymentAccountId(rentPlanAccounts.find(account => account.id === defaultRentPlanAccountId && account.paymentMethod === method)?.id || rentPlanAccounts.find(account => account.paymentMethod === method)?.id || '') }}>Record installment</Button>}{canManageRentPaymentPlans && plan.status === 'active' && <Button type="button" size="sm" variant="outline" onClick={() => { setCancelPlanTarget(plan); setPlanCancelReason('') }}>Cancel plan</Button>}</div>
                  {planPaymentTarget?.id === plan.id && <form onSubmit={recordRentPlanPayment} className="grid gap-3 rounded-md bg-muted/20 p-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><h4 className="text-sm font-semibold">Record plan installment</h4><p className="text-xs text-muted-foreground">Outstanding plan balance: {formatCurrency(remaining, plan.tenancy.currency)}. Payment is posted to the plan receivable account and allocated to the oldest unpaid plan installment.</p></div>
                    <label className="block text-sm">Amount<input name="amount" type="number" min="0.01" max={remaining} step="0.01" required className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
                    <label className="block text-sm">Payment date<input name="paymentDate" type="date" required defaultValue={localDateInputValue()} className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
                    <label className="block text-sm">Payment method<select value={planPaymentMethod} onChange={event => { const method = event.target.value; setPlanPaymentMethod(method); setPlanPaymentAccountId(rentPlanAccounts.find(account => account.paymentMethod === method)?.id || '') }} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{[...new Set(rentPlanAccounts.map(account => account.paymentMethod))].map(method => <option key={method} value={method}>{normalizeText(method)}</option>)}</select></label>
                    <label className="block text-sm">Transaction account<select required value={planPaymentAccountId} onChange={event => setPlanPaymentAccountId(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{accountOptions.map(account => <option key={account.id} value={account.id}>{account.name} · {normalizeText(account.type)}</option>)}</select></label>
                    <label className="block text-sm">Transaction reference<input name="transactionRef" maxLength={120} className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
                    <label className="block text-sm">Notes<input name="notes" maxLength={500} className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label>
                    {!accountOptions.length && <p className="text-sm text-destructive sm:col-span-2">No permitted transaction account is available for this payment method.</p>}
                    <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setPlanPaymentTarget(null)}>Close</Button><Button type="submit" disabled={savingPlanPayment || !planPaymentAccountId}>{savingPlanPayment ? 'Posting…' : 'Post payment'}</Button></div>
                  </form>}
                  {cancelPlanTarget?.id === plan.id && <form onSubmit={cancelRentPaymentPlan} className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm">Cancellation reason<input value={planCancelReason} onChange={event => setPlanCancelReason(event.target.value)} minLength={5} maxLength={500} required className="mt-1 h-10 w-full rounded-md border bg-background px-3" /></label><Button type="button" variant="outline" onClick={() => setCancelPlanTarget(null)}>Keep active</Button><Button type="submit" variant="destructive" disabled={savingPlanCancellation}>{savingPlanCancellation ? 'Cancelling…' : 'Cancel and release remaining balance'}</Button></form>}
                </section>
              })}
            </TabsContent>}

            {canViewSalesAndPayments && <TabsContent value="sales-payments" className="space-y-4">
              {hasRentalTenancies && !hasCommercialHistory ? <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {metric('Rent charged', totalRentCharged)}
                  {metric('Rent collected', totalRentCollected, 'text-green-700')}
                  {metric('Rent outstanding', rentalData?.closingBalance, 'text-amber-700')}
                  {countMetric('Active tenancies', activeTenancies.length)}
                </div>
                <div className="overflow-x-auto rounded-md border"><table className="min-w-[760px] w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Payment date</th><th className="px-3 py-2">Property / unit</th><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Amount collected</th></tr></thead><tbody>{rentalPayments.map(row => <tr key={row.id} className="border-t"><td className="px-3 py-2">{formatDisplayDate(row.date)}</td><td className="px-3 py-2">{row.description}</td><td className="px-3 py-2">{row.reference || '—'}</td><td className="px-3 py-2 capitalize">{normalizeText(row.paymentMethod) || '—'}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(row.credit)}</td></tr>)}{!rentalPayments.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No rent payments have been recorded for these agreements.</td></tr>}</tbody></table></div>
              </> : <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.access.sales && metric(canViewRent ? 'Sales on trade account' : 'Sales on account', data.summary.receivableSales)}
                {data.access.sales && metric(canViewRent ? 'Counter sales' : 'Cash sales', data.summary.cashSales)}
                {data.access.payments && metric(canViewRent ? 'Trade account payments received' : 'Customer payments received', data.summary.payments, 'text-green-700')}
                {data.access.withdrawals && metric(canViewRent ? 'Trade account withdrawals' : 'Customer withdrawals', data.summary.withdrawals)}
                {data.access.creditNotes && metric(canViewRent ? 'Trade credit notes' : 'Credit notes', data.summary.creditNotes, 'text-green-700')}
                {data.access.returns && metric(canViewRent ? 'Trade returns' : 'Sales returns', data.summary.returns)}
                {data.access.balance && metric(canViewRent ? 'Trade receivables balance' : 'Current balance', data.summary.currentBalance, Number(data.summary.currentBalance || 0) > 0 ? 'text-red-700' : 'text-green-700')}
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Amount</th>{data.access.printReceipts && <th className="px-3 py-2 text-right">Reprint</th>}</tr>
                  </thead>
                  <tbody>
                    {commercialActivity.map((row) => (
                      <tr key={row.id} className="border-t align-top hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2">{row.date ? formatDisplayDate(row.date) : '-'}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{row.type}</Badge></td>
                        <td className="px-3 py-2 font-mono text-xs">{displayReference(row.reference, row.id, row.type || 'Transaction')}</td>
                        <td className="px-3 py-2">{row.description || '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(row.amount || row.debit || row.credit || 0))}</td>
                        {data.access.printReceipts && <td className="px-3 py-2 text-right">{row.receiptStatus ? <Badge variant={row.receiptStatus === 'cancelled' ? 'destructive' : 'outline'}>{row.receiptStatus === 'cancelled' ? 'Cancelled' : 'Adjusted'}</Badge> : ['receivable_sale', 'property_sale', 'pos_sale', 'customer_invoice', 'customer_payment', 'property_sale_payment'].includes(row.source) && <TransactionReceiptButton
                          label={['customer_payment', 'property_sale_payment'].includes(row.source) || row.source === 'pos_sale' ? 'Reprint receipt' : 'Reprint invoice'}
                          data={['customer_payment', 'property_sale_payment'].includes(row.source)
                            ? customerActivityReceipt(row, data.customer.name)
                            : {
                              title: row.source === 'property_sale' ? 'Plot Sale Agreement / Invoice' : row.source === 'pos_sale' ? 'Sales Receipt' : 'Sales Invoice',
                        reference: displayReference(row.reference, row.id, row.type || 'Transaction'),
                              date: row.date || new Date(),
                              amount: Number(row.amount || row.debit || row.credit || 0),
                              partyLabel: 'Customer',
                              partyName: data.customer.name,
                              items: row.items?.map((item) => ({
                                name: item.productName || 'Item', quantity: Number(item.quantity || 0), unitName: item.unitName || '',
                                unitPrice: Number(item.unitPrice || 0), discount: Number(item.discount || 0), total: Number(item.total || 0),
                              })),
                              fields: [
                                { label: 'Payment status', value: row.status },
                                ...(row.source === 'receivable_sale' || row.source === 'property_sale' || row.source === 'customer_invoice' ? [{ label: 'Paid to date', value: formatCurrency(Number(row.amountPaid || 0)) }, { label: 'Balance due', value: formatCurrency(Number(row.remainingBalance || 0)) }] : []),
                                { label: 'Payment method', value: row.paymentMethod }, { label: 'Served by', value: row.staff },
                              ],
                            }}
                        />}</td>}
                      </tr>
                    ))}
                    {!commercialActivity.length && (
                      <tr><td colSpan={data.access.printReceipts ? 6 : 5} className="px-3 py-8 text-center text-muted-foreground">
                        {canViewSalesAndPayments ? 'No commercial account activity is available.' : 'Commercial account activity is not assigned to your role.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>}
            </TabsContent>}

            {(canViewCreditHistory || (hasRentalTenancies && canViewRent)) && <TabsContent value="credit-history" className="space-y-5">
              {hasRentalTenancies ? <>
                <section aria-label="Tenant rent position" className="space-y-4">
                  <div><h3 className="font-semibold">Rental account standing</h3><p className="mt-1 text-sm text-muted-foreground">Rent charges and receipts across this tenant’s linked agreements.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {metric('Rent charged', totalRentCharged)}
                    {metric('Rent collected', totalRentCollected, 'text-green-700')}
                    {metric('Current rent outstanding', rentalData?.closingBalance, 'text-amber-700')}
                    {countMetric('Overdue rent charges', rentalCharges.filter(row => row.status === 'overdue').length)}
                  </div>
                  <RentArrearsAging aging={rentalData?.arrearsAging} />
                  <div className="overflow-x-auto rounded-md border"><table className="min-w-[760px] w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Property / unit</th><th className="px-3 py-2">Agreement</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Monthly rent</th><th className="px-3 py-2 text-right">Outstanding</th></tr></thead><tbody>{rentalData?.tenancies.map(row => <tr key={row.id} className="border-t"><td className="px-3 py-2">{row.unit.property.name} · {row.unit.unitCode}</td><td className="px-3 py-2">{row.agreementRef || '—'}</td><td className="px-3 py-2"><Badge variant={row.status === 'active' ? 'default' : 'outline'}>{row.status}</Badge></td><td className="px-3 py-2 text-right">{formatCurrency(Number(row.rentAmount), row.currency)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(row.balance), row.currency)}</td></tr>)}</tbody></table></div>
                </section>
              </> : <>
              <section aria-label="Customer credit position" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
                <div className="grid content-start gap-3 sm:grid-cols-2">
                  {metric(canViewRent ? 'Trade receivables exposure' : 'Receivable exposure', data.creditHistory!.receivableExposure, 'text-red-700')}
                  {metric(canViewRent ? 'Funds on trade account' : 'Customer funds on account', data.creditHistory!.customerFunds, 'text-emerald-700')}
                  {data.access.creditLimit && metric(canViewRent ? 'Trade credit limit' : 'Credit limit', data.creditHistory!.creditLimit)}
                  {data.access.creditLimit && metric(canViewRent ? 'Trade limit remaining' : 'Limit remaining', data.creditHistory!.availableLimit, 'text-emerald-700')}
                  <div className="rounded-md border bg-muted/20 p-4 sm:col-span-2">
                    <h3 className="text-sm font-semibold">Credit position at a glance</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.access.creditLimit && <Badge variant={data.creditHistory!.utilizationPercent != null && data.creditHistory!.utilizationPercent > 100 ? 'destructive' : 'outline'}>
                        {data.creditHistory!.utilizationPercent == null ? 'No limit set' : data.creditHistory!.utilizationPercent > 100 ? 'Over limit' : data.creditHistory!.utilizationPercent >= 80 ? 'Near limit' : 'Within limit'}
                      </Badge>}
                      {data.access.sales && (() => {
                        const overdue = data.creditHistory!.aging.days1To30 + data.creditHistory!.aging.days31To60 + data.creditHistory!.aging.days61To90 + data.creditHistory!.aging.over90Days
                        return <Badge variant={overdue > 0 ? 'destructive' : 'outline'}>{overdue > 0 ? `${formatCurrency(overdue)} overdue` : 'No recorded overdue balance'}</Badge>
                      })()}
                      <Badge variant="secondary">Repayment trust {Number(data.customer.trustScore || 0)}/100</Badge>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{data.access.creditLimit ? 'Limit use measures exposure, ageing shows what is past due, and trust summarizes repayment behavior. Read these signals together; high utilization alone does not mean late payment.' : 'Ageing shows what is past due, and trust summarizes repayment behavior.'}</p>
                  </div>
                </div>
                {data.access.creditLimit && <CreditUtilizationGauge percent={data.creditHistory!.utilizationPercent ?? null} availableLimit={data.creditHistory!.availableLimit ?? 0} trustScore={Number(data.customer.trustScore || 0)} />}
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">{canViewRent ? 'Trade receivables ageing' : 'Receivables ageing'}</h3>
                    <p className="text-xs text-muted-foreground">Outstanding credit sales grouped by recorded due date, as of {formatDisplayDate(data.creditHistory!.asOf)}.</p>
                  </div>
                </div>
                {data.access.sales ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['Not due', data.creditHistory!.aging.notDue],
                    ['1–30 days overdue', data.creditHistory!.aging.days1To30],
                    ['31–60 days overdue', data.creditHistory!.aging.days31To60],
                    ['61–90 days overdue', data.creditHistory!.aging.days61To90],
                    ['Over 90 days', data.creditHistory!.aging.over90Days],
                    ['No due date recorded', data.creditHistory!.aging.noDueDate],
                  ].map(([label, amount]) => <div key={String(label)} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 break-words text-sm font-semibold">{formatCurrency(Number(amount))}</p>
                  </div>)}
                </div> : <p className="rounded-md border p-4 text-sm text-muted-foreground">Credit sale details are restricted by your role.</p>}
              </section>

              {data.access.sales && <section>
                <div className="mb-3 flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Open credit sales ({data.creditHistory!.openSales.length})</h3>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="px-3 py-2">Sale</th><th className="px-3 py-2">Sale date</th><th className="px-3 py-2">Due date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Original amount</th><th className="px-3 py-2 text-right">Outstanding</th></tr>
                    </thead>
                    <tbody>
                      {data.creditHistory!.openSales.map((sale) => <tr key={sale.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{sale.reference}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatDisplayDate(sale.date)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{sale.dueDate ? formatDisplayDate(sale.dueDate) : 'Not recorded'}</td>
                        <td className="px-3 py-2"><Badge variant={sale.daysPastDue && sale.daysPastDue > 0 ? 'destructive' : 'outline'}>{sale.daysPastDue == null ? 'No due date' : sale.daysPastDue > 0 ? `${sale.daysPastDue} days overdue` : 'Not due'}</Badge></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(sale.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-red-700">{formatCurrency(sale.balance)}</td>
                      </tr>)}
                      {!data.creditHistory!.openSales.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No open credit sales.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>}

              <section>
                <h3 className="mb-3 text-sm font-semibold">Credit account activity</h3>
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr>
                    </thead>
                    <tbody>
                      {creditActivity.map((row) => <tr key={row.id} className="border-t align-top">
                        <td className="whitespace-nowrap px-3 py-2">{row.date ? formatDisplayDate(row.date) : '—'}</td>
                        <td className="px-3 py-2"><div className="font-medium">{row.type}</div><div className="text-xs text-muted-foreground">{row.description || ''}</div></td>
                        <td className="px-3 py-2 font-mono text-xs">{row.reference || '—'}</td>
                        <td className="px-3 py-2 capitalize">{normalizeText(row.paymentMethod) || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{Number(row.debit || 0) ? formatCurrency(Number(row.debit)) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{Number(row.credit || 0) ? formatCurrency(Number(row.credit)) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{data.access.balance ? formatCurrency(Number(row.balance || 0)) : '******'}</td>
                      </tr>)}
                      {!creditActivity.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No credit activity is available for this customer.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              </>}
            </TabsContent>}
          </Tabs>
        )}

        {presentation === 'dialog' && <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>}
    </div>
  )

  if (presentation === 'page') {
    return <main className="mx-auto w-full max-w-[1800px] p-3 sm:p-5 lg:p-6">{content}</main>
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] overflow-y-auto p-3 sm:w-[96vw] sm:max-w-[96vw] sm:p-5 lg:w-[95vw] lg:max-w-[95vw] xl:w-[94vw] xl:max-w-[94vw] 2xl:w-[92vw] 2xl:max-w-[1800px]">
        {content}
      </DialogContent>
    </Dialog>
  )
}
