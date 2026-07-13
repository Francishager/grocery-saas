import { Outlet, NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, LogOut, Menu, Users, ClipboardList, CreditCard, Building2, Wallet, GitBranch, ChevronDown, ChevronRight, DollarSign, FileText, BarChart3, Settings, Shield, Upload, Clock, Wrench, RotateCcw, Calculator, ArrowRightLeft, Bell, Plug, UtensilsCrossed, Sun, Moon, Gift, Fuel, Factory, Sprout, FileSpreadsheet, Gauge, Truck, TrendingUp as TrendingUpIcon, ClipboardList as ClipboardIcon, BadgeDollarSign, CreditCard as CardIcon, Droplet, ClipboardCheck, UserCog, Tags, Award, Leaf, ShoppingBag, Wrench as WrenchIcon, Receipt, CalendarClock } from 'lucide-react'
import { useState, useEffect, type ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { SyncIndicator } from '@/components/SyncIndicator'
import { NotificationBell } from '@/components/NotificationBell'
import { useFeatureAccess } from '@/services/featureAccessService'
import OnboardingGuideCard from '@/components/OnboardingGuideCard'
import OnboardingGuideModal from '@/components/OnboardingGuideModal'
import UserGuideMenu from '@/components/UserGuideMenu'

const inventorySubItems = [
  { to: '/tenant/inventory/products', label: 'Products', icon: Package, permission: 'canViewProduct', feature: 'inventory.products' },
  { to: '/tenant/inventory/services', label: 'Services', icon: Wrench, permission: 'canViewService', feature: 'inventory.services' },
  { to: '/tenant/inventory/rentals', label: 'Rental Items', icon: Clock, permission: 'canViewRental', feature: 'inventory.rentals' },
  { to: '/tenant/inventory/lubricants', label: 'Lubricants & Dry Stock', icon: Droplet, permission: 'canViewProduct', feature: 'fuel_station.lubricants' },
  { to: '/tenant/inventory/convenience', label: 'Convenience Shop', icon: ShoppingBag, permission: 'canViewProduct', feature: 'fuel_station.convenience' },
]

const fuelStationSubItems = [
  { to: '/tenant/fuel-station/tanks', label: 'Tanks & Pumps', icon: Gauge, permission: 'canViewFuelStation', feature: 'fuel_station.tanks' },
  { to: '/tenant/fuel-station/deliveries', label: 'Fuel Deliveries', icon: Truck, permission: 'canViewFuelStation', feature: 'fuel_station.deliveries' },
  { to: '/tenant/fuel-station/meter_readings', label: 'Meter Readings', icon: TrendingUpIcon, permission: 'canViewFuelStation', feature: 'fuel_station.meter_readings' },
  { to: '/tenant/fuel-station/dipstick', label: 'Dipstick Readings', icon: Droplet, permission: 'canViewFuelStation', feature: 'fuel_station.dipstick' },
  { to: '/tenant/fuel-station/shifts', label: 'Shift Reports', icon: ClipboardIcon, permission: 'canViewFuelStation', feature: 'fuel_station.shift_reports' },
  { to: '/tenant/fuel-station/pricing', label: 'Price Management', icon: Tags, permission: 'canViewFuelStation', feature: 'fuel_station.pricing' },
  { to: '/tenant/fuel-station/compliance', label: 'Compliance', icon: ClipboardCheck, permission: 'canViewFuelStation', feature: 'fuel_station.compliance' },
]

const receivablesSubItems = [
  { to: '/tenant/receivables/customers', label: 'Customers', icon: CreditCard, permission: 'canViewReceivable', feature: 'receivables' },
  { to: '/tenant/receivables/sales', label: 'Credit Sales', icon: Receipt, permission: 'canViewReceivable', feature: 'receivables' },
  { to: '/tenant/receivables/payments', label: 'Payments', icon: DollarSign, permission: 'canViewReceivable', feature: 'receivables' },
  { to: '/tenant/receivables/fuel-cards', label: 'Fuel Cards', icon: CardIcon, permission: 'canViewReceivable', feature: 'fuel_station.fuel_cards' },
  { to: '/tenant/receivables/credit-accounts', label: 'Credit Accounts', icon: BadgeDollarSign, permission: 'canViewReceivable', feature: 'fuel_station.credit_accounts' },
]

const serviceSubItems = [
  { to: '/tenant/service/appointments', label: 'Appointments', icon: CalendarClock, permission: 'canViewServiceBusiness', feature: 'service' },
  { to: '/tenant/service/work-orders', label: 'Work Orders', icon: ClipboardList, permission: 'canViewServiceBusiness', feature: 'service' },
  { to: '/tenant/service/contracts', label: 'Contracts', icon: FileText, permission: 'canViewServiceBusiness', feature: 'service' },
  { to: '/tenant/service/car-wash', label: 'Car Wash', icon: Droplet, permission: 'canViewServiceBusiness', feature: 'fuel_station.car_wash' },
  { to: '/tenant/service/garage', label: 'Garage Services', icon: WrenchIcon, permission: 'canViewServiceBusiness', feature: 'fuel_station.garage' },
]

const navItems = [
  { to: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'canViewDashboard', feature: 'dashboard' },
  { to: '/tenant/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales', permission: 'canViewSale' },
  { to: '/tenant/inventory', label: 'Inventory', icon: Package, feature: 'inventory', permission: 'canViewProduct', isInventory: true },
  { to: '/tenant/receivables', label: 'Receivables', icon: CreditCard, feature: 'receivables', permission: 'canViewReceivable', isReceivables: true },
  { to: '/tenant/payables', label: 'Payables', icon: Building2, feature: 'payables', permission: 'canViewPayable' },
  { to: '/tenant/rentals', label: 'Rental Bookings', icon: Clock, permission: 'canViewRental', feature: 'rentals' },
  { to: '/tenant/restaurant', label: 'Restaurant & Bar', icon: UtensilsCrossed, feature: 'restaurant', permission: 'canViewRestaurant' },
  { to: '/tenant/fuel-station', label: 'Fuel Station', icon: Fuel, feature: 'fuel_station', permission: 'canViewFuelStation', isFuelStation: true },
  { to: '/tenant/manufacturing', label: 'Manufacturing', icon: Factory, feature: 'manufacturing', permission: 'canViewManufacturing' },
  { to: '/tenant/agriculture', label: 'Agriculture', icon: Sprout, feature: 'agriculture', permission: 'canViewAgriculture' },
  { to: '/tenant/service', label: 'Service Business', icon: Wrench, feature: 'service', permission: 'canViewServiceBusiness', isService: true },
  { to: '/tenant/returns', label: 'Returns & Refunds', icon: RotateCcw, feature: 'sales.returns', permission: 'canRefundSale' },
  { to: '/tenant/accounting', label: 'Accounting', icon: Calculator, feature: 'accounting', permission: 'canViewFinancialReport', isAccounting: true },
  { to: '/tenant/hr', label: 'HR Management', icon: Users, feature: 'hr', permission: 'canViewStaff' },
  { to: '/tenant/communication', label: 'Communication', icon: Bell, feature: 'communication', permission: 'canViewCommunication' },
  { to: '/tenant/integrations', label: 'Integrations', icon: Plug, feature: 'integrations', permission: 'canViewSettings' },
  { to: '/tenant/reports', label: 'Reports', icon: TrendingUp, feature: 'reports', permission: 'canViewSalesReport', isReports: true },
  { to: '/tenant/audit', label: 'Audit Log', icon: ClipboardList, feature: 'audit', permission: 'canViewAuditReport' },
  { to: '/tenant/settings', label: 'Business Settings', icon: Settings, permission: 'canViewSettings', feature: 'settings', isSettings: true },
  { to: '/tenant/data-importer', label: 'Data Importer', icon: FileSpreadsheet, permission: 'canImportInventory', feature: 'developer.data_importer' },
  { to: '/tenant/referrals', label: 'Refer & Earn', icon: Gift, permission: 'canViewSettings', feature: null },
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
  {
    id: 'fuel', label: 'Fuel Station Reports', icon: Fuel, permission: 'canViewFuelStationReport', feature: 'fuel_station.reports',
    items: [
      { id: 'fuelSalesSummary', label: 'Fuel Sales Summary' },
      { id: 'fuelByPump', label: 'Sales by Pump' },
      { id: 'fuelByTank', label: 'Tank Stock Report' },
      { id: 'fuelDeliveries', label: 'Fuel Deliveries Report' },
      { id: 'fuelShiftSummary', label: 'Shift Summary Report' },
      { id: 'fuelLubricantSales', label: 'Lubricant Sales Report' },
      { id: 'fuelCarWash', label: 'Car Wash Income Report' },
      { id: 'fuelMeterReadings', label: 'Meter Readings Report' },
    ],
  },
  {
    id: 'manufacturing', label: 'Manufacturing Reports', icon: Factory, permission: 'canViewManufacturingReport', feature: 'manufacturing.reports',
    items: [
      { id: 'mfgProductionSummary', label: 'Production Summary' },
      { id: 'mfgByProduct', label: 'Production by Product' },
      { id: 'mfgWasteReport', label: 'Waste Report' },
      { id: 'mfgCostAnalysis', label: 'Production Cost Analysis' },
      { id: 'mfgBOMReport', label: 'BOM / Recipe Report' },
    ],
  },
  {
    id: 'agriculture', label: 'Agriculture Reports', icon: Sprout, permission: 'canViewAgricultureReport', feature: 'agriculture.reports',
    items: [
      { id: 'agriHarvestSummary', label: 'Harvest Summary' },
      { id: 'agriByField', label: 'Harvest by Field' },
      { id: 'agriByLivestock', label: 'Production by Livestock' },
      { id: 'agriExpenseReport', label: 'Farm Expense Report' },
      { id: 'agriYieldReport', label: 'Yield per Acre Report' },
    ],
  },
  {
    id: 'service', label: 'Service Business Reports', icon: Wrench, permission: 'canViewServiceBusinessReport', feature: 'service.reports',
    items: [
      { id: 'svcAppointmentSummary', label: 'Appointment Summary' },
      { id: 'svcByTechnician', label: 'Jobs by Technician' },
      { id: 'svcByStatus', label: 'Work Orders by Status' },
      { id: 'svcRevenueReport', label: 'Service Revenue Report' },
      { id: 'svcContractReport', label: 'Active Contracts Report' },
    ],
  },
]

const accountingSubItems = [
  { to: '/tenant/accounting', label: 'Accounting', icon: Calculator, feature: 'accounting', permission: ['canViewAccounting', 'canViewExpense', 'canCreateExpense', 'canViewFinancialReport'] },
  { to: '/tenant/accounting/transactions', label: 'Transaction Accounts', icon: Wallet, feature: 'accounting', permission: ['canViewAccounting', 'canViewFinancialReport'] },
  { to: '/tenant/transfers', label: 'Branch Transfers', icon: ArrowRightLeft, feature: 'inventory.transfers', permission: 'canTransferStock' },
  { to: '/tenant/accounting/staff-till', label: 'Staff Till Sheet', icon: Users, feature: 'accounting', permission: ['canViewAccounting', 'canViewStaffTillSheet'] },
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
  const [accountingExpanded, setAccountingExpanded] = useState(false)
  const [fuelStationExpanded, setFuelStationExpanded] = useState(false)
  const [receivablesExpanded, setReceivablesExpanded] = useState(false)
  const [serviceExpanded, setServiceExpanded] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [searchParams] = useSearchParams()
  const activeReportId = searchParams.get('report')
  const { user, logout, hasPermission, hasCompletedOnboarding, refreshOnboardingStatus, tokens } = useJWTAuth()
  const onboardingStorageKey = user?.id ? `jibu_sales_onboarding_seen_${user.id}` : 'jibu_sales_onboarding_seen_guest'
  const { theme, toggleTheme } = useTheme()
  const { canAccessFeature, loading } = useFeatureAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); navigate('/login') }

  const toggleReports = () => {
    setReportsExpanded(prev => !prev)
    if (!reportsExpanded) { setSettingsExpanded(false); setInventoryExpanded(false); setAccountingExpanded(false); setFuelStationExpanded(false); setReceivablesExpanded(false); setServiceExpanded(false) }
  }
  const toggleSettings = () => {
    setSettingsExpanded(prev => !prev)
    if (!settingsExpanded) { setReportsExpanded(false); setInventoryExpanded(false); setAccountingExpanded(false); setFuelStationExpanded(false); setReceivablesExpanded(false); setServiceExpanded(false) }
  }
  const toggleInventory = () => {
    setInventoryExpanded(prev => !prev)
    if (!inventoryExpanded) { setReportsExpanded(false); setSettingsExpanded(false); setAccountingExpanded(false); setFuelStationExpanded(false); setReceivablesExpanded(false); setServiceExpanded(false) }
  }
  const toggleAccounting = () => {
    setAccountingExpanded(prev => !prev)
    if (!accountingExpanded) { setReportsExpanded(false); setSettingsExpanded(false); setInventoryExpanded(false); setFuelStationExpanded(false); setReceivablesExpanded(false); setServiceExpanded(false) }
  }
  const toggleFuelStation = () => {
    setFuelStationExpanded(prev => !prev)
    if (!fuelStationExpanded) { setReportsExpanded(false); setSettingsExpanded(false); setInventoryExpanded(false); setAccountingExpanded(false); setReceivablesExpanded(false); setServiceExpanded(false) }
  }
  const toggleReceivables = () => {
    setReceivablesExpanded(prev => !prev)
    if (!receivablesExpanded) { setReportsExpanded(false); setSettingsExpanded(false); setInventoryExpanded(false); setAccountingExpanded(false); setFuelStationExpanded(false); setServiceExpanded(false) }
  }
  const toggleService = () => {
    setServiceExpanded(prev => !prev)
    if (!serviceExpanded) { setReportsExpanded(false); setSettingsExpanded(false); setInventoryExpanded(false); setAccountingExpanded(false); setFuelStationExpanded(false); setReceivablesExpanded(false) }
  }

  // Auto-expand inventory when on an inventory page
  useEffect(() => {
    if (location.pathname.startsWith('/tenant/inventory')) setInventoryExpanded(true)
    if (location.pathname.startsWith('/tenant/accounting') || location.pathname === '/tenant/transfers') setAccountingExpanded(true)
    if (location.pathname.startsWith('/tenant/fuel-station')) setFuelStationExpanded(true)
    if (location.pathname.startsWith('/tenant/receivables')) setReceivablesExpanded(true)
    if (location.pathname.startsWith('/tenant/service')) setServiceExpanded(true)
  }, [location.pathname, location.search])
  function hasRequiredPermission(permission?: string | string[]) {
    if (!permission) return true
    const permissions = Array.isArray(permission) ? permission : [permission]
    return permissions.some((perm) => hasPermission(perm))
  }

  function subItemVisible(item: { feature?: string | null; permission?: string | string[] }) {
    if (item.feature && !canAccessFeature(item.feature)) return false
    if (item.permission && !hasRequiredPermission(item.permission)) return false
    return true
  }
  const visibleInventorySubItems = inventorySubItems.filter(subItemVisible)
  const visibleAccountingSubItems = accountingSubItems.filter(subItemVisible)
  const visibleFuelStationSubItems = fuelStationSubItems.filter((item) => {
    const parentEnabled = canAccessFeature('fuel_station')
    const subEnabled = item.feature ? canAccessFeature(item.feature) : false
    if (!parentEnabled && !subEnabled) return false
    if (item.permission && !hasPermission(item.permission)) return false
    return true
  })
  const visibleReceivablesSubItems = receivablesSubItems.filter(subItemVisible)
  const visibleServiceSubItems = serviceSubItems.filter((item) => {
    const parentEnabled = canAccessFeature('service')
    const subEnabled = item.feature ? canAccessFeature(item.feature) : false
    if (!parentEnabled && !subEnabled) return false
    if (item.permission && !hasPermission(item.permission)) return false
    return true
  })
  const visibleSettingsSubItems = settingsSubItems.filter(subItemVisible)
  const visibleReportCategories = reportCategories.filter((cat) => {
    if (cat.feature && !canAccessFeature(cat.feature)) return false
    if (cat.permission && !hasPermission(cat.permission)) return false
    return true
  })
  const visibleNavItems = navItems.filter((item) => {
    // Special handling for Communication: only show if the exact 'communication' feature is enabled
    // (not when only sub-features like 'communication.notifications' are enabled)
    if (item.feature === 'communication') {
      return canAccessFeature('communication') && hasRequiredPermission(item.permission)
    }

    if (item.feature && !canAccessFeature(item.feature)) {
      // For parent items with sub-items, show if any sub-item is visible
      // even when the parent's own feature is not enabled (e.g. Accounting
      // parent has feature 'accounting' but Expenses sub-item has 'expenses')
      if (item.isAccounting && visibleAccountingSubItems.length > 0) return true
      if (item.isInventory && visibleInventorySubItems.length > 0) return true
      if (item.isFuelStation && visibleFuelStationSubItems.length > 0) return true
      if (item.isReceivables && visibleReceivablesSubItems.length > 0) return true
      if (item.isService && visibleServiceSubItems.length > 0) return true
      if (item.isSettings && visibleSettingsSubItems.length > 0) return true
      if (item.isReports && visibleReportCategories.length > 0) return true
      // For standalone items like Communication with no sub-items, hide strictly.
      // Communication should only appear when the 'communication' feature itself is enabled,
      // not when only child features like 'communication.notifications' are enabled.
      return false
    }
    if (item.permission && !hasRequiredPermission(item.permission)) {
      // For parent items with sub-items, show if any sub-item is visible
      if (item.isAccounting && visibleAccountingSubItems.length > 0) return true
      if (item.isInventory && visibleInventorySubItems.length > 0) return true
      if (item.isFuelStation && visibleFuelStationSubItems.length > 0) return true
      if (item.isReceivables && visibleReceivablesSubItems.length > 0) return true
      if (item.isService && visibleServiceSubItems.length > 0) return true
      if (item.isSettings && visibleSettingsSubItems.length > 0) return true
      if (item.isReports && visibleReportCategories.length > 0) return true
      // For standalone items with no sub-items, hide strictly
      return false
    }
    return true
  })

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => {
      if (prev.has(catId)) return new Set()
      return new Set([catId])
    })
  }

  const completeOnboarding = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'https://grocery-saas-production-e339.up.railway.app'
      await fetch(`${apiBase}/api/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens?.accessToken || ''}`,
        },
      })
    } catch {
      // Ignore and still update local UI state
    }

    setOnboardingCompleted(true)
    setShowOnboardingModal(false)
    await refreshOnboardingStatus()
  }

  const dismissOnboarding = () => {
    setShowOnboardingModal(false)
  }

  useEffect(() => {
    setOnboardingCompleted(hasCompletedOnboarding)
  }, [hasCompletedOnboarding])

  useEffect(() => {
    if (user?.id) {
      refreshOnboardingStatus()
    }
  }, [user?.id, refreshOnboardingStatus])

  useEffect(() => {
    if (!user?.id) return

    // Show guide on every login/reload until the user completes it via the backend
    if (onboardingCompleted) {
      setShowOnboardingModal(false)
      return
    }

    const timer = window.setTimeout(() => {
      setShowOnboardingModal(true)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [user?.id, onboardingCompleted])

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
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', inventoryExpanded || location.pathname.startsWith('/tenant/inventory') ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {inventoryExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {inventoryExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {visibleInventorySubItems.map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                          <sub.icon className="h-4 w-4" />{sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : item.isAccounting ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleAccounting()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', accountingExpanded || location.pathname.startsWith('/tenant/accounting') || location.pathname === '/tenant/transfers' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {accountingExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {accountingExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {visibleAccountingSubItems.map(sub => (
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
              ) : item.isFuelStation ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleFuelStation()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', fuelStationExpanded || location.pathname.startsWith('/tenant/fuel-station') ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {fuelStationExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {fuelStationExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {visibleFuelStationSubItems.map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                          <sub.icon className="h-4 w-4" />{sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : item.isReceivables ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleReceivables()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', receivablesExpanded || location.pathname.startsWith('/tenant/receivables') ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {receivablesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {receivablesExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {visibleReceivablesSubItems.map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                          <sub.icon className="h-4 w-4" />{sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : item.isService ? (
                <div key={item.to}>
                  <button
                    onClick={() => toggleService()}
                    className={cn('flex w-full min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', serviceExpanded || location.pathname.startsWith('/tenant/service') ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}
                  >
                    <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {serviceExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {serviceExpanded && (
                    <div className="ml-4 border-l border-white/10 pl-2 mt-1 space-y-1">
                      {visibleServiceSubItems.map(sub => (
                        <NavLink key={sub.to} to={sub.to} onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-primary/20 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
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
                      {visibleReportCategories.map(cat => {
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
                      {visibleSettingsSubItems.map(sub => (
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
            <OnboardingGuideCard
              hasCompleted={onboardingCompleted}
              onStatusChange={completeOnboarding}
            />
            <UserGuideMenu />
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
        <main className="overflow-x-hidden p-4 lg:p-6"><Outlet /></main>
      </div>
      <OnboardingGuideModal
        isOpen={showOnboardingModal}
        onClose={dismissOnboarding}
        onComplete={completeOnboarding}
      />
    </div>
  )
}
