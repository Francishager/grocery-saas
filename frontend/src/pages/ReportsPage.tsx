import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ShoppingCart, Package, DollarSign, Users, Building2,
  CreditCard, BarChart3, Calendar, Loader2,
  FileText, Printer, Download, FileSpreadsheet, ChevronDown, Wrench, Clock, WifiOff, Fuel, Factory
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { reportsApiV2, type ReportParams } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { exportToExcel, exportToPDF, printReport } from '@/lib/exportUtils'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalReportData } from '@/db/hybrid'

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
  feature?: string
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
  {
    id: 'services', label: 'Service Reports', icon: Wrench, permission: 'canViewServiceReport',
    items: [
      { id: 'servicesSummary', label: 'Service Summary', apiFn: reportsApiV2.servicesSummary, renderType: 'summary',
        summaryKeys: [
          { key: 'count', label: 'Total Services', format: 'number' },
          { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
          { key: 'totalQuantity', label: 'Total Quantity Sold', format: 'number' },
          { key: 'avgPrice', label: 'Average Price', format: 'currency' },
          { key: 'salesCount', label: 'Sales Count', format: 'number' },
        ]
      },
      { id: 'servicesList', label: 'Service List', apiFn: reportsApiV2.servicesList, renderType: 'table',
        columns: [textCol('name', 'Service'), textCol('category', 'Category'), currencyCol('price', 'Price'), numberCol('estimatedHours', 'Est. Hours'), textCol('branch', 'Branch')]
      },
      { id: 'servicesSales', label: 'Service Sales Report', apiFn: reportsApiV2.servicesSales, renderType: 'table',
        columns: [textCol('service', 'Service'), textCol('category', 'Category'), textCol('receiptNo', 'Receipt'), textCol('customer', 'Customer'), numberCol('quantity', 'Qty'), currencyCol('total', 'Total'), dateCol('date', 'Date')]
      },
      { id: 'servicesByCategory', label: 'Service Sales by Category', apiFn: reportsApiV2.servicesByCategory, renderType: 'table',
        columns: [textCol('category', 'Category'), numberCol('count', 'Sales Count'), numberCol('quantity', 'Qty Sold'), currencyCol('revenue', 'Revenue')]
      },
      { id: 'servicesByBranch', label: 'Service Sales by Branch', apiFn: reportsApiV2.servicesByBranch, renderType: 'table',
        columns: [textCol('branch', 'Branch'), numberCol('count', 'Sales Count'), currencyCol('revenue', 'Revenue')]
      },
      { id: 'servicesTop', label: 'Top Services', apiFn: reportsApiV2.servicesTop, renderType: 'table',
        columns: [textCol('service', 'Service'), numberCol('quantity', 'Qty Sold'), currencyCol('revenue', 'Revenue')]
      },
    ]
  },
  {
    id: 'rentals', label: 'Rental Reports', icon: Clock, permission: 'canViewRentalReport',
    items: [
      { id: 'rentalsSummary', label: 'Rental Summary', apiFn: reportsApiV2.rentalsSummary, renderType: 'summary',
        summaryKeys: [
          { key: 'count', label: 'Total Rentals', format: 'number' },
          { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
          { key: 'totalDeposit', label: 'Total Deposits', format: 'currency' },
          { key: 'totalPaid', label: 'Total Paid', format: 'currency' },
          { key: 'totalBalance', label: 'Outstanding Balance', format: 'currency' },
          { key: 'activeCount', label: 'Active Rentals', format: 'number' },
          { key: 'returnedCount', label: 'Returned', format: 'number' },
          { key: 'cancelledCount', label: 'Cancelled', format: 'number' },
        ]
      },
      { id: 'rentalsList', label: 'Rental List Report', apiFn: reportsApiV2.rentalsList, renderType: 'table',
        columns: [textCol('rentalNo', 'Rental No'), textCol('customer', 'Customer'), textCol('phone', 'Phone'), textCol('branch', 'Branch'), dateCol('hireDate', 'Hire Date'), dateCol('expectedReturnDate', 'Expected Return'), textCol('status', 'Status'), currencyCol('totalAmount', 'Total'), currencyCol('balance', 'Balance')]
      },
      { id: 'rentalsByItem', label: 'Rental by Item', apiFn: reportsApiV2.rentalsByItem, renderType: 'table',
        columns: [textCol('item', 'Item'), numberCol('hireCount', 'Hire Count'), currencyCol('totalRevenue', 'Revenue'), currencyCol('totalDeposit', 'Deposits')]
      },
      { id: 'rentalsByCustomer', label: 'Rental by Customer', apiFn: reportsApiV2.rentalsByCustomer, renderType: 'table',
        columns: [textCol('customer', 'Customer'), numberCol('count', 'Rentals'), currencyCol('totalRevenue', 'Revenue'), currencyCol('totalDeposit', 'Deposits'), currencyCol('balance', 'Balance')]
      },
      { id: 'rentalsByBranch', label: 'Rental by Branch', apiFn: reportsApiV2.rentalsByBranch, renderType: 'table',
        columns: [textCol('branch', 'Branch'), numberCol('count', 'Rentals'), currencyCol('revenue', 'Revenue'), currencyCol('deposit', 'Deposits')]
      },
      { id: 'rentalsActive', label: 'Active Rentals', apiFn: reportsApiV2.rentalsActive, renderType: 'table',
        columns: [textCol('rentalNo', 'Rental No'), textCol('customer', 'Customer'), textCol('phone', 'Phone'), dateCol('hireDate', 'Hire Date'), dateCol('expectedReturnDate', 'Expected Return'), numberCol('daysOverdue', 'Days Overdue'), currencyCol('totalAmount', 'Total'), currencyCol('balance', 'Balance')]
      },
      { id: 'rentalsOverdue', label: 'Overdue Rentals', apiFn: reportsApiV2.rentalsOverdue, renderType: 'table',
        columns: [textCol('rentalNo', 'Rental No'), textCol('customer', 'Customer'), textCol('phone', 'Phone'), dateCol('expectedReturnDate', 'Expected Return'), numberCol('daysOverdue', 'Days Overdue'), currencyCol('totalAmount', 'Total'), currencyCol('balance', 'Balance')]
      },
      { id: 'rentalsReturns', label: 'Rental Returns Report', apiFn: reportsApiV2.rentalsReturns, renderType: 'table',
        columns: [textCol('rentalNo', 'Rental No'), textCol('customer', 'Customer'), dateCol('hireDate', 'Hire Date'), dateCol('actualReturnDate', 'Return Date'), currencyCol('totalAmount', 'Total'), textCol('depositStatus', 'Deposit Status'), currencyCol('damageFees', 'Damage Fees')]
      },
      { id: 'rentalsDaily', label: 'Daily Rental Report', apiFn: reportsApiV2.rentalsDaily, renderType: 'table',
        columns: [dateCol('date', 'Date'), numberCol('count', 'Rentals'), currencyCol('revenue', 'Revenue'), currencyCol('deposit', 'Deposits')]
      },
      { id: 'rentalsMonthly', label: 'Monthly Rental Report', apiFn: reportsApiV2.rentalsMonthly, renderType: 'table',
        columns: [textCol('month', 'Month'), numberCol('count', 'Rentals'), currencyCol('revenue', 'Revenue'), currencyCol('deposit', 'Deposits')]
      },
    ]
  },
  {
    id: 'fuel', label: 'Fuel Station Reports', icon: Fuel, permission: 'canViewFuelStationReport', feature: 'fuel_station.reports',
    items: [
      { id: 'fuelSalesSummary', label: 'Fuel Sales Summary', apiFn: reportsApiV2.fuelSalesSummary, renderType: 'summary',
        summaryKeys: [
          { key: 'shiftCount', label: 'Total Shifts', format: 'number' },
          { key: 'totalLitres', label: 'Total Litres Sold', format: 'number' },
          { key: 'cashSales', label: 'Cash Sales', format: 'currency' },
          { key: 'mobileSales', label: 'Mobile Sales', format: 'currency' },
          { key: 'creditSales', label: 'Credit Sales', format: 'currency' },
          { key: 'totalSales', label: 'Total Fuel Sales', format: 'currency' },
          { key: 'lubricantSales', label: 'Lubricant Sales', format: 'currency' },
          { key: 'carWashIncome', label: 'Car Wash Income', format: 'currency' },
          { key: 'expenses', label: 'Expenses', format: 'currency' },
          { key: 'netAmount', label: 'Net Amount', format: 'currency' },
        ]
      },
      { id: 'fuelByPump', label: 'Sales by Pump', apiFn: reportsApiV2.fuelSalesByPump, renderType: 'table',
        columns: [textCol('pump', 'Pump'), numberCol('litresSold', 'Litres Sold'), currencyCol('amount', 'Amount'), numberCol('readings', 'Readings')]
      },
      { id: 'fuelByTank', label: 'Tank Stock Report', apiFn: reportsApiV2.fuelTankStock, renderType: 'table',
        columns: [textCol('tank', 'Tank'), textCol('fuelType', 'Fuel Type'), numberCol('capacity', 'Capacity (L)'), numberCol('currentStock', 'Current Stock (L)'), currencyCol('unitCost', 'Unit Cost'), currencyCol('stockValue', 'Stock Value'), numberCol('fillPercent', 'Fill %')]
      },
      { id: 'fuelDeliveries', label: 'Fuel Deliveries Report', apiFn: reportsApiV2.fuelDeliveries, renderType: 'table',
        columns: [textCol('tank', 'Tank'), textCol('fuelType', 'Fuel Type'), textCol('supplierName', 'Supplier'), textCol('invoiceNo', 'Invoice No'), numberCol('litres', 'Litres'), currencyCol('unitCost', 'Unit Cost'), currencyCol('totalCost', 'Total Cost'), dateCol('deliveryDate', 'Delivery Date')]
      },
      { id: 'fuelShiftSummary', label: 'Shift Summary Report', apiFn: reportsApiV2.fuelShiftSummary, renderType: 'table',
        columns: [textCol('shiftNo', 'Shift No'), textCol('pump', 'Pump'), textCol('attendant', 'Attendant'), numberCol('litresSold', 'Litres'), currencyCol('cashSales', 'Cash'), currencyCol('mobileSales', 'Mobile'), currencyCol('creditSales', 'Credit'), currencyCol('totalSales', 'Total'), currencyCol('expenses', 'Expenses'), currencyCol('netAmount', 'Net'), textCol('status', 'Status'), dateCol('startDate', 'Start Date')]
      },
      { id: 'fuelLubricantSales', label: 'Lubricant Sales Report', apiFn: reportsApiV2.fuelLubricantSales, renderType: 'table',
        columns: [textCol('shiftNo', 'Shift No'), textCol('pump', 'Pump'), textCol('attendant', 'Attendant'), currencyCol('lubricantSales', 'Lubricant Sales'), dateCol('startDate', 'Date')]
      },
      { id: 'fuelCarWash', label: 'Car Wash Income Report', apiFn: reportsApiV2.fuelCarWashIncome, renderType: 'table',
        columns: [textCol('shiftNo', 'Shift No'), textCol('pump', 'Pump'), textCol('attendant', 'Attendant'), currencyCol('carWashIncome', 'Car Wash Income'), dateCol('startDate', 'Date')]
      },
      { id: 'fuelMeterReadings', label: 'Meter Readings Report', apiFn: reportsApiV2.fuelMeterReadings, renderType: 'table',
        columns: [textCol('pump', 'Pump'), numberCol('openingReading', 'Opening'), numberCol('closingReading', 'Closing'), numberCol('litresSold', 'Litres Sold'), currencyCol('amount', 'Amount'), dateCol('readingDate', 'Date')]
      },
    ]
  },
  {
    id: 'manufacturing', label: 'Manufacturing Reports', icon: Factory, permission: 'canViewManufacturingReport', feature: 'manufacturing.reports',
    items: [
      { id: 'mfgProductionSummary', label: 'Production Summary', apiFn: reportsApiV2.manufacturingSummary, renderType: 'summary',
        summaryKeys: [
          { key: 'count', label: 'Production Orders', format: 'number' },
          { key: 'completedCount', label: 'Completed', format: 'number' },
          { key: 'totalQuantity', label: 'Units Planned', format: 'number' },
          { key: 'totalCost', label: 'Total Cost', format: 'currency' },
          { key: 'wasteQty', label: 'Waste Qty', format: 'number' },
          { key: 'recipeCount', label: 'Recipes', format: 'number' },
        ]
      },
      { id: 'mfgByProduct', label: 'Production by Product', apiFn: reportsApiV2.manufacturingByProduct, renderType: 'table',
        columns: [textCol('product', 'Product'), numberCol('orders', 'Orders'), numberCol('quantity', 'Qty'), currencyCol('totalCost', 'Total Cost'), numberCol('completed', 'Completed')]
      },
      { id: 'mfgWasteReport', label: 'Waste Report', apiFn: reportsApiV2.manufacturingWaste, renderType: 'table',
        columns: [textCol('orderNo', 'Order'), textCol('product', 'Product'), numberCol('quantity', 'Qty'), currencyCol('totalCost', 'Cost'), textCol('reason', 'Reason')]
      },
      { id: 'mfgCostAnalysis', label: 'Production Cost Analysis', apiFn: reportsApiV2.manufacturingCostAnalysis, renderType: 'table',
        columns: [textCol('orderNo', 'Order'), textCol('product', 'Product'), numberCol('quantity', 'Qty'), currencyCol('totalCost', 'Cost'), numberCol('wasteQty', 'Waste Qty'), currencyCol('wasteCost', 'Waste Cost')]
      },
      { id: 'mfgBOMReport', label: 'BOM / Recipe Report', apiFn: reportsApiV2.manufacturingBom, renderType: 'table',
        columns: [textCol('name', 'Recipe'), textCol('product', 'Product'), textCol('yield', 'Yield'), numberCol('ingredientCount', 'Ingredients'), numberCol('ingredientCost', 'Ingredient Qty')]
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

function AdvancedSalesSummary({ data }: { data: any }) {
  if (!data) return <p className="text-center text-muted-foreground py-8">No data available.</p>

  const trendData = Array.isArray(data.trend) && data.trend.length > 0
    ? data.trend
    : [
        { label: 'Sales', value: Number(data.totalRevenue || 0) },
      ]

  const performance = [
    { name: 'Revenue', value: Number(data.totalRevenue || 0) },
    { name: 'Discount', value: Number(data.totalDiscount || 0) },
    { name: 'Tax', value: Number(data.totalTax || 0) },
  ]

  return (
    <div className="space-y-4">
      <SummaryCards data={data} keys={[
        { key: 'count', label: 'Total Sales', format: 'number' },
        { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
        { key: 'totalSubtotal', label: 'Subtotal', format: 'currency' },
        { key: 'totalDiscount', label: 'Total Discount', format: 'currency' },
        { key: 'totalTax', label: 'Total Tax', format: 'currency' },
        { key: 'avgSale', label: 'Average Sale', format: 'currency' },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
                <Area type="monotone" dataKey="value" stroke="#2563eb" fill="url(#revenueFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue Mix</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={performance} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  <Cell fill="#2563eb" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#10b981" />
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AdvancedFastMoving({ data }: { data: any }) {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
  if (!rows.length) return <p className="text-center text-muted-foreground py-8">No data available.</p>

  const topProducts = rows.slice(0, 8)
  const chartData = topProducts.map((row: any) => ({ name: row.product, quantity: Number(row.quantity || 0), revenue: Number(row.revenue || 0) }))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Top Movers</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={70} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => formatNumber(Number(value) || 0)} />
                <Bar dataKey="quantity" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue Leaders</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topProducts.map((row: any, idx: number) => (
              <div key={row.product || idx} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{row.product}</span>
                  <span className="text-sm text-muted-foreground">{Number(row.quantity || 0)} sold</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (Number(row.revenue || 0) / Math.max(...topProducts.map((x: any) => Number(x.revenue || 0))) || 0) * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm font-semibold">{formatCurrency(Number(row.revenue || 0))}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <ReportTable data={rows} columns={[
        { key: 'product', label: 'Product', format: 'text' },
        { key: 'quantity', label: 'Qty Sold', format: 'number' },
        { key: 'revenue', label: 'Revenue', format: 'currency' },
      ]} />
    </div>
  )
}

function AdvancedBranchPerformance({ data }: { data: any }) {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
  if (!rows.length) return <p className="text-center text-muted-foreground py-8">No data available.</p>

  const chartData = rows.map((row: any) => ({ name: row.branch, revenue: Number(row.revenue || 0), sales: Number(row.count || 0), avgSale: Number(row.avgSale || 0) }))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Branch Revenue</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={70} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
                <Bar dataKey="revenue" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Sales vs Avg Sale</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={70} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="avgSale" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <ReportTable data={rows} columns={[
        { key: 'branch', label: 'Branch', format: 'text' },
        { key: 'count', label: 'Sales', format: 'number' },
        { key: 'revenue', label: 'Revenue', format: 'currency' },
        { key: 'discount', label: 'Discount', format: 'currency' },
        { key: 'avgSale', label: 'Avg Sale', format: 'currency' },
      ]} />
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0)
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
  const { hasPermission, user } = useJWTAuth()
  const { canAccessFeature } = useFeatureAccess()
  const online = useOnlineStatus()
  const isOwner = user?.role === 'owner'

  const visibleCategories = useMemo(() => CATEGORIES.filter(c => (isOwner || hasPermission(c.permission)) && (!c.feature || canAccessFeature(c.feature))), [hasPermission, isOwner, canAccessFeature])
  const ALL_VISIBLE_REPORTS = useMemo(() => visibleCategories.flatMap(c => c.items.map(i => ({ ...i, categoryId: c.id, categoryLabel: c.label }))), [visibleCategories])

  const currentReport = useMemo(() => ALL_VISIBLE_REPORTS.find(r => r.id === selectedReport), [selectedReport, ALL_VISIBLE_REPORTS])

  const loadReport = useCallback(async () => {
    if (!currentReport) return
    setLoading(true)
    setReportData(null)
    try {
      if (online) {
        const params: ReportParams = {}
        if (from) params.from = from
        if (to) params.to = to
        const result = await currentReport.apiFn(params)
        setReportData(result)
      } else {
        // Offline — generate from local IndexedDB data
        const params: any = {}
        if (from) params.from = from
        if (to) params.to = to
        const result = await getLocalReportData(currentReport.id, params)
        setReportData(result)
      }
    } catch (error: any) {
      // API failed — try offline
      try {
        const result = await getLocalReportData(currentReport.id, { from, to })
        setReportData(result)
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load report', description: error.message })
      }
    } finally {
      setLoading(false)
    }
  }, [currentReport, from, to, toast, online])

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
            <p className="mt-1 text-sm text-muted-foreground">Choose from 64 report types across 10 categories</p>
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
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                      <Download className="h-4 w-4" />
                      Export
                      <ChevronDown className="h-3 w-3 ml-0.5" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className="min-w-[140px] bg-popover text-popover-foreground rounded-md border shadow-md z-50 p-1" sideOffset={4}>
                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer hover:bg-accent rounded-sm" onSelect={handleExportExcel}>
                          <FileSpreadsheet className="h-4 w-4" />
                          Excel
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer hover:bg-accent rounded-sm" onSelect={handleExportPDF}>
                          <Download className="h-4 w-4" />
                          PDF
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
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
                    {currentReport.renderType === 'summary' && (
                      <>
                        {currentReport.id === 'salesSummary' ? (
                          <AdvancedSalesSummary data={reportData} />
                        ) : currentReport.id === 'inventoryFastMoving' ? (
                          <AdvancedFastMoving data={reportData} />
                        ) : currentReport.id === 'performanceBranch' ? (
                          <AdvancedBranchPerformance data={reportData} />
                        ) : (
                          <SummaryCards data={reportData} keys={currentReport.summaryKeys} />
                        )}
                      </>
                    )}
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
