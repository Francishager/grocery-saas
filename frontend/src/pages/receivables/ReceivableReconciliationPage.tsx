import { Fragment, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { apiFetch } from '@/lib/api'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'

type Decision = 'sale_amount_confirmed' | 'receipt_rows_confirmed' | 'requires_adjustment' | 'investigate_duplicate'

interface ReconciliationIssue {
  saleId: string
  branchId?: string | null
  customerName: string
  receiptNo: string
  createdAt: string
  total: number
  balance: number
  recordedSaleAmountPaid: number
  linkedPaymentTotal: number
  difference: number
  provisionalPaidAmount: number
  sourceFingerprint: string
  review: null | {
    decision: Decision
    note: string
    reviewedAt: string
    reviewer?: { fname?: string; lname?: string }
  }
  resolved?: boolean
  receipts?: Array<{ id: string; amount: number; paymentMethod: string; reference?: string | null; transactionId?: string | null; notes?: string | null; createdAt: string }>
}

type AccountingConfig = { isEnabled?: boolean }
type PayablesConfig = { isEnabled?: boolean }
type SetupStatus = { automatic: boolean; historicalActivityCount: number; historicalReviewRequired: boolean; receivablesEnabled: boolean; payablesEnabled: boolean }
type CutoverException = { key: string; type: string; label: string; storedBalance: number; ledgerBalance: number; difference: number; reviewStatus: string }
type CutoverPreview = { sourceFingerprint: string; snapshots: Array<{ accountId: string; code: string; accountName: string; targetBalance: number; postedJournalBalance: number; difference: number }>; exceptions: CutoverException[]; customerBalanceTotal: number; supplierBalanceTotal: number; openingEquityOffset: number }

const decisionLabels: Record<Decision, string> = {
  sale_amount_confirmed: 'Sale paid amount verified',
  receipt_rows_confirmed: 'Receipt rows verified',
  requires_adjustment: 'Adjustment required',
  investigate_duplicate: 'Investigate possible duplicate',
}

export default function ReceivableReconciliationPage() {
  const { hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const canReview = hasPermission('canReviewReceivableReconciliation')
  const canApply = hasPermission('canApplyReceivableReconciliation')
  const canEditAccounting = hasPermission('canEditAccounting')
  const canViewAccounting = hasPermission('canViewAccounting')
  const canViewPayables = hasPermission('canViewPayable') || hasPermission('canViewAccounting') || canEditAccounting
  const [issues, setIssues] = useState<ReconciliationIssue[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeIssue, setActiveIssue] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision>('requires_adjustment')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmReceipts, setConfirmReceipts] = useState(false)
  const [accountingConfig, setAccountingConfig] = useState<AccountingConfig>({ isEnabled: false })
  const [accountingLoading, setAccountingLoading] = useState(false)
  const [payablesConfig, setPayablesConfig] = useState<PayablesConfig>({ isEnabled: false })
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [cutoverPreview, setCutoverPreview] = useState<CutoverPreview | null>(null)
  const [cutoverExceptions, setCutoverExceptions] = useState<CutoverException[]>([])
  const [cutoverAt, setCutoverAt] = useState<string | null>(null)
  const [cutoverFilter, setCutoverFilter] = useState('all')
  const [cutoverConfirmed, setCutoverConfirmed] = useState(false)
  const [cutoverLoading, setCutoverLoading] = useState(false)

  const loadIssues = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const response = await apiFetch(`/api/receivables/reconciliation/payment-allocations?page=${targetPage}&limit=25`)
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not load reconciliation issues')
      setIssues(data.rows || [])
      setTotal(Number(data.pagination?.total || 0))
      setPages(Math.max(1, Number(data.pagination?.pages || 1)))
      setPage(Number(data.pagination?.page || targetPage))
    } catch (error) {
      toast({ variant: 'destructive', title: 'Reconciliation could not load', description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setLoading(false)
    }
  }, [page, toast])

  useEffect(() => { void loadIssues(1) }, [])

  const loadAccountingConfig = useCallback(async () => {
    setAccountingLoading(true)
    try {
      if (canEditAccounting) {
        const setupResponse = await apiFetch('/api/accounting/system-setup', { method: 'POST', body: JSON.stringify({}) })
        const setupData = await setupResponse.json()
        if (!setupResponse.ok) throw new Error(setupData?.error || 'Could not initialize automatic accounting')
        setSetupStatus(setupData)
        setPayablesConfig(setupData.payablesConfig || { isEnabled: false })
      }
      if (canEditAccounting || canViewAccounting) {
        const cutoverResponse = await apiFetch('/api/accounting/cutover/status')
        const cutoverData = await cutoverResponse.json()
        if (!cutoverResponse.ok) throw new Error(cutoverData?.error || 'Could not load cutover status')
        const cutover = cutoverData.cutover
        if (cutover) {
          setCutoverExceptions(cutover.exceptions || [])
          setCutoverAt(cutover.cutoverAt || null)
          setSetupStatus((current) => current ? { ...current, receivablesEnabled: true, payablesEnabled: true, historicalReviewRequired: false } : current)
        }
      }
      const response = await apiFetch('/api/receivables/reconciliation/accounting-config')
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not load accounting mappings')
      setAccountingConfig(data.config || { isEnabled: false })
      if (!canEditAccounting && canViewPayables) {
        const payablesResponse = await apiFetch('/api/payables/accounting-config')
        const payablesData = await payablesResponse.json()
        if (!payablesResponse.ok) throw new Error(payablesData?.error || 'Could not load supplier accounting status')
        setPayablesConfig(payablesData.config || { isEnabled: false })
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Accounting mappings could not load', description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setAccountingLoading(false)
    }
  }, [canEditAccounting, canViewAccounting, canViewPayables, toast])

  useEffect(() => { void loadAccountingConfig() }, [loadAccountingConfig])

  const previewCutover = async () => {
    setCutoverLoading(true)
    try {
      const response = await apiFetch('/api/accounting/cutover/preview')
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not prepare cutover preview')
      if (data.alreadyApplied) {
        setCutoverPreview(null)
        setCutoverExceptions(data.cutover?.exceptions || [])
        setCutoverAt(data.cutover?.cutoverAt || null)
        setSetupStatus((current) => current ? { ...current, receivablesEnabled: true, payablesEnabled: true, historicalReviewRequired: false } : current)
      } else {
        setCutoverPreview(data.preview)
        setCutoverExceptions(data.preview?.exceptions || [])
        setCutoverConfirmed(false)
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Cutover preview failed', description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setCutoverLoading(false)
    }
  }

  const applyCutover = async () => {
    if (!cutoverPreview || !cutoverConfirmed) return
    setCutoverLoading(true)
    try {
      const response = await apiFetch('/api/accounting/cutover', {
        method: 'POST',
        body: JSON.stringify({ sourceFingerprint: cutoverPreview.sourceFingerprint }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not start accounting cutover')
      setCutoverExceptions(data.cutover?.exceptions || [])
      setCutoverAt(data.cutover?.cutoverAt || null)
      setCutoverPreview(null)
      setCutoverConfirmed(false)
      toast({ title: 'Accounting is active', description: `${data.cutover?.exceptionCount || 0} legacy balance differences are saved for review. Historical sales were not replayed.` })
      await loadAccountingConfig()
    } catch (error) {
      toast({ variant: 'destructive', title: 'Cutover was not applied', description: error instanceof Error ? error.message : 'Refresh the preview and retry.' })
    } finally {
      setCutoverLoading(false)
    }
  }

  const submitReview = async (issue: ReconciliationIssue) => {
    if (!note.trim()) {
      toast({ variant: 'destructive', title: 'Add a review note' })
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch(`/api/receivables/reconciliation/payment-allocations/${encodeURIComponent(issue.saleId)}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ branchId: issue.branchId || undefined, decision, note: note.trim(), sourceFingerprint: issue.sourceFingerprint }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not save review')
      toast({ title: 'Review recorded', description: 'No sale, receipt, or balance was changed.' })
      setActiveIssue(null)
      setConfirmReceipts(false)
      setDecision('requires_adjustment')
      setNote('')
      await loadIssues(page)
    } catch (error) {
      toast({ variant: 'destructive', title: 'Review was not saved', description: error instanceof Error ? error.message : 'Try again.' })
    } finally {
      setSaving(false)
    }
  }

  const reconcileToReceipts = async (issue: ReconciliationIssue) => {
    if (!confirmReceipts || !note.trim()) {
      toast({ variant: 'destructive', title: 'Confirm the source evidence', description: 'Verify every receipt against actual collection records and add a note.' })
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch(`/api/receivables/reconciliation/payment-allocations/${encodeURIComponent(issue.saleId)}/reconcile-to-receipts`, {
        method: 'POST',
        body: JSON.stringify({
          branchId: issue.branchId || undefined,
          sourceFingerprint: issue.sourceFingerprint,
          confirmReceipts,
          note: note.trim(),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not reconcile this sale')
      toast({ title: 'Receipt allocations reconciled', description: 'The verified receipts were allocated to the sale. Customer balance and cash/general-ledger balances did not change.' })
      setActiveIssue(null)
      setConfirmReceipts(false)
      setNote('')
      await loadIssues(page)
    } catch (error) {
      toast({ variant: 'destructive', title: 'Reconciliation was not applied', description: error instanceof Error ? error.message : 'Reload and verify the source records.' })
    } finally {
      setSaving(false)
    }
  }

  const absoluteDifference = issues.reduce((sum, issue) => sum + Math.abs(issue.difference), 0)

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payment Reconciliation</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review legacy invoices where the sale's paid total differs from its linked receipt records.</p>
        </div>
        <Button variant="outline" onClick={() => void loadIssues(page)} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y py-4">
        <div><div className="text-xs uppercase text-muted-foreground">Mismatch records</div><div className="mt-1 text-xl font-semibold">{total}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">This page absolute difference</div><div className="mt-1 text-xl font-semibold">{formatCurrency(absoluteDifference)}</div></div>
        <p className="flex min-w-[260px] flex-1 items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Only verified linked receipts can be allocated here. Missing receipts, duplicates, lower receipt totals, and cash/ledger differences remain unresolved for accountant review.
        </p>
      </div>

      <section className="space-y-4 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">Automatic accounting</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Existing businesses can start posting from a dated opening snapshot while legacy differences remain visible for review.</p></div>
          <span className={`text-sm font-medium ${accountingConfig.isEnabled && payablesConfig.isEnabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
            {accountingConfig.isEnabled && payablesConfig.isEnabled ? 'Active' : setupStatus?.historicalReviewRequired ? 'Historical review required' : 'Setup required'}
          </span>
        </div>
        {cutoverAt && <p className="text-sm text-muted-foreground">Posting cutover: {formatDisplayDate(cutoverAt)}. Earlier records remain in the legacy history and were not replayed.</p>}
        {setupStatus?.historicalReviewRequired && <div className="space-y-3 text-sm text-amber-900 dark:text-amber-200"><p role="status">Legacy activity was found. Historical transactions will not be replayed. Review the snapshot differences, then start posting from the cutover date; unresolved differences stay in the exception list.</p>{canEditAccounting && <Button variant="outline" onClick={() => void previewCutover()} disabled={cutoverLoading}>{cutoverLoading ? 'Preparing…' : 'Preview opening snapshot'}</Button>}</div>}
        <label className="flex items-center gap-2 border-t pt-3 text-sm font-medium text-muted-foreground">
          <input type="checkbox" checked={Boolean(accountingConfig.isEnabled)} disabled readOnly />
          {accountingConfig.isEnabled ? 'Receivables posting is active' : 'Receivables posting is awaiting cutover'}
        </label>
      </section>

      {canViewPayables && <section className="space-y-4 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">Supplier accounting</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Purchases, payments, and supplier balances are journaled automatically when setup is active.</p></div>
          <span className={`text-sm font-medium ${payablesConfig.isEnabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>{payablesConfig.isEnabled ? 'Active' : setupStatus?.historicalReviewRequired ? 'Historical review required' : 'Setup required'}</span>
        </div>
        <label className="flex items-center gap-2 border-t pt-3 text-sm font-medium text-muted-foreground">
          <input type="checkbox" checked={Boolean(payablesConfig.isEnabled)} disabled readOnly />
          {payablesConfig.isEnabled ? 'Supplier posting is active' : 'Supplier posting is awaiting cutover'}
        </label>
      </section>}

      {cutoverPreview && <section className="space-y-4 border-b pb-5" aria-label="Accounting cutover preview">
        <div><h2 className="text-base font-semibold">Opening snapshot preview</h2><p className="mt-1 text-sm text-muted-foreground">The system will not recreate old invoices or payments. It will post only the net opening balances needed to carry today's balances into the ledger, then enable future automatic posting.</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border p-3"><div className="text-xs text-muted-foreground">Customer balances</div><div className="mt-1 font-semibold">{formatCurrency(cutoverPreview.customerBalanceTotal)}</div></div>
          <div className="border p-3"><div className="text-xs text-muted-foreground">Supplier balances</div><div className="mt-1 font-semibold">{formatCurrency(cutoverPreview.supplierBalanceTotal)}</div></div>
          <div className="border p-3"><div className="text-xs text-muted-foreground">Opening equity offset</div><div className="mt-1 font-semibold">{formatCurrency(Math.abs(cutoverPreview.openingEquityOffset))} {cutoverPreview.openingEquityOffset >= 0 ? 'credit' : 'debit'}</div></div>
        </div>
        <p className="text-sm text-muted-foreground">{cutoverPreview.exceptions.length} review flags will be retained. Account differences are included in the opening snapshot; customer/supplier control differences remain flagged for investigation.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={cutoverConfirmed} onChange={(event) => setCutoverConfirmed(event.target.checked)} /><span>I reviewed this preview. Start accounting from now without replaying legacy transactions; keep listed differences visible for follow-up.</span></label>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void applyCutover()} disabled={!cutoverConfirmed || cutoverLoading}>{cutoverLoading ? 'Starting…' : 'Start accounting from now'}</Button><Button variant="outline" onClick={() => { setCutoverPreview(null); setCutoverConfirmed(false) }} disabled={cutoverLoading}>Cancel</Button></div>
      </section>}

      {cutoverExceptions.length > 0 && <section className="space-y-3 border-b pb-5" aria-label="Legacy accounting exceptions">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold">Legacy differences</h2><p className="mt-1 text-sm text-muted-foreground">These are preserved review items, not automatic corrections. New transactions can continue posting.</p></div><label className="text-sm">Filter <select className="ml-2 h-9 border bg-background px-2" value={cutoverFilter} onChange={(event) => setCutoverFilter(event.target.value)}><option value="all">All types</option><option value="account_balance">Account balances</option><option value="subledger_control">Customer/supplier control</option></select></label></div>
        <div className="overflow-x-auto border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Difference</th><th className="px-3 py-2 text-right">Stored balance</th><th className="px-3 py-2 text-right">Journal balance before cutover</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2">Status</th></tr></thead><tbody className="divide-y">{cutoverExceptions.filter((row) => cutoverFilter === 'all' || row.type === cutoverFilter).map((row) => <tr key={row.key}><td className="px-3 py-2">{row.label}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.storedBalance)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.ledgerBalance)}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.difference)}</td><td className="px-3 py-2">{row.reviewStatus === 'included_in_snapshot' ? 'Included in opening snapshot' : 'Open review'}</td></tr>)}</tbody></table></div>
      </section>}

      <div className="overflow-x-auto border-y">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Invoice / Customer</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3 text-right">Invoice total</th>
              <th className="px-3 py-3 text-right">Captured paid (legacy)</th>
              <th className="px-3 py-3 text-right">Legacy receipt rows</th>
              <th className="px-3 py-3 text-right">Difference</th>
              <th className="px-3 py-3">Review</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Loading reconciliation records...</td></tr>}
            {!loading && issues.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No payment mismatches found.</td></tr>}
            {!loading && issues.map((issue) => (
              <Fragment key={issue.saleId}>
              <tr className="align-top">
                <td className="px-3 py-3"><div className="font-medium">{issue.customerName || 'Customer'}</div><div className="text-xs text-muted-foreground">{issue.receiptNo}</div></td>
                <td className="whitespace-nowrap px-3 py-3">{formatDisplayDate(issue.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrency(issue.total)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrency(issue.recordedSaleAmountPaid)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCurrency(issue.linkedPaymentTotal)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatCurrency(issue.difference)}</td>
                <td className="px-3 py-3">
                  {issue.resolved ? <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /><div><div>Reconciled to verified receipts</div><div className="max-w-[260px] text-xs text-muted-foreground">{issue.review?.note}</div></div></div> : issue.review ? <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /><div><div>{decisionLabels[issue.review.decision]}</div><div className="max-w-[260px] text-xs text-muted-foreground">{issue.review.note}</div></div></div> : <span className="text-amber-700 dark:text-amber-300">Needs review</span>}
                </td>
                <td className="px-3 py-3 text-right">
                  {(canReview || canApply) && <Button size="sm" variant="outline" onClick={() => { setActiveIssue(activeIssue === issue.saleId ? null : issue.saleId); setNote(''); setConfirmReceipts(false) }}>{issue.resolved ? 'View audit' : 'Review / correct'}</Button>}
                </td>
              </tr>
              {activeIssue === issue.saleId && (canReview || canApply) && (
                <tr><td colSpan={8} className="border-t bg-muted/20 px-4 py-4">
                    <div className="space-y-4">
                      <section className="overflow-x-auto rounded-md border bg-background">
                        <div className="border-b px-3 py-2 text-sm font-medium">Linked legacy receipts</div>
                        <table className="w-full min-w-[720px] text-left text-xs">
                          <thead className="text-muted-foreground"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Transaction ID</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                          <tbody className="divide-y">{(issue.receipts || []).map((receipt) => <tr key={receipt.id}><td className="px-3 py-2 whitespace-nowrap">{formatDisplayDate(receipt.createdAt)}</td><td className="px-3 py-2"><div>{receipt.reference || '—'}</div><div className="break-all text-[10px] text-muted-foreground">{receipt.id}</div></td><td className="px-3 py-2">{receipt.paymentMethod}</td><td className="px-3 py-2">{receipt.transactionId || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{formatCurrency(receipt.amount)}</td></tr>)}{!issue.receipts?.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No legacy receipt details found.</td></tr>}</tbody>
                        </table>
                      </section>
                      {(canReview || canApply) && <label className="grid gap-1.5 text-sm">Evidence / reviewer note
                        <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="Identify the till close, bank statement, mobile-money reference, or other evidence checked." />
                      </label>}
                      <div><Button variant="ghost" onClick={() => setActiveIssue(null)}>Close</Button></div>
                      {canReview && <div className="flex flex-wrap items-end gap-3">
                      <label className="grid gap-1.5 text-sm">Decision
                        <select value={decision} onChange={(event) => setDecision(event.target.value as Decision)} className="h-10 rounded-md border bg-background px-3">
                          {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <Button onClick={() => void submitReview(issue)} disabled={saving}>{saving ? 'Saving...' : 'Record review'}</Button>
                      </div>}
                    {!issue.resolved && canApply && issue.difference > 0.01 && (issue.receipts?.length || 0) > 0 && <div className="space-y-3 border-t pt-3">
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmReceipts} onChange={(event) => setConfirmReceipts(event.target.checked)} className="mt-1" /><span>I matched every listed receipt to actual collection evidence and confirm these receipts are genuine, not duplicates.</span></label>
                      <Button onClick={() => void reconcileToReceipts(issue)} disabled={saving || !confirmReceipts || !note.trim()}>{saving ? 'Reconciling...' : 'Allocate verified receipts to this sale'}</Button>
                      <p className="text-xs text-muted-foreground">This converts legacy receipt rows into explicit allocations and aligns the invoice payment projection. The operation is rejected if it would change the customer balance. It does not change cash or general-ledger balances.</p>
                    </div>}
                    </div>
                </td></tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Page {page} of {pages} · {total} mismatches</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Previous page" onClick={() => void loadIssues(page - 1)} disabled={loading || page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" aria-label="Next page" onClick={() => void loadIssues(page + 1)} disabled={loading || page >= pages}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </footer>
    </main>
  )
}
