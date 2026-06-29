import { Outlet, NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, LogOut, Menu, Users, ClipboardList, CreditCard, Building2, Wallet, GitBranch, ChevronDown, ChevronRight, DollarSign, FileText, BarChart3, Settings, Shield, Upload, Clock, Wrench, RotateCcw, Calculator, ArrowRightLeft, Bell, Plug, UtensilsCrossed, Sun, Moon } from 'lucide-react'
import { useState, useEffect, type ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { SyncIndicator } from '@/components/SyncIndicator'
import { NotificationBell } from '@/components/NotificationBell'
import { useFeatureAccess } from '@/services/featureAccessService'

const inventorySubItems = [
  { to: '/tenant/inventory', label: 'Products', icon: Package, permission: 'canViewProduct', feature: 'inventory.products' },
  { to: '/tenant/inventory?type=service', label: 'Services', icon: Wrench, permission: 'canViewService', feature: 'inventory.services' },
  { to: '/tenant/inventory?type=rental', label: 'Rental Items', icon: Clock, permission: 'canViewRental', feature: 'inventory.rentals' },
]

const navItems = [
  { to: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'canViewDashboard', feature: 'dashboard' },
  { to: '/tenant/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales', permission: 'canViewSale' },
  { to: '/tenant/inventory', label: 'Inventory', icon: Package, feature: 'inventory', permission: 'canViewProduct', isInventory: true },
  { to: '/tenant/receivables', label: 'Receivables', icon: CreditCard, feature: 'receivables', permission: 'canViewReceivable' },
  { to: '/tenant/payables', label: 'Payables', icon: Building2, feature: 'payables', permission: 'canViewPayable' },
  { to: '/tenant/expenses', label: 'Expenses', icon: Wallet, feature: 'expenses', permission: 'canViewExpense' },
  { to: '/tenant/rentals', label: 'Rental Bookings', icon: Clock, permission: 'canViewRental', feature: 'rentals' },
  { to: '/tenant/restaurant', label: 'Restaurant & Bar', icon: UtensilsCrossed, feature: 'restaurant', permission: 'canViewRestaurant' },
  { to: '/tenant/returns', label: 'Returns & Refunds', icon: RotateCcw, feature: 'sales.returns', permission: 'canRefundSale' },
  { to: '/tenant/accounting', label: 'Accounting', icon: Calculator, feature: 'accounting', permission: 'canViewFinancialReport' },
  { to: '/tenant/hr', label: 'HR Management', icon: Users, feature: 'hr', permission: 'canViewStaff' },
  { to: '/tenant/transfers', label: 'Branch Transfers', icon: ArrowRightLeft, feature: 'inventory.transfers', permission: 'canTransferStock' },
  { to: '/tenant/communication', label: 'Communication', icon: Bell, feature: 'communication', permission: 'canViewCommunication' },
  { to: '/tenant/integrations', label: 'Integrations', icon: Plug, feature: 'integrations', permission: 'canViewSettings' },
  { to: '/tenant/reports', label: 'Reports', icon: TrendingUp, feature: 'reports', permission: 'canViewSalesReport', isReports: true },
  { to: '/tenant/audit', label: 'Audit Log', icon: ClipboardList, feature: 'audit', permission: 'canViewAuditReport' },
  { to: '/tenant/settings', label: 'Business Settings', icon: Settings, permission: 'canViewSettings', feature: 'settings', isSettings: true },
]

interface ReportSubItem { id: string; label: string }
interface ReportCategoryDef { id: string; label: string; icon: ComponentType<{ className?: string }>; permission: string; feature?: string; items: ReportSubItem[] }

const reportCategories: ReportCategoryDef[] = [
  {
    id: 'sales', label: 'Sales Reports', icon: ShoppingCart, permission: 'canViewSalesReport', feature: 'reports.sales',
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
    id: 'inventory', label: 'Inventory Reports', icon: Package, permission: 'canViewInventoryReport', feature: 'reports.inventory',
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
    id: 'financial', label: 'Financial Reports', icon: DollarSign, permission: 'canViewFinancialReport', feature: 'reports.financial',
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
    id: 'customers', label: 'Customer Reports', icon: Users, permission: 'canViewCustomerReport', feature: 'reports.customers',
    items: [
      { id: 'customersList', label: 'Customer List Report' },
      { id: 'customersSales', label: 'Customer Sales Report' },
      { id: 'customersBalance', label: 'Customer Balance Report' },
      { id: 'customersReceivables', label: 'Customer Receivables Report' },
      { id: 'customersTop', label: 'Top Customers Report' },
    ],
  },
  {
    id: 'suppliers', label: 'Supplier Reports', icon: Building2, permission: 'canViewSupplierReport', feature: 'reports.suppliers',
    items: [
      { id: 'suppliersList', label: 'Supplier List Report' },
      { id: 'suppliersPurchases', label: 'Supplier Purchases Report' },
      { id: 'suppliersPayables', label: 'Supplier Payables Report' },
      { id: 'suppliersBalance', label: 'Supplier Balance Report' },
    ],
  },
  {
    id: 'receivables', label: 'Receivables Reports', icon: CreditCard, permission: 'canViewReceivablesReport', feature: 'reports.financial',
    items: [
      { id: 'receivablesOutstanding', label: 'Outstanding Invoices' },
      { id: 'receivablesAging', label: 'Customer Aging Report' },
      { id: 'receivablesCollection', label: 'Collection Report' },
      { id: 'receivablesOverdue', label: 'Overdue Accounts Report' },
    ],
  },
  {
    id: 'payables', label: 'Payables Reports', icon: FileText, permission: 'canViewPayablesReport', feature: 'reports.financial',
    items: [
      { id: 'payablesOutstanding', label: 'Outstanding Bills Report' },
      { id: 'payablesAging', label: 'Supplier Aging Report' },
      { id: 'payablesPaymentHistory', label: 'Payment History Report' },
      { id: 'payablesOverdue', label: 'Overdue Supplier Balances' },
    ],
  },
  {
    id: 'performance', label: 'Business Performance Reports', icon: BarChart3, permission: 'canViewPerformanceReport', feature: 'reports.performance',
    items: [
      { id: 'performanceBranch', label: 'Branch Performance Report' },
      { id: 'performanceProduct', label: 'Product Performance Report' },
      { id: 'performanceCategory', label: 'Category Performance Report' },
      { id: 'performanceUserActivity', label: 'User Activity Report' },
      { id: 'performanceTopProducts', label: 'Top Selling Products' },
      { id: 'performanceLeastProducts', label: 'Least Selling Products' },
    ],
  },
  {
    id: 'services', label: 'Service Reports', icon: Wrench, permission: 'canViewServiceReport', feature: 'reports.services',
    items: [
      { id: 'servicesSummary', label: 'Service Summary' },
      { id: 'servicesList', label: 'Service List' },
      { id: 'servicesSales', label: 'Service Sales Report' },
      { id: 'servicesByCategory', label: 'Service Sales by Category' },
      { id: 'servicesByBranch', label: 'Service Sales by Branch' },
      { id: 'servicesTop', label: 'Top Services' },
    ],
  },
  {
    id: 'rentals', label: 'Rental Reports', icon: Clock, permission: 'canViewRentalReport', feature: 'reports.rentals',
    items: [
      { id: 'rentalsSummary', label: 'Rental Summary' },
      { id: 'rentalsList', label: 'Rental List Report' },
      { id: 'rentalsByItem', label: 'Rental by Item' },
      { id: 'rentalsByCustomer', label: 'Rental by Customer' },
      { id: 'rentalsByBranch', label: 'Rental by Branch' },
      { id: 'rentalsActive', label: 'Active Rentals' },
      { id: 'rentalsOverdue', label: 'Overdue Rentals' },
      { id: 'rentalsReturns', label: 'Rental Returns Report' },
      { id: 'rentalsDaily', label: 'Daily Rental Report' },
      { id: 'rentalsMonthly', label: 'Monthly Rental Report' },
    ],
  },
]

const settingsSubItems = [
  { to: '/tenant/settings', label: 'Business Profile', icon: Building2, feature: 'settings', permission: 'canViewSettings' },
  { to: '/tenant/branches', label: 'Branches', icon: GitBranch, feature: 'multi_branch', permission: 'canViewBranch' },
  { to: '/tenant/tax', label: 'Tax Management', icon: DollarSign, feature: 'settings.taxes', permission: 'canViewTax' },
  { to: '/tenant/receipt-settings', label: 'Receipt Settings', icon: FileText, feature: 'settings', permission: 'canViewReceipt' },
  { to: '/tenant/roles', label: 'Roles & Permissions', icon: Shield, feature: 'settings.roles', permission: 'canViewStaff' },
]

export function TenantLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [reportsExpanded, setReportsExpanded] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [inventoryExpanded, setInventoryExpanded] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [searchParams] = useSearchParams()
  const activeReportId = searchParams.get('report')
  const { user, logout, hasPermission } = useJWTAuth()
  const { theme, toggleTheme } = useTheme()
  const { canAccessFeature, loading } = useFeatureAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); navigate('/login') }

  const toggleReports = () => {
    setReportsExpanded(prev => !prev)
    if (!reportsExpanded) { setSettingsExpanded(false); setInventoryExpanded(false) }
  }
  const toggleSettings = () => {
    setSettingsExpanded(prev => !prev)
    if (!settingsExpanded) { setReportsExpanded(false); setInventoryExpanded(false) }
  }
  const toggleInventory = () => {
    setInventoryExpanded(prev => !prev)
    if (!inventoryExpanded) { setReportsExpanded(false); setSettingsExpanded(false) }
  }

  // Auto-expand inventory when on an inventory page
  useEffect(() => {
    if (location.pathname === '/tenant/inventory') setInventoryExpanded(true)
  }, [location.pathname, location.search])
  const visibleNavItems = navItems.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false
    if (item.feature && !canAccessFeature(item.feature)) return false
    return true
  })
  const visibleInventorySubItems = inventorySubItems.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false
    if (item.feature && !canAccessFeature(item.feature)) return false
    return true
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
      {/* Full-height vertical sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-50 h-screen w-80 max-w-[88vw] transform bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] shadow-xl transition-transform duration-200 ease-in-out lg:w-64 lg:max-w-none lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          {/* Fixed logo + Dashboard */}
          <div className="border-b border-white/10 px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <img src="/img/jibusales_logo.png" alt="jibuSales" className="h-8 w-auto object-contain" />
            </div>
            {(() => { const dashItem = visibleNavItems.find(i => i.feature === 'dashboard') || navItems[0]; const DashIcon = dashItem.icon; return (
            <NavLink to={dashItem.to} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn('flex min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
              <DashIcon className="h-6 w-6 lg:h-5 lg:w-5" />{dashItem.label}
            </NavLink>
            ) })()}
          </div>
          {/* Scrollable nav items */}
          <nav className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5 lg:space-y-1 lg:p-4">
            {visibleNavItems.filter(i => i.feature !== 'dashboard').map((item) =>
              item.isInventory ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleInventory()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', inventoryExpanded || location.pathname === '/tenant/inventory' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {inventoryExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {inventoryExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {visibleInventorySubItems.map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => {
                            const fullPath = location.pathname + location.search
                            const isExact = fullPath === sub.to
                            return cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', isExact ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')
                          }}>
                          <sub.icon className="h-4 w-4" />{sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : item.isReports ? (
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
                      {reportCategories.filter(cat => hasPermission(cat.permission) && (!cat.feature || canAccessFeature(cat.feature))).map(cat => {
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
                                    className={cn('flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors', activeReportId === rpt.id ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}
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
                      {settingsSubItems.filter(sub => (!sub.permission || hasPermission(sub.permission)) && (!sub.feature || canAccessFeature(sub.feature))).map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                          <sub.icon className="h-4 w-4" />{sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => {
                    const fullPath = location.pathname + location.search
                    const isExact = fullPath === item.to || (isActive && !item.to.includes('?'))
                    return cn('flex min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', isExact ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')
                  }}>
                  <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />{item.label}
                </NavLink>
              )
            )}
            {loading && <div className="px-3 py-2 text-sm text-slate-500">Loading plan features...</div>}
          </nav>
        </div>
      </aside>
      {/* Content area: navbar starts after sidebar, then main content */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></Button>
          </div>
          <div className="flex-1" />
          <SyncIndicator />
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <NotificationBell />
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
