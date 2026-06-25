import { Outlet, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, LogOut, Menu, X, Users, ClipboardList, CreditCard, Building2, Wallet, GitBranch, ChevronDown, ChevronRight, DollarSign, FileText, BarChart3, Settings, Shield, Upload } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { useFeatureAccess } from '@/services/featureAccessService'

const navItems = [
  { to: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'canViewDashboard' },
  { to: '/tenant/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales', permission: 'canViewSale' },
  { to: '/tenant/inventory', label: 'Inventory', icon: Package, feature: 'inventory', permission: 'canViewProduct' },
  { to: '/tenant/receivables', label: 'Receivables', icon: CreditCard, feature: 'credit', permission: 'canViewReceivable' },
  { to: '/tenant/payables', label: 'Payables', icon: Building2, feature: 'suppliers', permission: 'canViewPayable' },
  { to: '/tenant/expenses', label: 'Expenses', icon: Wallet, feature: 'expenses', permission: 'canViewExpense' },
  { to: '/tenant/reports', label: 'Reports', icon: TrendingUp, feature: 'reports', permission: 'canViewSalesReport', isReports: true },
  { to: '/tenant/audit', label: 'Audit Log', icon: ClipboardList, feature: 'audit', permission: 'canViewAuditReport' },
  { to: '/tenant/settings', label: 'Business Settings', icon: Settings, permission: 'canViewSettings', isSettings: true },
]

interface ReportSubItem { id: string; label: string }
interface ReportCategoryDef { id: string; label: string; icon: ComponentType<{ className?: string }>; permission: string; items: ReportSubItem[] }

const reportCategories: ReportCategoryDef[] = [
  {
    id: 'sales', label: 'Sales Reports', icon: ShoppingCart, permission: 'canViewSalesReport',
    items: [
      { id: 'salesSummary', label: 'Sales Summary' },
      { id: 'salesDaily', label: 'Daily Sales Report' },
      { id: 'salesWeekly', label: 'Weekly Sales Report' },
      { id: 'salesMonthly', label: 'Monthly Sales Report' },
      { id: 'salesByProduct', label: 'Sales by Product' },
      { id: 'salesByCategory', label: 'Sales by Category' },
      { id: 'salesByCustomer', label: 'Sales by Customer' },
      { id: 'salesByUser', label: 'Sales by User/Cashier' },
      { id: 'salesByBranch', label: 'Sales by Branch' },
      { id: 'salesDiscounts', label: 'Discount Report' },
      { id: 'salesReturns', label: 'Returns & Refunds Report' },
    ],
  },
  {
    id: 'inventory', label: 'Inventory Reports', icon: Package, permission: 'canViewInventoryReport',
    items: [
      { id: 'inventoryStock', label: 'Current Stock Report' },
      { id: 'inventoryValuation', label: 'Stock Valuation Report' },
      { id: 'inventoryLowStock', label: 'Low Stock Report' },
      { id: 'inventoryOutOfStock', label: 'Out of Stock Report' },
      { id: 'inventoryStockMovement', label: 'Stock Movement Report' },
      { id: 'inventoryAdjustments', label: 'Inventory Adjustment Report' },
      { id: 'inventoryExpiry', label: 'Expiry Report' },
      { id: 'inventoryDamaged', label: 'Damaged/Lost Stock Report' },
      { id: 'inventoryFastMoving', label: 'Fast Moving Products' },
      { id: 'inventorySlowMoving', label: 'Slow Moving Products' },
    ],
  },
  {
    id: 'financial', label: 'Financial Reports', icon: DollarSign, permission: 'canViewFinancialReport',
    items: [
      { id: 'financialProfitLoss', label: 'Profit & Loss Report' },
      { id: 'financialIncome', label: 'Income Report' },
      { id: 'financialExpense', label: 'Expense Report' },
      { id: 'financialCashFlow', label: 'Cash Flow Report' },
      { id: 'financialTrialBalance', label: 'Trial Balance' },
      { id: 'financialBalanceSheet', label: 'Balance Sheet' },
      { id: 'financialGeneralLedger', label: 'General Ledger' },
      { id: 'financialBankTransactions', label: 'Bank Transactions Report' },
      { id: 'financialTax', label: 'Tax Report (VAT, GST)' },
    ],
  },
  {
    id: 'customers', label: 'Customer Reports', icon: Users, permission: 'canViewCustomerReport',
    items: [
      { id: 'customersList', label: 'Customer List Report' },
      { id: 'customersSales', label: 'Customer Sales Report' },
      { id: 'customersBalance', label: 'Customer Balance Report' },
      { id: 'customersReceivables', label: 'Customer Receivables Report' },
      { id: 'customersTop', label: 'Top Customers Report' },
    ],
  },
  {
    id: 'suppliers', label: 'Supplier Reports', icon: Building2, permission: 'canViewSupplierReport',
    items: [
      { id: 'suppliersList', label: 'Supplier List Report' },
      { id: 'suppliersPurchases', label: 'Supplier Purchases Report' },
      { id: 'suppliersPayables', label: 'Supplier Payables Report' },
      { id: 'suppliersBalance', label: 'Supplier Balance Report' },
    ],
  },
  {
    id: 'receivables', label: 'Receivables Reports', icon: CreditCard, permission: 'canViewReceivablesReport',
    items: [
      { id: 'receivablesOutstanding', label: 'Outstanding Invoices' },
      { id: 'receivablesAging', label: 'Customer Aging Report' },
      { id: 'receivablesCollection', label: 'Collection Report' },
      { id: 'receivablesOverdue', label: 'Overdue Accounts Report' },
    ],
  },
  {
    id: 'payables', label: 'Payables Reports', icon: FileText, permission: 'canViewPayablesReport',
    items: [
      { id: 'payablesOutstanding', label: 'Outstanding Bills Report' },
      { id: 'payablesAging', label: 'Supplier Aging Report' },
      { id: 'payablesPaymentHistory', label: 'Payment History Report' },
      { id: 'payablesOverdue', label: 'Overdue Supplier Balances' },
    ],
  },
  {
    id: 'performance', label: 'Business Performance Reports', icon: BarChart3, permission: 'canViewPerformanceReport',
    items: [
      { id: 'performanceBranch', label: 'Branch Performance Report' },
      { id: 'performanceProduct', label: 'Product Performance Report' },
      { id: 'performanceCategory', label: 'Category Performance Report' },
      { id: 'performanceUserActivity', label: 'User Activity Report' },
      { id: 'performanceTopProducts', label: 'Top Selling Products' },
      { id: 'performanceLeastProducts', label: 'Least Selling Products' },
    ],
  },
]

const settingsSubItems = [
  { to: '/tenant/settings', label: 'Business Profile', icon: Building2 },
  { to: '/tenant/branches', label: 'Branches', icon: GitBranch },
  { to: '/tenant/tax', label: 'Tax Management', icon: DollarSign },
  { to: '/tenant/receipt-settings', label: 'Receipt Settings', icon: FileText },
  { to: '/tenant/roles', label: 'Roles & Permissions', icon: Shield },
]

export function TenantLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [reportsExpanded, setReportsExpanded] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [searchParams] = useSearchParams()
  const activeReportId = searchParams.get('report')
  const { user, logout, hasPermission } = useJWTAuth()
  const { canAccessFeature, loading } = useFeatureAccess()
  const navigate = useNavigate()
  const handleLogout = () => { logout(); navigate('/login') }

  const toggleReports = () => {
    setReportsExpanded(prev => !prev)
    if (!reportsExpanded) setSettingsExpanded(false)
  }
  const toggleSettings = () => {
    setSettingsExpanded(prev => !prev)
    if (!settingsExpanded) setReportsExpanded(false)
  }
  const visibleNavItems = navItems.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false
    if (!item.feature) return true
    return canAccessFeature(item.feature)
  })

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => {
      if (prev.has(catId)) return new Set()
      return new Set([catId])
    })
  }

  const selectReport = (reportId: string) => {
    navigate(`/tenant/reports?report=${reportId}`)
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={cn(
        'fixed left-0 top-0 z-50 h-full w-80 max-w-[88vw] transform bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] shadow-xl transition-transform duration-200 ease-in-out lg:w-64 lg:max-w-none lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-[hsl(var(--sidebar-border))] px-4">
            <div className="flex items-center gap-2">
              <img src="/img/jibusales_logo.png" alt="jibuSales" className="h-8 w-auto object-contain" />
            </div>
            <Button variant="ghost" size="icon" className="text-slate-200 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></Button>
          </div>
          <nav className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5 lg:space-y-1 lg:p-4">
            {visibleNavItems.map((item) =>
              item.isReports ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleReports()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', reportsExpanded || activeReportId ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {reportsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {reportsExpanded && (
                    <div className="mt-1 space-y-1">
                      {reportCategories.filter(cat => hasPermission(cat.permission)).map(cat => {
                        const catExpanded = expandedCats.has(cat.id)
                        return (
                          <div key={cat.id}>
                            <button
                              onClick={() => toggleCat(cat.id)}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
                            >
                              <cat.icon className="h-4 w-4" />
                              <span className="flex-1 text-left">{cat.label}</span>
                              {catExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            {catExpanded && (
                              <div className="ml-4 border-l border-white/10 pl-2">
                                {cat.items.map(rpt => (
                                  <button
                                    key={rpt.id}
                                    onClick={() => selectReport(rpt.id)}
                                    className={cn('flex w-full items-center rounded-md px-3 py-1.5 text-left text-xs transition-colors', activeReportId === rpt.id ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
                                  >
                                    {rpt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : item.isSettings ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleSettings()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', settingsExpanded ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {settingsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {settingsExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {settingsSubItems.map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors', isActive ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                          <sub.icon className="h-3.5 w-3.5" />{sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => cn('flex min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
                  <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />{item.label}
                </NavLink>
              )
            )}
            {loading && <div className="px-3 py-2 text-xs text-slate-500">Loading plan features...</div>}
          </nav>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="flex-1" />
          <div className="group relative">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm ring-offset-background transition hover:ring-2 hover:ring-ring hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 overflow-hidden"
              aria-label="User profile"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'
              )}
            </button>
            <div className="invisible absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-popover p-3 text-popover-foreground opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="mb-3 border-b pb-3 flex items-center gap-3">
                {user?.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold">{user?.name || 'User'}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email || ''}</p>
                  <p className="text-xs capitalize text-muted-foreground">{user?.role || ''}</p>
                </div>
              </div>
              <div className="space-y-1 mb-2">
                <Button variant="ghost" size="sm" className="h-9 w-full justify-start" onClick={() => navigate('/tenant/profile')}>
                  <Users className="mr-2 h-4 w-4" />
                  My Profile
                </Button>
              </div>
              <div className="border-t pt-2">
                <Button variant="ghost" size="sm" className="h-9 w-full justify-start text-destructive hover:text-destructive" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
