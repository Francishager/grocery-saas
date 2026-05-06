import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  Building2,
  Mail,
  ChevronDown,
  ChevronRight,
  Users,
  CreditCard,
  Wallet,
  DollarSign,
  FileText as FileTextIcon,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore, isSaaSAdmin } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { useFeatureAccess } from '@/services/featureAccessService'

// Regular business nav items
const businessNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Owner', 'Manager', 'Accountant', 'Attendant'], feature: 'pos' },
  { to: '/sales', label: 'Sales', icon: ShoppingCart, roles: ['Owner', 'Manager', 'Attendant'], feature: 'pos' },
  { to: '/inventory', label: 'Inventory', icon: Package, roles: ['Owner', 'Manager', 'Accountant'], feature: 'inventory' },
  { to: '/purchases', label: 'Purchases', icon: FileText, roles: ['Owner', 'Manager', 'Accountant'], feature: 'inventory' },
  { to: '/reports', label: 'Reports', icon: TrendingUp, roles: ['Owner', 'Accountant'], feature: 'reports' },
]

// SaaS Admin nav items with dropdowns
const saasAdminNavItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, feature: 'platform' },
  { 
    label: 'Tenants', 
    icon: Building2,
    feature: 'platform',
    children: [
      { to: '/admin/tenants', label: 'All Tenants', icon: Building2, feature: 'platform' },
      { to: '/admin/invitations', label: 'Invitations', icon: Mail, feature: 'platform' },
    ]
  },
  {
    label: 'Receivables',
    icon: CreditCard,
    feature: 'credit',
    children: [
      { to: '/receivables/customers', label: 'Customers', icon: Users, feature: 'customers' },
      { to: '/receivables/sales', label: 'Credit Sales', icon: ShoppingCart, feature: 'credit' },
      { to: '/receivables/payments', label: 'Payments', icon: DollarSign, feature: 'credit' },
    ]
  },
  {
    label: 'Payables',
    icon: Wallet,
    feature: 'suppliers',
    children: [
      { to: '/receivables/suppliers', label: 'Suppliers', icon: Building2, feature: 'suppliers' },
      { to: '/receivables/purchases', label: 'Purchases', icon: FileTextIcon, feature: 'suppliers' },
      { to: '/receivables/payments', label: 'Payments', icon: DollarSign, feature: 'suppliers' },
    ]
  },
  {
    label: 'Expenses',
    icon: FileTextIcon,
    feature: 'expenses',
    children: [
      { to: '/expenses/expenses', label: 'Expenses', icon: FileTextIcon, feature: 'expenses' },
      { to: '/expenses/accounts', label: 'Cash Accounts', icon: Wallet, feature: 'expenses' },
      { to: '/expenses/transactions', label: 'Transactions', icon: DollarSign, feature: 'cash_flow' },
    ]
  },
]

// Collapsible menu item component
function CollapsibleMenuItem({ item, sidebarOpen, onNavigate }: { 
  item: any
  sidebarOpen: boolean
  onNavigate: () => void 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const isActive = item.children?.some((child: any) => location.pathname === child.to)

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )
        }
      >
        <item.icon className="h-5 w-5" />
        {item.label}
      </NavLink>
    )
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <div className="flex items-center gap-3">
          <item.icon className="h-5 w-5" />
          {item.label}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isOpen && (
        <div className="ml-4 space-y-1 border-l pl-4">
          {item.children.map((child: any) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <child.icon className="h-4 w-4" />
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const { isFeatureEnabled, canAccessFeature } = useFeatureAccess()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Determine which nav items to show based on user role and features
  const isSaasAdmin = user && isSaaSAdmin(user)
  const navItems = isSaasAdmin ? saasAdminNavItems : businessNavItems

  // Filter nav items based on feature access and user role
  const filteredNavItems = navItems
    .map(item => {
      // Check if user can access this feature
      if (item.feature && !canAccessFeature(item.feature, user?.role)) {
        return null // Hide the item completely
      }
      
      // For dropdowns, filter children
      if (item.children) {
        const filteredChildren = item.children.filter(child => 
          !child.feature || canAccessFeature(child.feature, user?.role)
        )
        
        if (filteredChildren.length === 0) {
          return null // Hide parent if no children are accessible
        }
        
        return { ...item, children: filteredChildren }
      }
      
      return item
    })
    .filter(item => item !== null) // Remove null items

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-64 transform bg-card shadow-lg transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Package className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">Grocery SaaS</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {filteredNavItems.map((item, index) => (
              <CollapsibleMenuItem
                key={item.to || index}
                item={item}
                sidebarOpen={sidebarOpen}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                {user?.fname?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">
                  {user?.fname} {user?.lname}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.role}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            {user?.business_name && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                {user.business_name}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
