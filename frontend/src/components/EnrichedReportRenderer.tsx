import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

export interface EnrichedTransaction {
  id: string
  date: string
  type: string // 'Sale', 'Payment', 'Expense', 'Adjustment', etc.
  description: string
  details?: string
  amount: number
  debit?: number
  credit?: number
  reference: string
  balance?: number
  status?: string
  metadata?: Record<string, any>
}

export interface EnrichedReportData {
  title: string
  entityName?: string
  entityType?: string
  headerInfo?: {
    label: string
    value: string | number
  }[]
  currentBalance?: number
  summary?: Record<string, any>
  transactions: EnrichedTransaction[]
  generatedAt: string
  detailGroups?: Record<string, any[]>
}

interface EnrichedReportProps {
  data: EnrichedReportData
  summaryKeys?: Array<{ key: string; label: string; format?: 'currency' | 'number' | 'text' }>
}

const getTypeColor = (type: string): string => {
  const typeMap: Record<string, string> = {
    'Sale': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'Payment': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Payment Received': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'Expense': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'Credit Note': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Debit Note': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    'Return': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    'Refund': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    'Discount': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    'Adjustment': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    'Inventory': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    'Transfer': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  }
  return typeMap[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
}

const formatValue = (value: any, format?: string): string => {
  if (value === null || value === undefined) return '—'
  switch (format) {
    case 'currency':
      return formatCurrency(Number(value) || 0)
    case 'number':
      return new Intl.NumberFormat('en-US').format(Number(value) || 0)
    case 'text':
    default:
      return String(value)
  }
}

const formatDateDDMMYY = (date: string | Date): string => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

const enrichedDetailAliases: Record<string, string[]> = {
  totalExpense: ['totalExpense', 'expenses'],
  expenseCount: ['expenses', 'totalExpense'],
  totalInflow: ['inflow', 'cashInflows'],
  totalOutflow: ['outflow', 'cashOutflows'],
  closingBalance: ['closingBalance', 'transactions'],
  openingBalance: ['openingBalance'],
}

const detailRowsFor = (data: EnrichedReportData, key: string) => {
  const groups = data.detailGroups || {}
  const keys = enrichedDetailAliases[key] || [key]
  const rows = keys.flatMap((candidate) => Array.isArray(groups[candidate]) ? groups[candidate] : [])
  const seen = new Set<string>()
  return rows.filter((row) => {
    const id = String(row?.id || row?.reference || JSON.stringify(row))
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const looksMoney = (key: string) => /(amount|balance|debit|credit|total|revenue|profit|cost|cogs|tax|discount|paid|expense|inflow|outflow|value)$/i.test(key)

function EnrichedDetailModal({ title, rows, onClose }: { title: string; rows: any[]; onClose: () => void }) {
  const columns = ['date', 'type', 'account', 'description', 'reference', 'customer', 'supplier', 'staff', 'branch', 'paymentMethod', 'quantity', 'grossAmount', 'revenue', 'cogs', 'tax', 'discount', 'grossProfit', 'debit', 'credit', 'amount', 'balance']
    .filter((key) => rows.some((row) => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== ''))
  const visibleColumns = columns.length ? columns : ['description', 'amount']
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full overflow-hidden rounded-t-lg bg-background shadow-xl sm:max-w-6xl sm:rounded-lg">
        <div className="flex items-start justify-between gap-4 border-b px-4 py-3 sm:px-6">
          <div><h3 className="text-base font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{rows.length} source transaction{rows.length === 1 ? '' : 's'}</p></div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X className="h-4 w-4" /></Button>
        </div>
        <div className="max-h-[74vh] overflow-y-auto p-4 sm:p-6">
          <div className="hidden overflow-x-auto rounded-lg border lg:block">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-muted/50"><tr>{visibleColumns.map((column) => <th key={column} className={cn('px-4 py-3 font-medium text-muted-foreground', looksMoney(column) ? 'text-right' : 'text-left')}>{column.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</th>)}</tr></thead>
              <tbody>{rows.map((row, index) => <tr key={`${row?.id || row?.reference || index}-${index}`} className="border-t hover:bg-muted/30">{visibleColumns.map((column) => <td key={column} className={cn('px-4 py-2 align-top', looksMoney(column) ? 'text-right tabular-nums' : '')}>{column === 'date' ? formatDateDDMMYY(row?.[column]) : looksMoney(column) ? formatCurrency(Number(row?.[column] || 0)) : formatValue(row?.[column])}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="space-y-3 lg:hidden">{rows.map((row, index) => <div key={`${row?.id || row?.reference || index}-${index}`} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium break-words">{row?.description || row?.account || row?.type || 'Transaction'}</p><p className="text-xs text-muted-foreground">{formatDateDDMMYY(row?.date)} {row?.reference ? `- ${row.reference}` : ''}</p></div><p className="shrink-0 text-right font-semibold">{formatCurrency(Number(row?.amount ?? row?.debit ?? row?.credit ?? row?.balance ?? 0))}</p></div>{row?.details && <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{row.details}</p>}</div>)}</div>
        </div>
      </div>
    </div>
  )
}
export function EnrichedReport({ data, summaryKeys }: EnrichedReportProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<{ title: string; rows: any[] } | null>(null)
  
  if (!data || !data.transactions) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No data available.</p>
      </div>
    )
  }

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setExpandedRows(newSet)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {data.entityName && (
        <div className="rounded-lg border-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {data.entityType ? `${data.entityType} ` : ''}{data.title || 'Report'}
              </p>
              <p className="text-2xl font-bold mt-1">{data.entityName}</p>
              {data.headerInfo && (
                <div className="flex gap-6 mt-3 text-sm text-muted-foreground flex-wrap">
                  {data.headerInfo.map((info, idx) => (
                    <div key={idx}>
                      <p className="text-xs font-medium">{info.label}</p>
                      <p className="font-semibold text-foreground">{info.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Report Generated</p>
              <p className="text-sm font-semibold mt-1">{formatDateDDMMYY(data.generatedAt)}</p>
              {data.currentBalance !== undefined && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className={`text-2xl font-bold mt-1 ${(data.currentBalance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(data.currentBalance || 0)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {data.summary && summaryKeys && summaryKeys.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryKeys.map((k) => {
            const rows = detailRowsFor(data, k.key)
            const clickable = rows.length > 0
            return (
              <Card key={k.key} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} className={cn('border-l-4 border-l-blue-500', clickable && 'cursor-pointer transition hover:shadow-sm')} onClick={() => clickable && setDetail({ title: k.label, rows })} onKeyDown={(event) => { if (clickable && (event.key === 'Enter' || event.key === ' ')) setDetail({ title: k.label, rows }) }}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase">{k.label}</p>
                  <p className="mt-2 text-xl font-bold">{formatValue(data.summary[k.key], k.format)}</p>
                  {clickable && <p className="mt-2 text-xs font-medium text-primary">View source transactions</p>}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Transaction Table/Ledger */}
      {data.transactions.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Complete Transaction Ledger</h3>
            <p className="text-xs text-muted-foreground">{data.transactions.length} transactions</p>
          </div>

          {/* Desktop View */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="min-w-[1600px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-20">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground flex-1">Description</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28">Reference</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-24">Debit</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-24">Credit</th>
                  {data.transactions.some(t => t.balance !== undefined) && (
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground w-24">Balance</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((txn, idx) => (
                  <tr key={txn.id || idx} className="cursor-pointer border-t hover:bg-muted/30 transition-colors" onClick={() => setDetail({ title: txn.description || txn.type || 'Transaction', rows: [txn] })}>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">{formatDateDDMMYY(txn.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getTypeColor(txn.type)}`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate">{txn.description}</div>
                      {txn.details && <div className="text-xs text-muted-foreground truncate">{txn.details}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap font-mono">{txn.reference || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {txn.debit ? formatCurrency(txn.debit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {txn.credit ? formatCurrency(txn.credit) : '—'}
                    </td>
                    {data.transactions.some(t => t.balance !== undefined) && (
                      <td className="px-4 py-3 text-right font-bold">
                        <span className={txn.balance !== undefined && txn.balance > 0 ? 'text-red-600' : 'text-green-600'}>
                          {txn.balance !== undefined ? formatCurrency(txn.balance) : '—'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile/Tablet View */}
          <div className="lg:hidden space-y-3">
            {data.transactions.map((txn, idx) => (
              <Card key={txn.id || idx} className="border-l-4 border-l-blue-500">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2 cursor-pointer" onClick={() => toggleRow(txn.id || String(idx))}>
                    <div className="flex-1">
                      <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${getTypeColor(txn.type)}`}>
                        {txn.type}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">{formatDateDDMMYY(txn.date)}</p>
                    </div>
                    <div>
                      {expandedRows.has(txn.id || String(idx)) ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  <p className="font-medium text-sm mb-2">{txn.description}</p>
                  {txn.details && expandedRows.has(txn.id || String(idx)) && (
                    <p className="text-xs text-muted-foreground mb-2 bg-muted/50 p-2 rounded">{txn.details}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Debit</p>
                      <p className="font-semibold">{txn.debit ? formatCurrency(txn.debit) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Credit</p>
                      <p className="font-semibold">{txn.credit ? formatCurrency(txn.credit) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className={`font-bold ${txn.balance !== undefined && txn.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {txn.balance !== undefined ? formatCurrency(txn.balance) : '—'}
                      </p>
                    </div>
                  </div>

                  {txn.reference && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium">Ref:</span> {txn.reference}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data.transactions.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No transactions found for this report.</p>
        </div>
      )}
      {detail && <EnrichedDetailModal title={detail.title} rows={detail.rows} onClose={() => setDetail(null)} />}

    </div>
  )
}

export default EnrichedReport
