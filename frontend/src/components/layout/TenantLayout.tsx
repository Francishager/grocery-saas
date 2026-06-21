import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, TrendingUp, LogOut, Menu, X, Users, ClipboardList, CreditCard, Building2, Wallet, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { useFeatureAccess } from '@/services/featureAccessService'

const navItems = [
  { to: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenant/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales', roles: ['owner', 'manager', 'attendant'] },
  { to: '/tenant/inventory', label: 'Inventory', icon: Package, feature: 'inventory', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/receivables', label: 'Receivables', icon: CreditCard, feature: 'credit', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/payables', label: 'Payables', icon: Building2, feature: 'suppliers', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/expenses', label: 'Expenses', icon: Wallet, feature: 'expenses', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/reports', label: 'Reports', icon: TrendingUp, feature: 'reports', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/audit', label: 'Audit Log', icon: ClipboardList, feature: 'audit', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/branches', label: 'Branches', icon: GitBranch, roles: ['owner'] },
  { to: '/tenant/staff', label: 'Staff', icon: Users, roles: ['owner'] },
]

export function TenantLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useJWTAuth()
  const { canAccessFeature, loading } = useFeatureAccess()
  const navigate = useNavigate()
  const handleLogout = () => { logout(); navigate('/login') }
  const visibleNavItems = navItems.filter((item) => {
    if (item.roles && user?.role && !item.roles.includes(user.role)) return false
    if (!item.feature) return true
    return canAccessFeature(item.feature)
  })

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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"><Package className="h-5 w-5 text-primary-foreground" /></div>
              <span className="text-lg font-bold text-white">jibuSales</span>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-200 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)}><X className="h-5 w-5" /></Button>
          </div>
          <nav className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5 lg:space-y-1 lg:p-4">
            {visibleNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn('flex min-h-12 items-center gap-4 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:min-h-0 lg:gap-3 lg:px-3 lg:py-2 lg:text-sm', isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
                <item.icon className="h-6 w-6 lg:h-5 lg:w-5" />{item.label}
              </NavLink>
            ))}
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm ring-offset-background transition hover:ring-2 hover:ring-ring hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="User profile"
            >
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </button>
            <div className="invisible absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-popover p-3 text-popover-foreground opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="mb-3 border-b pb-3">
                <p className="truncate text-sm font-semibold">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email || ''}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{user?.role || ''}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-10 w-full justify-start text-destructive hover:text-destructive" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
