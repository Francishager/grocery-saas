import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, FileText, TrendingUp, LogOut, Menu, X, Users, ClipboardList, CreditCard, Building2, Wallet, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { useFeatureAccess } from '@/services/featureAccessService'

const navItems = [
  { to: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenant/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales', roles: ['owner', 'manager', 'attendant'] },
  { to: '/tenant/inventory', label: 'Inventory', icon: Package, feature: 'inventory', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/purchases', label: 'Purchases', icon: FileText, feature: 'purchases', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/receivables', label: 'Receivables', icon: CreditCard, feature: 'credit', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/payables', label: 'Payables', icon: Building2, feature: 'suppliers', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/expenses', label: 'Expenses', icon: Wallet, feature: 'expenses', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/reports', label: 'Reports', icon: TrendingUp, feature: 'reports', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/audit', label: 'Audit Log', icon: ClipboardList, feature: 'audit', roles: ['owner', 'manager', 'accountant'] },
  { to: '/tenant/branches', label: 'Branches', icon: GitBranch, roles: ['owner'] },
  { to: '/tenant/admin', label: 'Staff', icon: Users, feature: 'staff', roles: ['owner', 'manager'] },
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
        'fixed left-0 top-0 z-50 h-full w-64 transform bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] shadow-xl transition-transform duration-200 ease-in-out lg:translate-x-0',
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
          <nav className="flex-1 space-y-1 p-4">
            {visibleNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
                <item.icon className="h-5 w-5" />{item.label}
              </NavLink>
            ))}
            {loading && <div className="px-3 py-2 text-xs text-slate-500">Loading plan features...</div>}
          </nav>
          <div className="border-t border-[hsl(var(--sidebar-border))] p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sky-100">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-white">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-slate-400">{user?.role || ''}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:bg-white/10 hover:text-white" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" />Logout</Button>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/95 px-4 shadow-sm backdrop-blur lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></Button>
          <div className="flex-1" />
        </header>
        <main className="p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
