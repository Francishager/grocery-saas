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
}

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
  const [issues, setIssues] = useState<ReconciliationIssue[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeIssue, setActiveIssue] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision>('requires_adjustment')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

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
      setDecision('requires_adjustment')
      setNote('')
      await loadIssues(page)
    } catch (error) {
      toast({ variant: 'destructive', title: 'Review was not saved', description: error instanceof Error ? error.message : 'Try again.' })
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
        <div><div className="text-xs uppercase text-muted-foreground">Open differences</div><div className="mt-1 text-xl font-semibold">{total}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">This page absolute difference</div><div className="mt-1 text-xl font-semibold">{formatCurrency(absoluteDifference)}</div></div>
        <p className="flex min-w-[260px] flex-1 items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Reviews record a decision only; they never post adjustments or change customer balances.
        </p>
      </div>

      <div className="overflow-x-auto border-y">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Invoice / Customer</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3 text-right">Invoice total</th>
              <th className="px-3 py-3 text-right">Sale paid</th>
              <th className="px-3 py-3 text-right">Linked receipts</th>
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
                  {issue.review ? <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /><div><div>{decisionLabels[issue.review.decision]}</div><div className="max-w-[260px] text-xs text-muted-foreground">{issue.review.note}</div></div></div> : <span className="text-amber-700 dark:text-amber-300">Needs review</span>}
                </td>
                <td className="px-3 py-3 text-right">
                  {canReview && <Button size="sm" variant="outline" onClick={() => { setActiveIssue(activeIssue === issue.saleId ? null : issue.saleId); setNote('') }}>{issue.review ? 'Review again' : 'Review'}</Button>}
                </td>
              </tr>
              {activeIssue === issue.saleId && canReview && (
                <tr><td colSpan={8} className="border-t bg-muted/20 px-4 py-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(220px,0.7fr)_minmax(280px,1.3fr)_auto] md:items-end">
                      <label className="grid gap-1.5 text-sm">Decision
                        <select value={decision} onChange={(event) => setDecision(event.target.value as Decision)} className="h-10 rounded-md border bg-background px-3">
                          {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm">Evidence / reviewer note
                        <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="State what source evidence was checked and what follow-up is required." />
                      </label>
                      <div className="flex gap-2"><Button onClick={() => void submitReview(issue)} disabled={saving}>{saving ? 'Saving...' : 'Record review'}</Button><Button variant="ghost" onClick={() => setActiveIssue(null)}>Cancel</Button></div>
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
