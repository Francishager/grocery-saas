import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileCheck2, Printer, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { appNotify, appConfirm } from '@/lib/appFeedback'

type CloseSnapshot = {
  business: { name: string; currency: string }
  period: { startDate: string; endDate: string }
  generatedAt: string
  snapshotHash: string
  checks: { id: string; label: string; passed: boolean; severity: string; detail: string }[]
  summary: Record<string, number>
  incomeStatement: { totalRevenue: number; totalExpenses: number; netResult: number; revenue: { code: string; name: string; amount: number }[]; expenses: { code: string; name: string; amount: number }[] }
  balanceSheet: { totalAssets: number; totalLiabilities: number; totalEquity: number; difference: number; assets: { code: string; name: string; amount: number }[]; liabilities: { code: string; name: string; amount: number }[]; equity: { code: string; name: string; amount: number }[] }
  trialBalance: { code: string; name: string; type: string; debit: number; credit: number; movementDebit: number; movementCredit: number; openingBalance: number; unjournaledBalance: number }[]
  unbalancedEntries: { entryNo: string; debit: number; credit: number; difference: number }[]
  limitations: string[]
}
type CloseRecord = { id: string; status: string; startDate: string; endDate: string; snapshot: CloseSnapshot; createdByName?: string; signedOffById?: string | null; signedOffByName?: string | null; signedOffAt?: string | null; closedAt?: string | null; reopenedByName?: string | null; reopenedAt?: string | null; reopenReason?: string | null; lifecycleEvents?: { action: string; userId: string; actorName?: string; at: string; reason?: string }[] }

const today = new Date().toISOString().slice(0, 10)
const money = (value: number, currency: string) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: currency || 'UGX', maximumFractionDigits: 2 }).format(Number(value || 0))
const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-GB')

export default function FinancialYearClosePage() {
  const { hasPermission } = useJWTAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [snapshot, setSnapshot] = useState<CloseSnapshot | null>(null)
  const [closes, setCloses] = useState<CloseRecord[]>([])
  const [selectedCloseId, setSelectedCloseId] = useState('')
  const [reopenTarget, setReopenTarget] = useState<CloseRecord | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const canPrepare = hasPermission('canManageFinancialYearClose')
  const canSign = hasPermission('canSignOffFinancialYearClose')
  const canReopen = hasPermission('canReopenFinancialYearClose')

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ closes: CloseRecord[] }>('/api/accounting/financial-year-closes', { cache: 'no-store' })
      setCloses(response.closes || [])
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not load financial-year close history.') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function preview() {
    if (!startDate || !endDate) { appNotify('Choose the financial-year start and end dates first.'); return }
    setBusy(true)
    try {
      const result = await api.post<CloseSnapshot>('/api/accounting/financial-year-closes/preview', { body: { startDate, endDate } })
      setSnapshot(result); setSelectedCloseId(''); setConfirmed(false)
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not prepare the close pack.') }
    finally { setBusy(false) }
  }

  async function saveDraft() {
    if (!snapshot) return
    setBusy(true)
    try {
      const saved = await api.post<CloseRecord>('/api/accounting/financial-year-closes', { body: { startDate: snapshot.period.startDate, endDate: snapshot.period.endDate } })
      setCloses(rows => [saved, ...rows.filter(row => row.id !== saved.id)])
      setSelectedCloseId(saved.id); appNotify('Financial-year review pack saved as a draft.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not save close draft.') }
    finally { setBusy(false) }
  }

  async function signOff() {
    const close = closes.find(row => row.id === selectedCloseId)
    if (!close || !confirmed) return
    if (!await appConfirm('Sign off this financial year? The ledger will reject new or changed postings dated within this period until an authorized user reopens it.')) return
    setBusy(true)
    try {
      const updated = await api.post<CloseRecord>(`/api/accounting/financial-year-closes/${close.id}/sign-off`, { body: { confirmed: true } })
      setCloses(rows => rows.map(row => row.id === updated.id ? updated : row)); setSnapshot(updated.snapshot); setConfirmed(false)
      appNotify('Financial year signed off and locked.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not sign off this year.') }
    finally { setBusy(false) }
  }

  async function reopen() {
    if (!reopenTarget || reopenReason.trim().length < 10) return
    setBusy(true)
    try {
      const updated = await api.post<CloseRecord>(`/api/accounting/financial-year-closes/${reopenTarget.id}/reopen`, { body: { reason: reopenReason.trim() } })
      setCloses(rows => rows.map(row => row.id === updated.id ? updated : row)); setSelectedCloseId(updated.id); setSnapshot(updated.snapshot)
      setReopenTarget(null); setReopenReason('')
      appNotify('Financial year reopened. Backdated postings are enabled until it is closed again.')
    } catch (error) { appNotify(error instanceof Error ? error.message : 'Could not reopen this year.') }
    finally { setBusy(false) }
  }

  function exportPack() {
    if (!snapshot) return
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `financial-year-close-${snapshot.period.startDate}-to-${snapshot.period.endDate}.json`; anchor.click()
    URL.revokeObjectURL(url)
  }

  const selectedClose = closes.find(row => row.id === selectedCloseId)
  const blockingIssues = snapshot?.checks.filter(check => check.severity === 'blocking' && !check.passed) || []
  const formatRows = (rows: { code: string; name: string; amount: number }[]) => rows.map(row => <tr key={`${row.code}-${row.name}`} className="border-t"><td className="py-2 pr-3">{row.code} · {row.name}</td><td className="py-2 text-right tabular-nums">{money(row.amount, snapshot?.business.currency || 'UGX')}</td></tr>)

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 print:max-w-none print:p-0">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4 print:hidden"><div><p className="text-sm font-medium text-muted-foreground">Accounting</p><h1 className="text-2xl font-semibold">Financial-year close</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review a ledger-based close pack, resolve exceptions, sign off, and lock a completed period. This does not submit a statutory or tax return.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Refresh history</button></header>

    <section className="grid gap-4 border-b pb-5 md:grid-cols-[1fr_1fr_auto] md:items-end print:hidden"><label className="text-sm">Financial year start<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} max={today} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><label className="text-sm">Financial year end<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} max={today} className="mt-1 h-10 w-full rounded-md border bg-background px-3"/></label><button disabled={busy || !startDate || !endDate} onClick={() => void preview()} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Checking…' : 'Prepare close review'}</button></section>

    {snapshot && <section className="space-y-5" aria-label="Financial year close pack">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div><h2 className="text-xl font-semibold">{snapshot.business.name}</h2><p className="text-sm text-muted-foreground">Financial year {dateLabel(snapshot.period.startDate)} to {dateLabel(snapshot.period.endDate)} · Generated {new Date(snapshot.generatedAt).toLocaleString()}</p></div><div className="flex gap-2 print:hidden"><button onClick={exportPack} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="h-4 w-4"/>Download pack</button><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Printer className="h-4 w-4"/>Print</button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Net result', snapshot.summary.netResult], ['Assets', snapshot.summary.totalAssets], ['Liabilities', snapshot.summary.totalLiabilities], ['Equity', snapshot.summary.totalEquity]].map(([label, value]) => <div key={String(label)} className="border p-3"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(Number(value), snapshot.business.currency)}</p></div>)}</div>
      <div><h3 className="mb-2 font-semibold">Close checks</h3><div className="divide-y border">{snapshot.checks.map(check => <div key={check.id} className="flex gap-3 p-3 text-sm"><span className="mt-0.5">{check.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <AlertTriangle className="h-4 w-4 text-amber-600"/>}</span><div><p className="font-medium">{check.label}</p><p className="text-muted-foreground">{check.detail}</p></div></div>)}</div></div>
      {blockingIssues.length > 0 && <p role="alert" className="border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900">Sign-off is blocked until all listed issues are resolved. Do not force a close to hide unresolved book differences.</p>}
      <div className="grid gap-6 xl:grid-cols-2"><section><h3 className="mb-2 font-semibold">Income statement</h3><table className="w-full text-sm"><tbody>{formatRows(snapshot.incomeStatement.revenue)}<tr className="border-t font-medium"><td className="py-2">Total income</td><td className="py-2 text-right">{money(snapshot.incomeStatement.totalRevenue, snapshot.business.currency)}</td></tr>{formatRows(snapshot.incomeStatement.expenses)}<tr className="border-t font-semibold"><td className="py-2">Net result</td><td className="py-2 text-right">{money(snapshot.incomeStatement.netResult, snapshot.business.currency)}</td></tr></tbody></table></section><section><h3 className="mb-2 font-semibold">Statement of financial position</h3><table className="w-full text-sm"><tbody>{formatRows(snapshot.balanceSheet.assets)}<tr className="border-t font-medium"><td className="py-2">Total assets</td><td className="py-2 text-right">{money(snapshot.balanceSheet.totalAssets, snapshot.business.currency)}</td></tr>{formatRows(snapshot.balanceSheet.liabilities)}{formatRows(snapshot.balanceSheet.equity)}<tr className="border-t font-semibold"><td className="py-2">Liabilities and equity</td><td className="py-2 text-right">{money(snapshot.balanceSheet.totalLiabilities + snapshot.balanceSheet.totalEquity, snapshot.business.currency)}</td></tr></tbody></table></section></div>
      <section><h3 className="mb-2 font-semibold">Trial balance and movement</h3><div className="overflow-x-auto border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/40 text-xs"><tr><th className="p-2">Account</th><th className="p-2 text-right">Opening</th><th className="p-2 text-right">Period debit</th><th className="p-2 text-right">Period credit</th><th className="p-2 text-right">Closing debit</th><th className="p-2 text-right">Closing credit</th></tr></thead><tbody>{snapshot.trialBalance.map(account => <tr key={account.code} className="border-t"><td className="p-2">{account.code} · {account.name}</td><td className="p-2 text-right tabular-nums">{money(account.openingBalance, snapshot.business.currency)}</td><td className="p-2 text-right tabular-nums">{money(account.movementDebit, snapshot.business.currency)}</td><td className="p-2 text-right tabular-nums">{money(account.movementCredit, snapshot.business.currency)}</td><td className="p-2 text-right tabular-nums">{money(account.debit, snapshot.business.currency)}</td><td className="p-2 text-right tabular-nums">{money(account.credit, snapshot.business.currency)}</td></tr>)}</tbody></table></div></section>
      {snapshot.limitations.map(note => <p key={note} className="text-xs text-muted-foreground">{note}</p>)}
      <div className="border-t pt-4 print:hidden">{selectedClose?.status === 'closed' ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4"/>Closed and posting-locked · Signed off by {selectedClose.signedOffByName || 'business user'} {selectedClose.signedOffAt ? `on ${new Date(selectedClose.signedOffAt).toLocaleString()}` : ''}</p>{canReopen && <button disabled={busy} onClick={() => setReopenTarget(selectedClose)} className="inline-flex items-center gap-2 rounded-md border border-amber-600 px-3 py-2 text-sm text-amber-800"><RotateCcw className="h-4 w-4"/>Reopen with reason</button>}</div> : <div className="flex flex-wrap items-center justify-between gap-3">{canPrepare && <button disabled={busy} onClick={() => void saveDraft()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><FileCheck2 className="h-4 w-4"/>Save review draft</button>}{canSign && selectedClose && <div className="flex flex-wrap items-center gap-3"><label className="flex max-w-xl items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5"/><span>I reviewed the attached statements and source checks and authorize the period to be locked. I understand that correcting this period later requires an authorized reopen and a documented reason.</span></label><button disabled={busy || !confirmed || blockingIssues.length > 0} onClick={() => void signOff()} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4"/>Sign off & close</button></div>}</div>}</div>
    </section>}

    <section className="border-t pt-4 print:hidden"><h2 className="mb-3 font-semibold">Close history</h2>{closes.length ? <div className="divide-y border">{closes.map(close => <div key={close.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-medium">{dateLabel(close.startDate)} – {dateLabel(close.endDate)}</p><p className="text-xs text-muted-foreground">{close.status.replace('_', ' ')} · Net result {money(close.snapshot.summary.netResult, close.snapshot.business.currency)} · Prepared by {close.createdByName || 'business user'}{close.signedOffByName ? ` · Signed off by ${close.signedOffByName}` : ''}</p>{close.reopenReason && <p className="mt-1 text-xs text-amber-800">Reopened by {close.reopenedByName || 'business user'}: {close.reopenReason}</p>}</div><button onClick={() => { setSelectedCloseId(close.id); setSnapshot(close.snapshot); setStartDate(close.snapshot.period.startDate); setEndDate(close.snapshot.period.endDate); setConfirmed(false) }} className="rounded-md border px-3 py-2 text-sm">Open close pack</button></div>)}</div> : <p className="text-sm text-muted-foreground">No financial years have been prepared yet.</p>}</section>
    {reopenTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"><section role="dialog" aria-modal="true" aria-labelledby="reopen-year-title" className="w-full max-w-lg rounded-lg border bg-background p-5 shadow-xl"><h2 id="reopen-year-title" className="text-lg font-semibold">Reopen financial year</h2><p className="mt-1 text-sm text-muted-foreground">Reopening unlocks ledger postings dated {dateLabel(reopenTarget.startDate)} through {dateLabel(reopenTarget.endDate)}. A reason is stored in the close history.</p><label className="mt-4 block text-sm">Reason<textarea value={reopenReason} onChange={event => setReopenReason(event.target.value)} minLength={10} maxLength={1000} rows={4} className="mt-1 w-full rounded-md border bg-background p-3" placeholder="Explain the correction that requires reopening"/></label><div className="mt-4 flex justify-end gap-2"><button disabled={busy} onClick={() => { setReopenTarget(null); setReopenReason('') }} className="rounded-md border px-3 py-2 text-sm">Cancel</button><button disabled={busy || reopenReason.trim().length < 10} onClick={() => void reopen()} className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Reopening…' : 'Confirm reopen'}</button></div></section></div>}
    <style>{'@media print { body { background: white !important; } button, input { display: none !important; } }'}</style>
  </main>
}
