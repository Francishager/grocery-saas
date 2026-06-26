import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ShoppingCart, Package, DollarSign, Users, Building2,
  CreditCard, BarChart3, Calendar, Loader2,
  FileText, Printer, Download, FileSpreadsheet
} from 'lucide-react'
import { reportsApiV2, type ReportParams } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { exportToExcel, exportToPDF, printReport } from '@/lib/exportUtils'

type IconType = React.ComponentType<{ className?: string }>

interface ReportItem {
  id: string
  label: string
  apiFn: (params?: ReportParams) => Promise<any>
  renderType: 'table' | 'summary' | 'pnL' | 'balanceSheet' | 'trialBalance' | 'aging' | 'ledger'
  columns?: { key: string; label: string; format?: 'currency' | 'number' | 'date' | 'text' }[]
  summaryKeys?: { key: string; label: string; format?: 'currency' | 'number' | 'text' }[]
}

interface ReportCategory {
  id: string
  label: string
  icon: IconType
  permission: string
  items: ReportItem[]
}

const currencyCol = (key: string, label: string) => ({ key, label, format: 'currency' as const })
const numberCol = (key: string, label: string) => ({ key, label, format: 'number' as const })
const dateCol = (key: string, label: string) => ({ key, label, format: 'date' as const })
const textCol = (key: string, label: string) => ({ key, label, format: 'text' as const })

const CATEGORIES: ReportCategory[] = [
  {
    id: 'sales', label: 'Sales Reports', icon: ShoppingCart, permission: 'canViewSalesReport',
    items: [
      { id: 'salesSummary', label: 'Sales Summary', apiFn: reportsApiV2.salesSummary, renderType: 'summary',
        summaryKeys: [
          { key: 'count', label: 'Total Sales', format: 'number' },
          { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
          { key: 'totalSubtotal', label: 'Subtotal', format: 'currency' },
          { key: 'totalDiscount', label: 'Total Discount', format: 'currency' },
          { key: 'totalTax', label: 'Total Tax', format: 'currency' },
          { key: 'avgSale', label: 'Average Sale', format: 'currency' },
        ]
      },
      { id: 'salesDaily', label: 'Daily Sales Report', apiFn: reportsApiV2.salesDaily, renderType: 'table',
        columns: [dateCol('date', 'Date'), numberCol('count', 'Sales Count'), currencyCol('revenue', 'Revenue'), currencyCol('discount', 'Discount'), currencyCol('tax', 'Tax')]
      },
      { id: 'salesWeekly', label: 'Weekly Sales Report', apiFn: reportsApiV2.salesWeekly, renderType: 'table',
        columns: [textCol('week', 'Week'), numberCol('count', 'Sales Count'), currencyCol('revenue', 'Revenue'), currencyCol('discount', 'Discount'), currencyCol('tax', 'Tax')]
      },
      { id: 'salesMonthly', label: 'Monthly Sales Report', apiFn: reportsApiV2.salesMonthly, renderType: 'table',
        columns: [textCol('month', 'Month'), numberCol('count', 'Sales Count'), currencyCol('revenue', 'Revenue'), currencyCol('discount', 'Discount'), currencyCol('tax', 'Tax')]
      },
      { id: 'salesByProduct', label: 'Sales by Product', apiFn: reportsApiV2.salesByProduct, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('quantity', 'Quantity'), currencyCol('revenue', 'Revenue'), currencyCol('cost', 'Cost'), currencyCol('profit', 'Profit')]
      },
      { id: 'salesByCategory', label: 'Sales by Category', apiFn: reportsApiV2.salesByCategory, renderType: 'table',
        columns: [textCol('category', 'Category'), numberCol('quantity', 'Quantity'), currencyCol('revenue', 'Revenue')]
      },
      { id: 'salesByCustomer', label: 'Sales by Customer', apiFn: reportsApiV2.salesByCustomer, renderType: 'table',
        columns: [textCol('customer', 'Customer'), numberCol('count', 'Orders'), currencyCol('total', 'Total'), currencyCol('balance', 'Balance')]
      },
      { id: 'salesByUser', label: 'Sales by User/Cashier', apiFn: reportsApiV2.salesByUser, renderType: 'table',
        columns: [textCol('user', 'User'), numberCol('count', 'Sales Count'), currencyCol('revenue', 'Revenue'), currencyCol('discount', 'Discount')]
      },
      { id: 'salesByBranch', label: 'Sales by Branch', apiFn: reportsApiV2.salesByBranch, renderType: 'table',
        columns: [textCol('branch', 'Branch'), numberCol('count', 'Sales Count'), currencyCol('revenue', 'Revenue'), currencyCol('discount', 'Discount')]
      },
      { id: 'salesDiscounts', label: 'Discount Report', apiFn: reportsApiV2.salesDiscounts, renderType: 'table',
        columns: [textCol('receiptNo', 'Receipt'), textCol('status', 'Status'), currencyCol('discount', 'Discount'), currencyCol('total', 'Total')]
      },
      { id: 'salesReturns', label: 'Returns & Refunds Report', apiFn: reportsApiV2.salesReturns, renderType: 'table',
        columns: [textCol('receiptNo', 'Receipt'), textCol('status', 'Status'), currencyCol('total', 'Amount'), textCol('paymentMethod', 'Payment Method')]
      },
    ]
  },
  {
    id: 'inventory', label: 'Inventory Reports', icon: Package, permission: 'canViewInventoryReport',
    items: [
      { id: 'inventoryStock', label: 'Current Stock Report', apiFn: reportsApiV2.inventoryStock, renderType: 'table',
        columns: [textCol('name', 'Product'), textCol('category', 'Category'), numberCol('quantity', 'Qty'), currencyCol('cost', 'Cost'), currencyCol('price', 'Price')]
      },
      { id: 'inventoryValuation', label: 'Stock Valuation Report', apiFn: reportsApiV2.inventoryValuation, renderType: 'table',
        columns: [textCol('category', 'Category'), numberCol('quantity', 'Qty'), currencyCol('costValue', 'Cost Value'), currencyCol('retailValue', 'Retail Value')]
      },
      { id: 'inventoryLowStock', label: 'Low Stock Report', apiFn: reportsApiV2.inventoryLowStock, renderType: 'table',
        columns: [textCol('name', 'Product'), textCol('category', 'Category'), numberCol('quantity', 'Qty'), textCol('branch', 'Branch')]
      },
      { id: 'inventoryOutOfStock', label: 'Out of Stock Report', apiFn: reportsApiV2.inventoryOutOfStock, renderType: 'table',
        columns: [textCol('name', 'Product'), textCol('category', 'Category'), textCol('branch', 'Branch')]
      },
      { id: 'inventoryStockMovement', label: 'Stock Movement Report', apiFn: reportsApiV2.inventoryStockMovement, renderType: 'table',
        columns: [textCol('type', 'Type'), textCol('product', 'Product'), numberCol('quantity', 'Qty'), textCol('ref', 'Reference'), dateCol('date', 'Date')]
      },
      { id: 'inventoryAdjustments', label: 'Inventory Adjustment Report', apiFn: reportsApiV2.inventoryAdjustments, renderType: 'table',
        columns: [textCol('action', 'Action'), textCol('model', 'Model'), textCol('userEmail', 'User'), dateCol('createdAt', 'Date')]
      },
      { id: 'inventoryExpiry', label: 'Expiry Report', apiFn: reportsApiV2.inventoryExpiry, renderType: 'table',
        columns: [textCol('name', 'Product'), textCol('category', 'Category'), numberCol('quantity', 'Qty'), dateCol('expiryDate', 'Expiry Date')]
      },
      { id: 'inventoryDamaged', label: 'Damaged/Lost Stock Report', apiFn: reportsApiV2.inventoryDamaged, renderType: 'table',
        columns: [textCol('action', 'Action'), textCol('userEmail', 'User'), dateCol('createdAt', 'Date')]
      },
      { id: 'inventoryFastMoving', label: 'Fast Moving Products', apiFn: reportsApiV2.inventoryFastMoving, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('quantity', 'Qty Sold'), currencyCol('revenue', 'Revenue')]
      },
      { id: 'inventorySlowMoving', label: 'Slow Moving Products', apiFn: reportsApiV2.inventorySlowMoving, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('quantity', 'Qty Sold'), currencyCol('revenue', 'Revenue')]
      },
    ]
  },
  {
    id: 'financial', label: 'Financial Reports', icon: DollarSign, permission: 'canViewFinancialReport',
    items: [
      { id: 'financialProfitLoss', label: 'Profit & Loss Report', apiFn: reportsApiV2.financialProfitLoss, renderType: 'pnL' },
      { id: 'financialIncome', label: 'Income Report', apiFn: reportsApiV2.financialIncome, renderType: 'summary',
        summaryKeys: [
          { key: 'salesRevenue', label: 'Sales Revenue', format: 'currency' },
          { key: 'customerPayments', label: 'Customer Payments', format: 'currency' },
          { key: 'totalIncome', label: 'Total Income', format: 'currency' },
        ]
      },
      { id: 'financialExpense', label: 'Expense Report', apiFn: reportsApiV2.financialExpense, renderType: 'table',
        columns: [textCol('category', 'Category'), currencyCol('amount', 'Amount'), dateCol('date', 'Date'), textCol('description', 'Description')]
      },
      { id: 'financialCashFlow', label: 'Cash Flow Report', apiFn: reportsApiV2.financialCashFlow, renderType: 'summary',
        summaryKeys: [
          { key: 'inflow', label: 'Total Inflow', format: 'currency' },
          { key: 'outflow', label: 'Total Outflow', format: 'currency' },
          { key: 'netCashFlow', label: 'Net Cash Flow', format: 'currency' },
        ]
      },
      { id: 'financialTrialBalance', label: 'Trial Balance', apiFn: reportsApiV2.financialTrialBalance, renderType: 'trialBalance' },
      { id: 'financialBalanceSheet', label: 'Balance Sheet', apiFn: reportsApiV2.financialBalanceSheet, renderType: 'balanceSheet' },
      { id: 'financialGeneralLedger', label: 'General Ledger', apiFn: reportsApiV2.financialGeneralLedger, renderType: 'ledger',
        columns: [dateCol('date', 'Date'), textCol('account', 'Account'), textCol('description', 'Description'), currencyCol('debit', 'Debit'), currencyCol('credit', 'Credit')]
      },
      { id: 'financialBankTransactions', label: 'Bank Transactions Report', apiFn: reportsApiV2.financialBankTransactions, renderType: 'table',
        columns: [dateCol('createdAt', 'Date'), textCol('type', 'Type'), currencyCol('amount', 'Amount'), textCol('description', 'Description')]
      },
      { id: 'financialTax', label: 'Tax Report (VAT, GST)', apiFn: reportsApiV2.financialTax, renderType: 'summary',
        summaryKeys: [
          { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
          { key: 'totalTax', label: 'Total Tax', format: 'currency' },
          { key: 'totalDiscount', label: 'Total Discount', format: 'currency' },
          { key: 'salesCount', label: 'Sales Count', format: 'number' },
          { key: 'averageTaxRate', label: 'Avg Tax Rate (%)', format: 'text' },
        ]
      },
    ]
  },
  {
    id: 'customers', label: 'Customer Reports', icon: Users, permission: 'canViewCustomerReport',
    items: [
      { id: 'customersList', label: 'Customer List Report', apiFn: reportsApiV2.customersList, renderType: 'table',
        columns: [textCol('name', 'Name'), textCol('phone', 'Phone'), textCol('email', 'Email'), currencyCol('balance', 'Balance')]
      },
      { id: 'customersSales', label: 'Customer Sales Report', apiFn: reportsApiV2.customersSales, renderType: 'table',
        columns: [textCol('customer', 'Customer'), numberCol('count', 'Orders'), currencyCol('total', 'Total'), currencyCol('paid', 'Paid'), currencyCol('balance', 'Balance')]
      },
      { id: 'customersBalance', label: 'Customer Balance Report', apiFn: reportsApiV2.customersBalance, renderType: 'table',
        columns: [textCol('name', 'Name'), textCol('phone', 'Phone'), currencyCol('balance', 'Balance')]
      },
      { id: 'customersReceivables', label: 'Customer Receivables Report', apiFn: reportsApiV2.customersReceivables, renderType: 'table',
        columns: [textCol('customer', 'Customer'), currencyCol('total', 'Total'), currencyCol('amountPaid', 'Paid'), currencyCol('balance', 'Balance')]
      },
      { id: 'customersTop', label: 'Top Customers Report', apiFn: reportsApiV2.customersTop, renderType: 'table',
        columns: [textCol('customer', 'Customer'), numberCol('count', 'Orders'), currencyCol('total', 'Total Spent')]
      },
    ]
  },
  {
    id: 'suppliers', label: 'Supplier Reports', icon: Building2, permission: 'canViewSupplierReport',
    items: [
      { id: 'suppliersList', label: 'Supplier List Report', apiFn: reportsApiV2.suppliersList, renderType: 'table',
        columns: [textCol('name', 'Name'), textCol('phone', 'Phone'), textCol('email', 'Email'), currencyCol('balance', 'Balance')]
      },
      { id: 'suppliersPurchases', label: 'Supplier Purchases Report', apiFn: reportsApiV2.suppliersPurchases, renderType: 'table',
        columns: [textCol('supplier', 'Supplier'), numberCol('count', 'Orders'), currencyCol('total', 'Total')]
      },
      { id: 'suppliersPayables', label: 'Supplier Payables Report', apiFn: reportsApiV2.suppliersPayables, renderType: 'table',
        columns: [textCol('supplier', 'Supplier'), currencyCol('total', 'Total'), currencyCol('balance', 'Balance')]
      },
      { id: 'suppliersBalance', label: 'Supplier Balance Report', apiFn: reportsApiV2.suppliersBalance, renderType: 'table',
        columns: [textCol('name', 'Name'), textCol('phone', 'Phone'), currencyCol('balance', 'Balance')]
      },
    ]
  },
  {
    id: 'receivables', label: 'Receivables Reports', icon: CreditCard, permission: 'canViewReceivablesReport',
    items: [
      { id: 'receivablesOutstanding', label: 'Outstanding Invoices', apiFn: reportsApiV2.receivablesOutstanding, renderType: 'table',
        columns: [textCol('customer', 'Customer'), textCol('status', 'Status'), currencyCol('balance', 'Balance'), dateCol('dueDate', 'Due Date')]
      },
      { id: 'receivablesAging', label: 'Customer Aging Report', apiFn: reportsApiV2.receivablesAging, renderType: 'aging' },
      { id: 'receivablesCollection', label: 'Collection Report', apiFn: reportsApiV2.receivablesCollection, renderType: 'table',
        columns: [dateCol('createdAt', 'Date'), textCol('customer', 'Customer'), currencyCol('amount', 'Amount'), textCol('paymentMethod', 'Method')]
      },
      { id: 'receivablesOverdue', label: 'Overdue Accounts Report', apiFn: reportsApiV2.receivablesOverdue, renderType: 'table',
        columns: [textCol('customer', 'Customer'), currencyCol('balance', 'Balance'), dateCol('dueDate', 'Due Date')]
      },
    ]
  },
  {
    id: 'payables', label: 'Payables Reports', icon: FileText, permission: 'canViewPayablesReport',
    items: [
      { id: 'payablesOutstanding', label: 'Outstanding Bills Report', apiFn: reportsApiV2.payablesOutstanding, renderType: 'table',
        columns: [textCol('supplier', 'Supplier'), currencyCol('total', 'Total'), currencyCol('balance', 'Balance'), dateCol('createdAt', 'Date')]
      },
      { id: 'payablesAging', label: 'Supplier Aging Report', apiFn: reportsApiV2.payablesAging, renderType: 'aging' },
      { id: 'payablesPaymentHistory', label: 'Payment History Report', apiFn: reportsApiV2.payablesPaymentHistory, renderType: 'table',
        columns: [dateCol('createdAt', 'Date'), textCol('supplier', 'Supplier'), currencyCol('amount', 'Amount'), textCol('paymentMethod', 'Method')]
      },
      { id: 'payablesOverdue', label: 'Overdue Supplier Balances', apiFn: reportsApiV2.payablesOverdue, renderType: 'table',
        columns: [textCol('supplier', 'Supplier'), currencyCol('balance', 'Balance'), dateCol('dueDate', 'Due Date')]
      },
    ]
  },
  {
    id: 'performance', label: 'Business Performance Reports', icon: BarChart3, permission: 'canViewPerformanceReport',
    items: [
      { id: 'performanceBranch', label: 'Branch Performance Report', apiFn: reportsApiV2.performanceBranch, renderType: 'table',
        columns: [textCol('branch', 'Branch'), numberCol('count', 'Sales'), currencyCol('revenue', 'Revenue'), currencyCol('discount', 'Discount'), currencyCol('avgSale', 'Avg Sale')]
      },
      { id: 'performanceProduct', label: 'Product Performance Report', apiFn: reportsApiV2.performanceProduct, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('quantity', 'Qty'), currencyCol('revenue', 'Revenue'), currencyCol('profit', 'Profit'), numberCol('transactions', 'Transactions')]
      },
      { id: 'performanceCategory', label: 'Category Performance Report', apiFn: reportsApiV2.performanceCategory, renderType: 'table',
        columns: [textCol('category', 'Category'), numberCol('quantity', 'Qty'), currencyCol('revenue', 'Revenue'), currencyCol('profit', 'Profit')]
      },
      { id: 'performanceUserActivity', label: 'User Activity Report', apiFn: reportsApiV2.performanceUserActivity, renderType: 'table',
        columns: [textCol('user', 'User'), numberCol('actions', 'Actions'), textCol('models', 'Models')]
      },
      { id: 'performanceTopProducts', label: 'Top Selling Products', apiFn: reportsApiV2.performanceTopProducts, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('quantity', 'Qty Sold'), currencyCol('revenue', 'Revenue'), currencyCol('profit', 'Profit')]
      },
      { id: 'performanceLeastProducts', label: 'Least Selling Products', apiFn: reportsApiV2.performanceLeastProducts, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('quantity', 'Qty Sold'), currencyCol('revenue', 'Revenue'), currencyCol('profit', 'Profit')]
      },
    ]
  },
]

const ALL_REPORTS = CATEGORIES.flatMap(c => c.items.map(i => ({ ...i, categoryId: c.id, categoryLabel: c.label })))

function formatValue(value: any, format?: string): string {
  if (value === null || value === undefined) return '—'
  switch (format) {
    case 'currency': return formatCurrency(Number(value) || 0)
    case 'number': return new Intl.NumberFormat('en-US').format(Number(value) || 0)
    case 'date': return value ? new Date(value).toLocaleDateString() : '—'
    default:
      if (typeof value === 'object') {
        // Extract name from nested objects like {id, name}, {name}, etc.
        if (value.name) return String(value.name)
        if (value.label) return String(value.label)
        if (value.email) return String(value.email)
        // Fallback: stringify first key's value
        const firstVal = Object.values(value)[0]
        return firstVal != null ? String(firstVal) : '—'
      }
      return String(value)
  }
}

function ReportTable({ data, columns }: { data: any[]; columns: ReportItem['columns'] }) {
  if (!data || data.length === 0) return <p className="text-center text-muted-foreground py-8">No data available for this report.</p>
  const rows = Array.isArray(data) ? data : [data]
  const cols = columns || Object.keys(rows[0]).map(k => ({ key: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), format: 'text' as const }))
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {cols.map(col => <th key={col.key} className="px-4 py-3 text-left font-medium text-muted-foreground">{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t hover:bg-muted/30">
              {cols.map(col => <td key={col.key} className="px-4 py-2">{formatValue(row[col.key], col.format)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCards({ data, keys }: { data: any; keys: ReportItem['summaryKeys'] }) {
  if (!data) return <p className="text-center text-muted-foreground py-8">No data available.</p>
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {keys?.map(k => (
        <Card key={k.key}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-2xl font-bold">{formatValue(data[k.key], k.format)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function PnLReport({ data }: { data: any }) {
  if (!data) return <p className="text-center text-muted-foreground py-8">No data available.</p>
  const rows = [
    { label: 'Revenue', value: data.revenue, bold: true },
    { label: 'Cost of Goods Sold (COGS)', value: -data.cogs },
    { label: 'Gross Profit', value: data.grossProfit, bold: true, highlight: true },
    { label: 'Operating Expenses', value: -data.expenses },
    { label: 'Net Profit', value: data.netProfit, bold: true, highlight: true },
  ]
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={cn('flex items-center justify-between rounded-lg p-3', r.bold ? 'bg-muted/50 font-bold' : '')}>
              <span>{r.label}</span>
              <span className={cn(r.highlight && r.value >= 0 ? 'text-green-600' : r.highlight && r.value < 0 ? 'text-red-600' : '')}>
                {formatCurrency(r.value || 0)}
              </span>
            </div>
          ))}
          <div className="flex justify-between rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
            <span>Additional Info</span>
          </div>
          <div className="flex justify-between p-3 text-sm"><span>Total Discount</span><span>{formatCurrency(data.totalDiscount || 0)}</span></div>
          <div className="flex justify-between p-3 text-sm"><span>Total Tax</span><span>{formatCurrency(data.totalTax || 0)}</span></div>
          <div className="flex justify-between p-3 text-sm"><span>Sales Count</span><span>{data.salesCount || 0}</span></div>
        </div>
      </CardContent>
    </Card>
  )
}

function BalanceSheetReport({ data }: { data: any }) {
  if (!data) return <p className="text-center text-muted-foreground py-8">No data available.</p>
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-base">Assets</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm"><span>Cash</span><span>{formatCurrency(data.assets?.cash || 0)}</span></div>
          <div className="flex justify-between text-sm"><span>Accounts Receivable</span><span>{formatCurrency(data.assets?.accountsReceivable || 0)}</span></div>
          <div className="flex justify-between text-sm"><span>Inventory</span><span>{formatCurrency(data.assets?.inventory || 0)}</span></div>
          <div className="flex justify-between border-t pt-2 font-bold"><span>Total Assets</span><span>{formatCurrency(data.assets?.totalAssets || 0)}</span></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Liabilities</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm"><span>Accounts Payable</span><span>{formatCurrency(data.liabilities?.accountsPayable || 0)}</span></div>
          <div className="flex justify-between border-t pt-2 font-bold"><span>Total Liabilities</span><span>{formatCurrency(data.liabilities?.totalLiabilities || 0)}</span></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Equity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm"><span>Retained Earnings</span><span>{formatCurrency(data.equity?.retainedEarnings || 0)}</span></div>
          <div className="flex justify-between border-t pt-2 font-bold"><span>Total Equity</span><span>{formatCurrency(data.equity?.totalEquity || 0)}</span></div>
        </CardContent>
      </Card>
    </div>
  )
}

function TrialBalanceReport({ data }: { data: any }) {
  if (!data?.accounts) return <p className="text-center text-muted-foreground py-8">No data available.</p>
  const totalDebit = data.accounts.reduce((a: number, x: any) => a + (x.debit || 0), 0)
  const totalCredit = data.accounts.reduce((a: number, x: any) => a + (x.credit || 0), 0)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr><th className="px-4 py-3 text-left font-medium">Account</th><th className="px-4 py-3 text-right font-medium">Debit</th><th className="px-4 py-3 text-right font-medium">Credit</th></tr>
        </thead>
        <tbody>
          {data.accounts.map((acc: any, i: number) => (
            <tr key={i} className="border-t hover:bg-muted/30">
              <td className="px-4 py-2">{acc.account}</td>
              <td className="px-4 py-2 text-right">{acc.debit ? formatCurrency(acc.debit) : '—'}</td>
              <td className="px-4 py-2 text-right">{acc.credit ? formatCurrency(acc.credit) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 font-bold">
          <tr><td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right">{formatCurrency(totalDebit)}</td><td className="px-4 py-3 text-right">{formatCurrency(totalCredit)}</td></tr>
        </tfoot>
      </table>
    </div>
  )
}

function AgingReport({ data }: { data: any }) {
  if (!data?.data) return <p className="text-center text-muted-foreground py-8">No data available.</p>
  const buckets = data.buckets || {}
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        {Object.entries(buckets).map(([k, v]) => (
          <Card key={k}><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{k === 'current' ? 'Current' : `${k} days`}</p>
            <p className="mt-1 font-bold">{formatCurrency(Number(v) || 0)}</p>
          </CardContent></Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-right font-medium">Total Balance</th>
              <th className="px-4 py-3 text-right font-medium">Current</th>
              <th className="px-4 py-3 text-right font-medium">1-30</th>
              <th className="px-4 py-3 text-right font-medium">31-60</th>
              <th className="px-4 py-3 text-right font-medium">61-90</th>
              <th className="px-4 py-3 text-right font-medium">90+</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row: any, i: number) => (
              <tr key={i} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2">{row.customer || row.supplier}</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(row.totalBalance || 0)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(row.aging?.current || 0)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(row.aging?.['1-30'] || 0)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(row.aging?.['31-60'] || 0)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(row.aging?.['61-90'] || 0)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(row.aging?.['90+'] || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams()
  const selectedReport = searchParams.get('report')
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { toast } = useToast()
  const { hasPermission } = useJWTAuth()

  const visibleCategories = useMemo(() => CATEGORIES.filter(c => hasPermission(c.permission)), [hasPermission])
  const ALL_VISIBLE_REPORTS = useMemo(() => visibleCategories.flatMap(c => c.items.map(i => ({ ...i, categoryId: c.id, categoryLabel: c.label }))), [visibleCategories])

  const currentReport = useMemo(() => ALL_VISIBLE_REPORTS.find(r => r.id === selectedReport), [selectedReport, ALL_VISIBLE_REPORTS])

  const loadReport = useCallback(async () => {
    if (!currentReport) return
    setLoading(true)
    setReportData(null)
    try {
      const params: ReportParams = {}
      if (from) params.from = from
      if (to) params.to = to
      const result = await currentReport.apiFn(params)
      setReportData(result)
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to load report', description: error.message })
    } finally {
      setLoading(false)
    }
  }, [currentReport, from, to, toast])

  useEffect(() => {
    if (currentReport) {
      loadReport()
    } else {
      setReportData(null)
    }
  }, [selectedReport])

  const canExport = hasPermission('canExportReport')

  const handlePrint = () => {
    printReport(
      reportData?.data || reportData,
      currentReport?.label || 'Report',
      currentReport?.categoryLabel || '',
      currentReport?.columns,
      reportData?.summary
    )
  }

  const handleExportExcel = () => {
    exportToExcel(
      reportData?.data || reportData,
      currentReport?.label || 'Report',
      currentReport?.columns,
      reportData?.summary
    )
  }

  const handleExportPDF = () => {
    exportToPDF(
      reportData?.data || reportData,
      currentReport?.label || 'Report',
      currentReport?.categoryLabel,
      currentReport?.columns,
      reportData?.summary
    )
  }

  return (
    <div>
      {!currentReport ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium">Select a report from the sidebar</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose from 48 report types across 8 categories</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header + filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{currentReport.label}</h1>
                <p className="text-sm text-muted-foreground">{currentReport.categoryLabel}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="from" className="text-xs">From</Label>
                  <Input id="from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-auto" />
                </div>
                <div>
                  <Label htmlFor="to" className="text-xs">To</Label>
                  <Input id="to" type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-auto" />
                </div>
                <Button onClick={loadReport} disabled={loading} size="sm">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                  Generate
                </Button>
                {canExport && (
                  <Button onClick={handleExportExcel} variant="outline" size="sm">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel
                  </Button>
                )}
                {canExport && (
                  <Button onClick={handleExportPDF} variant="outline" size="sm">
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                )}
                <Button onClick={handlePrint} variant="outline" size="sm">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>

            {/* Report content */}
            <Card>
              <CardContent className="p-4 lg:p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : reportData ? (
                  <div className="space-y-4">
                    {reportData.summary && (
                      <div className="flex flex-wrap gap-4 rounded-lg bg-muted/30 p-4">
                        {Object.entries(reportData.summary).map(([k, v]) => (
                          <div key={k}>
                            <p className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</p>
                            <p className="font-semibold">{typeof v === 'number' ? formatCurrency(v) : String(v)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {currentReport.renderType === 'table' && <ReportTable data={reportData.data || reportData} columns={currentReport.columns} />}
                    {currentReport.renderType === 'summary' && <SummaryCards data={reportData} keys={currentReport.summaryKeys} />}
                    {currentReport.renderType === 'pnL' && <PnLReport data={reportData} />}
                    {currentReport.renderType === 'balanceSheet' && <BalanceSheetReport data={reportData} />}
                    {currentReport.renderType === 'trialBalance' && <TrialBalanceReport data={reportData} />}
                    {currentReport.renderType === 'aging' && <AgingReport data={reportData} />}
                    {currentReport.renderType === 'ledger' && <ReportTable data={reportData.data || reportData} columns={currentReport.columns} />}
                    {reportData.note && <p className="text-xs text-muted-foreground italic">{reportData.note}</p>}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-3 text-sm text-muted-foreground">Click "Generate" to load the report</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
    </div>
  )
}
