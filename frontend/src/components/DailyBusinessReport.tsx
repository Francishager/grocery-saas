import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Banknote, BarChart3, BriefcaseBusiness, CreditCard, Package, ReceiptText, Smartphone, UserRound, UsersRound, WalletCards, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'
import CustomerTransactionHistoryDialog, { type CustomerHistoryTarget } from '@/components/customer/CustomerTransactionHistoryDialog'

export interface DailyBusinessData {
  header: {
    date: string
    businessName?: string
    businessPhone?: string
    businessAddress?: string
    branch: string
    status: string
    generatedBy?: string
  }
  summary: Record<string, number>
  cashMovement: Record<string, number>
  profitability: Record<string, number>
  customerActivity: any[]
  staffActivity: any[]
  productActivity: any[]
  expenses: any[]
  transactions: any[]
  staffTills: any[]
  generatedAt: string
}

type Drilldown = { title: string; rows: any[] } | null
type SummaryCard = { label: string; value: number; kinds: string[]; methods?: string[]; icon: typeof BarChart3 }

const today = () => new Date().toISOString().slice(0, 10)
const numberValue = (value: unknown) => {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}
const money = (value: unknown) => formatCurrency(numberValue(value))
const text = (value: unknown) => String(value || '-').replace(/_/g, ' ')
const normalizePaymentMethod = (value: unknown) => {
  const method = String(value || 'cash').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['mobile_money', 'mobilemoney', 'momo', 'mtn', 'mtn_momo', 'airtel', 'airtel_money'].includes(method)) return 'mobile_money'
  if (['bank_transfer', 'banktransfer', 'wire_transfer', 'bank', 'cheque', 'check'].includes(method)) return 'bank'
  if (['card', 'debit_card', 'credit_card'].includes(method)) return 'card'
  if (method === 'safe') return 'safe'
  if (method === 'credit' || method === 'on_credit') return 'credit'
  return 'cash'
}
const normalizeMovementDirection = (value: unknown) => {
  const direction = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (direction === 'transfer-in' || direction === 'handover-in') return 'transfer-in'
  if (direction === 'transfer-out' || direction === 'handover-out') return 'transfer-out'
  if (direction === 'in' || direction === 'debit' || direction === 'income' || direction === 'receipt' || direction === 'deposit') return 'in'
  if (direction === 'out' || direction === 'credit' || direction === 'expense' || direction === 'payment' || direction === 'withdrawal') return 'out'
  return direction.includes('out') ? 'out' : 'in'
}
const rowKey = (row: any) => row?.id || `${row?.kind || 'row'}-${row?.reference || ''}-${row?.date || ''}`
const metricValue = (value: unknown, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}
const customerIdOf = (row: any) => {
  const id = row?.customerId || row?.id || ''
  if (!id || id === 'walk-in' || String(id).startsWith('cash-name:')) return ''
  return id
}

function normalizeDailyBusinessData(input: any): DailyBusinessData {
  const fallbackDate = today()
  const empty: DailyBusinessData = {
    header: {
      date: fallbackDate,
      businessName: 'Business',
      businessPhone: '',
      businessAddress: '',
      branch: 'All authorized branches',
      status: 'Open',
    },
    summary: {},
    cashMovement: {},
    profitability: {},
    customerActivity: [],
    staffActivity: [],
    productActivity: [],
    expenses: [],
    transactions: [],
    staffTills: [],
    generatedAt: new Date().toISOString(),
  }

  if (Array.isArray(input)) {
    const totalSales = input.reduce((sum, row) => sum + numberValue(row.revenue ?? row.total ?? row.gross ?? row.grossSales), 0)
    const totalTax = input.reduce((sum, row) => sum + numberValue(row.tax), 0)
    const totalDiscount = input.reduce((sum, row) => sum + numberValue(row.discount), 0)
    const totalCost = input.reduce((sum, row) => sum + numberValue(row.cost ?? row.cogs), 0)
    const totalProfit = input.reduce((sum, row) => sum + numberValue(row.profit), 0)
    const transactionCount = input.reduce((sum, row) => sum + numberValue(row.count || 1), 0)
    return {
      ...empty,
      header: {
        ...empty.header,
        date: input[0]?.date || input[0]?.createdAt || fallbackDate,
      },
      summary: {
        totalSales,
        grossSales: totalSales + totalTax,
        revenue: totalSales,
        totalDiscount,
        taxCollected: totalTax,
        transactionCount,
      },
      cashMovement: {
        cashAtHand: 0,
        netCashMovement: 0,
      },
      profitability: {
        revenue: totalSales,
        cogs: totalCost,
        grossProfit: totalProfit || totalSales - totalCost,
        expenses: 0,
        netProfit: totalProfit || totalSales - totalCost,
      },
      expenses: [],
      transactions: input.map((row, index) => ({
        id: row.id || `${row.date || fallbackDate}-${index}`,
        kind: 'sale',
        date: row.date || row.createdAt || fallbackDate,
        reference: row.receiptNo || row.reference || row.date || `SALE-${index + 1}`,
        customer: row.customer || row.customerName || 'Walk-in',
        staff: row.staff || row.user || '',
        paymentMethod: row.paymentMethod || '',
        amount: numberValue(row.revenue ?? row.total ?? row.gross ?? row.grossSales),
        debit: numberValue(row.revenue ?? row.total ?? row.gross ?? row.grossSales),
        credit: 0,
      })),
    }
  }

  if (!input || typeof input !== 'object') return empty

  return {
    ...empty,
    ...input,
    header: {
      ...empty.header,
      ...(input.header || {}),
      date: input.header?.date || input.date || fallbackDate,
      businessName: input.header?.businessName || input.businessName || 'Business',
      branch: input.header?.branch || input.branch || 'All authorized branches',
      status: input.header?.status || 'Open',
    },
    summary: input.summary || {},
    cashMovement: input.cashMovement || {},
    profitability: input.profitability || {},
    customerActivity: Array.isArray(input.customerActivity) ? input.customerActivity : [],
    staffActivity: Array.isArray(input.staffActivity) ? input.staffActivity : [],
    productActivity: Array.isArray(input.productActivity) ? input.productActivity : [],
    expenses: Array.isArray(input.expenses) ? input.expenses : [],
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    staffTills: Array.isArray(input.staffTills) ? input.staffTills : [],
    generatedAt: input.generatedAt || new Date().toISOString(),
  }
}

function groupMoneyRows<T extends { key: string; label: string }>(
  rows: any[],
  getKey: (row: any) => T,
) {
  const map = new Map<string, T & { amount: number; count: number }>()
  rows.forEach((row) => {
    const keyInfo = getKey(row)
    const current = map.get(keyInfo.key) || { ...keyInfo, amount: 0, count: 0 }
    current.amount += numberValue(row.amount)
    current.count += 1
    map.set(keyInfo.key, current)
  })
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

function DetailModal({ drilldown, onClose, onTransaction }: { drilldown: Drilldown; onClose: () => void; onTransaction: (row: any) => void }) {
  if (!drilldown) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full overflow-hidden rounded-t-xl bg-background shadow-xl sm:max-w-6xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold sm:text-lg">{drilldown.title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X className="h-5 w-5" /></Button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-4 sm:p-6">
          {drilldown.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions match this figure.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Staff</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Cash</th>
                    <th className="px-3 py-2 text-right">Sale Credit</th>
                    <th className="px-3 py-2 text-right">Customer Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldown.rows.map((row, index) => (
                    <tr key={row.id || index} className="border-t hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2">{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="px-3 py-2"><button className="font-mono text-primary underline-offset-2 hover:underline" onClick={() => onTransaction(row)}>{row.reference || row.id}</button></td>
                      <td className="px-3 py-2">{row.customer || '-'}</td>
                      <td className="px-3 py-2">{row.staff || '-'}</td>
                      <td className="px-3 py-2 capitalize">{text(row.paymentMethod)}</td>
                      <td className="px-3 py-2 text-right">{money(row.debit)}</td>
                      <td className="px-3 py-2 text-right">{money(row.credit)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.cashAmount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.creditAmount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.customerBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TransactionModal({ row, onClose }: { row: any; onClose: () => void }) {
  if (!row) return null
  const fields = [
    ['Reference', row.reference || row.id],
    ['Date / Time', row.date ? new Date(row.date).toLocaleString() : '-'],
    ['Type', row.kind === 'credit-sale' ? 'Credit Sale' : row.kind === 'collection' ? 'Customer Payment' : row.kind === 'expense' ? 'Expense' : row.kind === 'transfer' ? 'Cash Transfer' : 'Sale'],
    ['Customer', row.customer || 'Walk-in'],
    ['Customer Balance', money(row.customerBalance)],
    ['Staff', row.staff || '-'],
    ['Branch', row.branch || '-'],
    ['Payment Method', text(row.paymentMethod)],
    ['Amount', money(row.amount)],
    ['Debit', money(row.debit)],
    ['Credit', money(row.credit)],
    ['Cash Portion', money(row.cashAmount)],
    ['Credit Portion', money(row.creditAmount)],
    ['Status', row.status || 'Completed'],
  ]
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full overflow-auto rounded-t-xl bg-background p-5 shadow-xl sm:max-w-3xl sm:rounded-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transaction Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close transaction details"><X className="h-5 w-5" /></Button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
        {Array.isArray(row.items) && row.items.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 font-semibold">Items Sold</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="bg-muted/50">
                  <tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">COGS</th><th className="px-3 py-2 text-right">Gross Profit</th></tr>
                </thead>
                <tbody>
                  {row.items.map((item: any, index: number) => (
                    <tr className="border-t" key={item.productId || index}>
                      <td className="px-3 py-2">{item.product}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{money(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{money(item.total)}</td>
                      <td className="px-3 py-2 text-right">{money(item.cost)}</td>
                      <td className="px-3 py-2 text-right">{money(item.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DailyBusinessReport({ data: rawData }: { data: DailyBusinessData | any[] | any }) {
  const data = useMemo(() => normalizeDailyBusinessData(rawData), [rawData])
  const [drilldown, setDrilldown] = useState<Drilldown>(null)
  const [transaction, setTransaction] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [historyCustomer, setHistoryCustomer] = useState<CustomerHistoryTarget | null>(null)
  const transactions = useMemo(() => (data.transactions || []).map((row: any) => ({
    ...row,
    paymentMethod: normalizePaymentMethod(row.paymentMethod || row.method),
    debit: numberValue(row.debit),
    credit: numberValue(row.credit),
    cashAmount: row.cashAmount === undefined || row.cashAmount === null ? row.cashAmount : numberValue(row.cashAmount),
    creditAmount: row.creditAmount === undefined || row.creditAmount === null ? row.creditAmount : numberValue(row.creditAmount),
    amount: numberValue(row.amount),
  })), [data.transactions])
  const summary = data.summary || {}
  const cash = data.cashMovement || {}
  const profitability = data.profitability || {}
  const expenseRows = useMemo(() => {
    const source = data.expenses.length ? data.expenses : transactions.filter((row) => row.kind === 'expense')
    return source.map((row: any) => ({
      ...row,
      kind: 'expense',
      category: row.category || 'Uncategorized',
      description: row.description || row.category || 'Expense',
      paymentMethod: normalizePaymentMethod(row.paymentMethod || row.method),
      account: row.account || row.cashAccount?.name || '',
      staff: row.staff || row.User?.name || '',
      amount: numberValue(row.amount),
      debit: numberValue(row.debit),
      credit: numberValue(row.credit || row.amount),
    }))
  }, [data.expenses, transactions])
  const cashMovementRows = useMemo(() => transactions.filter((row) => row.kind === 'cash-movement' || row.kind === 'transfer'), [transactions])
  const expenseByCategory = useMemo(
    () => groupMoneyRows(expenseRows, (row) => ({ key: row.category || 'Uncategorized', label: row.category || 'Uncategorized' })),
    [expenseRows]
  )
  const expenseByMethod = useMemo(
    () => groupMoneyRows(expenseRows, (row) => ({ key: row.paymentMethod || 'cash', label: text(row.paymentMethod || 'cash') })),
    [expenseRows]
  )

  const rowsForKinds = (kinds: string[], methods?: string[]) => {
    const rows = new Map<string, any>()
    transactions.forEach((row) => {
      if (kinds.includes(row.kind) && (!methods?.length || methods.includes(row.paymentMethod))) {
        rows.set(rowKey(row), row)
      }
    })
    if (kinds.includes('expense')) {
      expenseRows.forEach((row) => {
        if (!methods?.length || methods.includes(row.paymentMethod)) rows.set(rowKey(row), row)
      })
    }
    return [...rows.values()]
  }
  const openKind = (title: string, kinds: string[], methods?: string[]) => {
    setDrilldown({ title, rows: rowsForKinds(kinds, methods) })
  }
  const openRows = (title: string, rows: any[]) => setDrilldown({ title, rows })
  const customerTransactions = useMemo(() => customer ? (customer.transactions || transactions.filter((row) => row.customerId === customerIdOf(customer) || row.customer === customer.name)) : [], [customer, transactions])
  const selectedCustomerId = customerIdOf(customer)
  const openCustomerHistory = (row: any) => {
    const customerId = customerIdOf(row)
    if (!customerId) return
    setHistoryCustomer({ id: customerId, name: row.name || row.customer || 'Customer', phone: row.phone })
  }
  const cardTotals = useMemo(() => {
    const saleRows = transactions.filter((row) => row.kind === 'sale' || row.kind === 'credit-sale')
    const sum = (rows: any[], getValue: (row: any) => number) => rows.reduce((total, row) => total + getValue(row), 0)
    const paidPortion = (row: any) => {
      if (row.cashAmount !== undefined && row.cashAmount !== null) return numberValue(row.cashAmount)
      if (row.debit !== undefined && row.debit !== null) return numberValue(row.debit)
      return numberValue(row.amount)
    }
    const creditPortion = (row: any) => {
      if (row.creditAmount !== undefined && row.creditAmount !== null) return numberValue(row.creditAmount)
      return row.kind === 'credit-sale' ? numberValue(row.amount) : 0
    }
    const fromSummary = (value: unknown, derived: number) => {
      const summaryValue = metricValue(value, derived)
      return summaryValue === 0 && derived !== 0 ? derived : summaryValue
    }
    const methodTotal = (method: string) => sum(saleRows.filter((row) => row.paymentMethod === method), paidPortion)
    const expenseTotal = sum(expenseRows, (row) => numberValue(row.amount))
    const transactionTotal = sum(saleRows, (row) => numberValue(row.amount))
    const collectionTotal = sum(transactions.filter((row) => row.kind === 'collection'), (row) => numberValue(row.amount))
    const cashCollectionTotal = sum(transactions.filter((row) => row.kind === 'collection' && row.paymentMethod === 'cash'), (row) => numberValue(row.amount))
    const cashExpenseTotal = sum(expenseRows.filter((row) => row.paymentMethod === 'cash'), (row) => numberValue(row.amount))
    const movementAccountType = (row: any) => normalizePaymentMethod(row.accountType || row.paymentMethod || row.method)
    const physicalCashRows = cashMovementRows.filter((row) => movementAccountType(row) === 'cash')
    const movementGroups = new Map<string, { outgoingTypes: Set<string> }>()
    cashMovementRows.forEach((row) => {
      const reference = String(row.reference || '').trim()
      if (!reference) return
      const direction = normalizeMovementDirection(row.direction)
      const group = movementGroups.get(reference) || { outgoingTypes: new Set<string>() }
      if (direction === 'out' || direction === 'transfer-out') group.outgoingTypes.add(movementAccountType(row))
      movementGroups.set(reference, group)
    })
    const physicalCashMovementTotal = (directions: string[]) => sum(
      physicalCashRows.filter((row) => directions.includes(normalizeMovementDirection(row.direction))),
      (row) => numberValue(row.amount)
    )
    const unpairedNonCashInflowTotal = (accountType: string) => sum(
      cashMovementRows.filter((row) => {
        if (movementAccountType(row) !== accountType) return false
        const direction = normalizeMovementDirection(row.direction)
        if (direction !== 'in' && direction !== 'transfer-in') return false
        const reference = String(row.reference || '').trim()
        if (!reference) return true
        const group = movementGroups.get(reference)
        return !group || group.outgoingTypes.size === 0
      }),
      (row) => numberValue(row.amount)
    )
    const otherPhysicalCashIn = metricValue(cash.otherPhysicalCashIn ?? cash.otherCashIn, physicalCashMovementTotal(['in']))
    const otherPhysicalCashOut = metricValue(cash.otherPhysicalCashOut ?? cash.otherCashOut, physicalCashMovementTotal(['out']))
    const cashTransfersInTotal = metricValue(cash.cashTransfersIn, physicalCashMovementTotal(['transfer-in']))
    const cashTransfersOutTotal = metricValue(cash.cashTransfersOut, physicalCashMovementTotal(['transfer-out']))
    const cashToSafeTotal = metricValue(cash.cashToSafe, unpairedNonCashInflowTotal('safe'))
    const cashToBankTotal = metricValue(cash.cashToBank, unpairedNonCashInflowTotal('bank'))
    const cashToMobileMoneyTotal = metricValue(cash.cashToMobileMoney, unpairedNonCashInflowTotal('mobile_money'))
    const derivedCashAtHand =
      numberValue(cash.openingCash) +
      methodTotal('cash') +
      metricValue(cash.cashCollections, cashCollectionTotal) +
      otherPhysicalCashIn +
      cashTransfersInTotal -
      cashExpenseTotal -
      otherPhysicalCashOut -
      cashTransfersOutTotal -
      cashToSafeTotal -
      cashToBankTotal -
      cashToMobileMoneyTotal
    const derivedNetCashMovement =
      methodTotal('cash') +
      metricValue(cash.cashCollections, cashCollectionTotal) +
      numberValue(cash.otherCashIn) +
      cashTransfersInTotal -
      cashExpenseTotal -
      numberValue(cash.otherCashOut) -
      cashTransfersOutTotal -
      cashToSafeTotal -
      cashToBankTotal -
      cashToMobileMoneyTotal
    const cogsTotal = sum(saleRows, (row) => Array.isArray(row.items)
      ? row.items.reduce((total: number, item: any) => total + numberValue(item.cost ?? item.cogs), 0)
      : numberValue(row.cogs ?? row.cost)
    )
    const revenueTotal = metricValue(profitability.revenue ?? summary.revenue, transactionTotal - numberValue(summary.taxCollected))
    const grossProfitTotal = metricValue(profitability.grossProfit ?? summary.grossProfit, revenueTotal - cogsTotal)

    return {
      totalSales: fromSummary(summary.totalSales ?? summary.grossSales, transactionTotal),
      revenue: revenueTotal,
      cogs: metricValue(profitability.cogs ?? summary.cogs, cogsTotal),
      cashSales: fromSummary(summary.cashSales, methodTotal('cash')),
      creditSales: fromSummary(summary.creditSales, sum(saleRows, creditPortion)),
      mobileMoneySales: fromSummary(summary.mobileMoneySales, methodTotal('mobile_money')),
      bankSales: fromSummary(summary.bankSales, methodTotal('bank')),
      cardSales: fromSummary(summary.cardSales, methodTotal('card')),
      debtCollections: fromSummary(summary.debtCollections, collectionTotal),
      expenses: fromSummary(summary.expenses, expenseTotal),
      cashAtHand: fromSummary(cash.cashAtHand ?? summary.cashAtHand, derivedCashAtHand),
      netCashMovement: fromSummary(cash.netCashMovement ?? summary.netCashMovement, derivedNetCashMovement),
      grossProfit: grossProfitTotal,
      netProfit: fromSummary(profitability.netProfit ?? summary.netProfit, grossProfitTotal - expenseTotal),
    }
  }, [cash, cashMovementRows, expenseRows, profitability, summary, transactions])

  const cards: SummaryCard[] = [
    { label: 'Total Sales', value: cardTotals.totalSales, kinds: ['sale', 'credit-sale'], icon: BarChart3 },
    { label: 'Cash Sales', value: cardTotals.cashSales, kinds: ['sale', 'credit-sale'], methods: ['cash'], icon: Banknote },
    { label: 'Credit Sales', value: cardTotals.creditSales, kinds: ['credit-sale'], icon: CreditCard },
    { label: 'Mobile Money Sales', value: cardTotals.mobileMoneySales, kinds: ['sale', 'credit-sale'], methods: ['mobile_money'], icon: Smartphone },
    { label: 'Bank / Card Sales', value: cardTotals.bankSales + cardTotals.cardSales, kinds: ['sale', 'credit-sale'], methods: ['bank', 'card'], icon: ArrowUpFromLine },
    { label: 'Debt Collections', value: cardTotals.debtCollections, kinds: ['collection'], icon: ReceiptText },
    { label: 'Expenses', value: cardTotals.expenses, kinds: ['expense'], icon: ArrowDownToLine },
  ]

  const cashRows = [
    ['Cash at Hand', cardTotals.cashAtHand],
    ['Opening Physical Cash', cash.openingCash],
    ['Cash Sales', metricValue(cash.cashSales, cardTotals.cashSales)],
    ['Cash Debt Collections', metricValue(cash.cashCollections, cardTotals.debtCollections)],
    ['Other Cash In', cash.otherCashIn],
    ['Cash Transfers In', cash.cashTransfersIn],
    ['Cash Expenses', metricValue(cash.cashExpenses, expenseRows.filter((row) => row.paymentMethod === 'cash').reduce((total, row) => total + numberValue(row.amount), 0))],
    ['Other Cash Out', cash.otherCashOut],
    ['Cash Transfers Out', cash.cashTransfersOut],
    ['Moved to Safe', cash.cashToSafe],
    ['Moved to Bank', cash.cashToBank],
    ['Moved to Mobile Money', cash.cashToMobileMoney],
    ['Net Cash Movement', cardTotals.netCashMovement],
    ['Cash Retained / Float', cash.cashRetained],
  ]
  const balancingTotals = [
    { label: 'Cash at Hand', value: cardTotals.cashAtHand, note: 'Cash sales plus cash credit repayments, after real cash expenses and till transfers', kinds: ['sale', 'collection', 'expense', 'cash-movement', 'transfer'] },
    { label: 'Cash Sales', value: cardTotals.cashSales, note: 'Sales paid by cash', kinds: ['sale', 'credit-sale'], methods: ['cash'] },
    { label: 'Credit Sales', value: cardTotals.creditSales, note: 'Customer balances created', kinds: ['credit-sale'] },
    { label: 'Debt Collections', value: cardTotals.debtCollections, note: 'Payments on old credit', kinds: ['collection'] },
    { label: 'Expenses', value: cardTotals.expenses, note: 'Money spent today', kinds: ['expense'] },
    { label: 'Net Cash Movement', value: cardTotals.netCashMovement, note: 'Cash in minus real cash expenses and till transfers', kinds: ['sale', 'collection', 'expense', 'cash-movement', 'transfer'] },
    { label: 'Gross Profit', value: cardTotals.grossProfit, note: 'Sales minus COGS', kinds: ['sale', 'credit-sale'] },
    { label: 'Net Profit', value: cardTotals.netProfit, note: 'Gross profit minus expenses', kinds: ['sale', 'credit-sale', 'expense'] },
  ]
  const cashFormulaRows = [
    { label: 'Opening Physical Cash', inflow: cash.openingCash, outflow: 0 },
    { label: 'Cash Sales', inflow: metricValue(cash.cashSales, cardTotals.cashSales), outflow: 0 },
    { label: 'Cash Debt Collections', inflow: metricValue(cash.cashCollections ?? cash.debtCollections, cardTotals.debtCollections), outflow: 0 },
    { label: 'Other Cash In', inflow: cash.otherPhysicalCashIn ?? cash.otherCashIn, outflow: 0 },
    { label: 'Cash Transfers In', inflow: cash.cashTransfersIn, outflow: 0 },
    { label: 'Cash Expenses', inflow: 0, outflow: metricValue(cash.cashExpenses, expenseRows.filter((row) => row.paymentMethod === 'cash').reduce((total, row) => total + numberValue(row.amount), 0)) },
    { label: 'Other Cash Out', inflow: 0, outflow: cash.otherPhysicalCashOut ?? cash.otherCashOut },
    { label: 'Cash Transfers Out', inflow: 0, outflow: cash.cashTransfersOut },
    { label: 'Moved to Safe', inflow: 0, outflow: cash.cashToSafe },
    { label: 'Moved to Bank', inflow: 0, outflow: cash.cashToBank },
    { label: 'Moved to Mobile Money', inflow: 0, outflow: cash.cashToMobileMoney },
  ].filter((row) => numberValue(row.inflow) || numberValue(row.outflow) || row.label === 'Opening Physical Cash')

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Daily Business Report</p>
          <h1 className="hidden break-words text-2xl font-bold print:block">{data.header.businessName || 'Business'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDisplayDate(data.header.date)} - {data.header.branch}</p>
          {(data.header.businessPhone || data.header.businessAddress) && <p className="mt-1 hidden text-xs text-muted-foreground print:block">{[data.header.businessPhone, data.header.businessAddress].filter(Boolean).join(' - ')}</p>}
        </div>
        <div className="text-left text-sm sm:text-right">
          <Badge variant={data.header.status === 'Closed' ? 'secondary' : 'default'}>{data.header.status}</Badge>
          <p className="mt-2 text-xs text-muted-foreground">Generated {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</p>
          {data.header.generatedBy && <p className="text-xs text-muted-foreground">By {data.header.generatedBy}</p>}
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Day Balancing Totals</h2>
            <p className="text-xs text-muted-foreground">Use these totals to close and balance the business day.</p>
          </div>
          <Badge variant="outline" className="w-fit">{formatDisplayDate(data.header.date)}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balancingTotals.map((item) => (
            <button key={item.label} className="min-w-0 text-left print:pointer-events-none" onClick={() => openKind(item.label, item.kinds, item.methods)}>
              <Card className={item.label === 'Cash at Hand' ? 'h-full border-primary/60 bg-primary/5' : 'h-full transition hover:border-primary hover:shadow-sm'}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
                  <p className="mt-2 break-words text-xl font-bold leading-tight">{money(item.value)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sales and Collections</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {cards.map(({ label, value, kinds, methods, icon: Icon }) => (
            <button key={label} className="min-w-0 text-left print:pointer-events-none" onClick={() => openKind(label, kinds, methods)}>
              <Card className="h-full transition hover:border-primary hover:shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-xs font-semibold uppercase text-muted-foreground">{label}</p><Icon className="h-4 w-4 shrink-0 text-primary" /></div>
                  <p className="mt-3 break-words text-lg font-bold leading-tight sm:text-xl">{money(value)}</p>
                  <p className="mt-1 text-xs text-primary print:hidden">View transactions</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4" />Cash Status Report</CardTitle></CardHeader>
          <CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cashRows.map(([label, value]) => <div key={label} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold">{money(value)}</p></div>)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BriefcaseBusiness className="h-4 w-4" />Profitability</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              ['Revenue', cardTotals.revenue],
              ['COGS', cardTotals.cogs],
              ['Gross Profit', cardTotals.grossProfit],
              ['Net Profit', cardTotals.netProfit],
            ].map(([label, value]) => <button key={label} className="rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => openKind(`${label} Support`, ['sale', 'credit-sale'])}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-semibold">{money(value)}</p></button>)}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4" />Cash Position Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2 text-right">Cash In</th><th className="px-3 py-2 text-right">Cash Out</th><th className="px-3 py-2 text-right">Effect</th></tr>
                </thead>
                <tbody>
                  {cashFormulaRows.map((row) => {
                    const effect = numberValue(row.inflow) - numberValue(row.outflow)
                    return (
                      <tr key={row.label} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 text-right">{numberValue(row.inflow) ? money(row.inflow) : '-'}</td>
                        <td className="px-3 py-2 text-right">{numberValue(row.outflow) ? money(row.outflow) : '-'}</td>
                        <td className={effect < 0 ? 'px-3 py-2 text-right font-semibold text-red-600' : 'px-3 py-2 text-right font-semibold'}>{money(effect)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t bg-primary/5">
                    <td className="px-3 py-2 font-bold">Cash at Hand</td>
                    <td className="px-3 py-2 text-right">-</td>
                    <td className="px-3 py-2 text-right">-</td>
                    <td className="px-3 py-2 text-right font-bold">{money(cardTotals.cashAtHand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" />Expense Breakdown</span>
              <Badge variant="outline">{money(cardTotals.expenses)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border">
                <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">By Category</div>
                <div className="divide-y">
                  {expenseByCategory.length ? expenseByCategory.map((row) => (
                    <button key={row.key} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40" onClick={() => openRows(`Expenses - ${row.label}`, expenseRows.filter((expense) => (expense.category || 'Uncategorized') === row.key))}>
                      <span className="min-w-0"><span className="block break-words font-medium">{row.label}</span><span className="text-xs text-muted-foreground">{row.count} transaction{row.count === 1 ? '' : 's'}</span></span>
                      <span className="shrink-0 font-semibold">{money(row.amount)}</span>
                    </button>
                  )) : <p className="px-3 py-6 text-sm text-muted-foreground">No expenses recorded.</p>}
                </div>
              </div>
              <div className="rounded-md border">
                <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">By Payment Method</div>
                <div className="divide-y">
                  {expenseByMethod.length ? expenseByMethod.map((row) => (
                    <button key={row.key} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left capitalize hover:bg-muted/40" onClick={() => openRows(`Expenses - ${row.label}`, expenseRows.filter((expense) => (expense.paymentMethod || 'cash') === row.key))}>
                      <span className="min-w-0"><span className="block break-words font-medium">{row.label}</span><span className="text-xs text-muted-foreground">{row.count} transaction{row.count === 1 ? '' : 's'}</span></span>
                      <span className="shrink-0 font-semibold">{money(row.amount)}</span>
                    </button>
                  )) : <p className="px-3 py-6 text-sm text-muted-foreground">No expense payments recorded.</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDownToLine className="h-4 w-4" />Expenses Paid Today</CardTitle></CardHeader>
        <CardContent>
          {expenseRows.length ? (
            <>
              <div className="grid gap-3 md:hidden">
                {expenseRows.map((row: any, index: number) => (
                  <button key={row.id || index} className="rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setTransaction(row)}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{row.description}</span>
                        <span className="text-xs text-muted-foreground">{row.category} - {text(row.paymentMethod)} - {row.account || 'No account'}</span>
                      </span>
                      <span className="shrink-0 font-semibold">{money(row.amount)}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{row.staff || 'Unknown'} - {row.reference || row.id}</div>
                  </button>
                ))}
              </div>
              <div className="hidden overflow-x-auto rounded-md border md:block">
                <table className="min-w-[1120px] w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Paid From</th><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Outflow</th></tr>
                  </thead>
                  <tbody>
                    {expenseRows.map((row: any, index: number) => (
                      <tr key={row.id || index} className="border-t hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-2">{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                        <td className="px-3 py-2"><button className="font-mono text-primary underline-offset-2 hover:underline" onClick={() => setTransaction(row)}>{row.reference || row.id}</button></td>
                        <td className="px-3 py-2">{row.category || 'Uncategorized'}</td>
                        <td className="max-w-[320px] px-3 py-2"><span className="block break-words">{row.description || '-'}</span></td>
                        <td className="px-3 py-2">{row.account || '-'}</td>
                        <td className="px-3 py-2">{row.staff || '-'}</td>
                        <td className="px-3 py-2 capitalize">{text(row.paymentMethod)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No expenses recorded for this day.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4" />Cash and Account Movement Details</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Direction</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {cashMovementRows.length ? cashMovementRows.map((row: any, index: number) => (
                  <tr key={row.id || index} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="px-3 py-2"><button className="font-mono text-primary underline-offset-2 hover:underline" onClick={() => setTransaction(row)}>{row.reference || row.id}</button></td>
                    <td className="px-3 py-2 capitalize">{text(row.kind)}</td>
                    <td className="px-3 py-2">{row.account || '-'}</td>
                    <td className="px-3 py-2">{row.staff || '-'}</td>
                    <td className="px-3 py-2 capitalize">{text(row.direction || row.paymentMethod)}</td>
                    <td className="px-3 py-2 text-right">{money(row.debit)}</td>
                    <td className="px-3 py-2 text-right">{money(row.credit)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td>
                  </tr>
                )) : <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={9}>No separate cash or account movements for this day.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" />Customer Activity</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {data.customerActivity?.length ? data.customerActivity.map((row: any) => <button key={row.id} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setCustomer(row)}><span className="min-w-0"><span className="block break-words font-medium text-primary">{row.name}</span><span className="text-xs text-muted-foreground">Cash {money(row.cashSales)} - Credit {money(row.creditSales)} - Paid {money(row.payments)}</span></span><span className="shrink-0 text-right text-sm"><span className="block font-semibold">{money(row.currentBalance)}</span><span className="text-xs text-muted-foreground">Balance</span></span></button>) : <p className="text-sm text-muted-foreground">No customer activity.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4" />Staff Activity</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {data.staffActivity?.length ? data.staffActivity.map((row: any) => <button key={row.id} className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => openRows(`${row.name} Activity`, transactions.filter((tx) => tx.staffId === row.id))}><span className="min-w-0 font-medium">{row.name}</span><span className="shrink-0 text-right text-sm"><span className="block font-semibold">{money(row.sales)}</span><span className="text-xs text-muted-foreground">Collections {money(row.collections)} - Expenses {money(row.expenses)}</span></span></button>) : <p className="text-sm text-muted-foreground">No staff activity.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" />Product Activity</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {data.productActivity?.length ? data.productActivity.slice(0, 20).map((row: any) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="min-w-0"><span className="block break-words font-medium">{row.name}</span><span className="text-xs text-muted-foreground">Qty {row.quantitySold} - Stock {row.currentStock} - Profit {money(row.grossProfit)}</span></span><span className="shrink-0 font-semibold">{money(row.salesValue)}</span></div>) : <p className="text-sm text-muted-foreground">No product activity.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" />Staff Tills and Cash Accounts</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Staff</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Cash In</th><th className="px-3 py-2 text-right">Cash Out</th><th className="px-3 py-2 text-right">Transfers In</th><th className="px-3 py-2 text-right">Transfers Out</th><th className="px-3 py-2 text-right">Expected Closing</th></tr></thead>
              <tbody>
                {data.staffTills?.length ? data.staffTills.map((row: any) => <tr key={row.id} className="border-t"><td className="px-3 py-2 font-medium">{row.name}</td><td className="px-3 py-2 capitalize">{text(row.type)}</td><td className="px-3 py-2">{row.staff || 'Unassigned'}</td><td className="px-3 py-2 text-right">{money(row.openingCash)}</td><td className="px-3 py-2 text-right">{money(row.debit)}</td><td className="px-3 py-2 text-right">{money(row.credit)}</td><td className="px-3 py-2 text-right">{money(row.cashIn)}</td><td className="px-3 py-2 text-right">{money(row.cashOut)}</td><td className="px-3 py-2 text-right">{money(row.cashTransfersIn)}</td><td className="px-3 py-2 text-right">{money(row.cashTransfersOut)}</td><td className="px-3 py-2 text-right font-semibold">{money(row.expectedClosing ?? row.balance)}</td></tr>) : <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={11}>No cash accounts found.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4" />Daily Transaction Ledger</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Customer / Account</th>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Sale Credit</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length ? transactions.map((row: any, index: number) => (
                  <tr key={row.id || index} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">{row.date ? new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="px-3 py-2"><button className="font-mono text-primary underline-offset-2 hover:underline" onClick={() => setTransaction(row)}>{row.reference || row.id}</button></td>
                    <td className="px-3 py-2 capitalize">{text(row.kind)}</td>
                    <td className="px-3 py-2">
                      {row.customerId ? (
                        <button className="break-words text-left font-medium text-primary underline-offset-2 hover:underline" onClick={() => openCustomerHistory(row)}>
                          {row.customer || 'Customer'}
                        </button>
                      ) : (
                        row.customer || row.account || '-'
                      )}
                    </td>
                    <td className="px-3 py-2">{row.staff || '-'}</td>
                    <td className="px-3 py-2 capitalize">{text(row.paymentMethod || row.direction)}</td>
                    <td className="px-3 py-2 text-right">{money(row.debit)}</td>
                    <td className="px-3 py-2 text-right">{money(row.credit)}</td>
                    <td className="px-3 py-2 text-right">{money(row.creditAmount)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(row.amount)}</td>
                  </tr>
                )) : <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={10}>No transactions for this day.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {customer && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 print:hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full overflow-auto rounded-t-xl bg-background p-5 shadow-xl sm:max-w-3xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-bold">{customer.name}</h2>
                <p className="text-sm text-muted-foreground">{customer.phone || 'No phone recorded'}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Current Credit Balance</p><p className="font-semibold">{money(customer.currentBalance)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Cash Sales Today</p><p className="font-semibold">{money(customer.cashSales)}</p></div>
                  <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Credit Sales Today</p><p className="font-semibold">{money(customer.creditSales)}</p></div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCustomer(null)} aria-label="Close customer quick view"><X className="h-5 w-5" /></Button>
            </div>
            <h3 className="mt-6 font-semibold">Transactions Today</h3>
            <div className="mt-2 space-y-2">
              {customerTransactions.length ? customerTransactions.map((row: any) => <button key={row.id} className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40" onClick={() => setTransaction(row)}><span className="min-w-0"><span className="block break-words text-sm font-medium">{row.type || row.kind} - {row.reference}</span><span className="text-xs text-muted-foreground">{text(row.paymentMethod)} - Cash {money(row.cashAmount)} - Credit {money(row.creditAmount)}</span></span><span className="shrink-0 font-semibold">{money(row.amount)}</span></button>) : <p className="rounded-md border p-4 text-sm text-muted-foreground">No transactions for this customer on this date.</p>}
            </div>
            {selectedCustomerId && <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => openCustomerHistory(customer)}>View Full History</Button><Button variant="outline" onClick={() => window.location.assign(`/tenant/reports?report=customersStatement&customerId=${selectedCustomerId}`)}>Print Statement</Button></div>}
          </div>
        </div>
      )}

      <DetailModal drilldown={drilldown} onClose={() => setDrilldown(null)} onTransaction={(row) => { setDrilldown(null); setTransaction(row) }} />
      <TransactionModal row={transaction} onClose={() => setTransaction(null)} />
      <CustomerTransactionHistoryDialog
        customer={historyCustomer}
        open={!!historyCustomer}
        onOpenChange={(open) => {
          if (!open) setHistoryCustomer(null)
        }}
      />
    </div>
  )
}
