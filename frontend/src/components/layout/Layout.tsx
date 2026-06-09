import { Outlet, NavLink, useNavigate } from 'react-router-dom'
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
  Building2,
  Mail,
  Users,
  CreditCard,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'

const businessNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'accountant', 'attendant'], feature: 'pos' },
  { to: '/sales', label: 'Sales', icon: ShoppingCart, roles: ['owner', 'manager', 'attendant'], feature: 'pos' },
  { to: '/inventory', label: 'Inventory', icon: Package, roles: ['owner', 'manager', 'accountant'], feature: 'inventory' },
  { to: '/purchases', label: 'Purchases', icon: FileText, roles: ['owner', 'manager', 'accountant'], feature: 'inventory' },
  { to: '/reports', label: 'Reports', icon: TrendingUp, roles: ['owner', 'accountant'], feature: 'reports' },
]

const saasAdminNavItems = [
  { to: '/saas/dashboard', label: 'Dashboard', icon: LayoutDashboard, feature: 'platform' },
  { to: '/saas/businesses', label: 'Businesses', icon: Building2, feature: 'platform' },
  { to: '/saas/provision', label: 'Provision', icon: Building2, feature: 'platform' },
  { to: '/saas/plans', label: 'Plans & Pricing', icon: CreditCard, feature: 'platform' },
  { to: '/saas/features', label: 'Features', icon: Settings, feature: 'platform' },
  { to: '/saas/invitations', label: 'Invitations', icon: Mail, feature: 'platform' },
  { to: '/saas/owners', label: 'Owners', icon: Users, feature: 'platform' },
  { to: '/saas/subscriptions', label: 'Subscriptions', icon: Wallet, feature: 'platform' },
]

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout, isPlatformUser } = useJWTAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  const isSaasAdmin = isPlatformUser()
  const navItems = isSaasAdmin ? saasAdminNavItems : businessNavItems

  return (
    <div className="min-h-screen bg-muted/30">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        'fixed left-0 top-0 z-50 h-full w-64 transform bg-card shadow-lg transition-transform duration-200 ease-in-out lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Package className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">jibuSales</span>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
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
            ))}
          </nav>

          <div className="border-t p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.role || ''}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />Logout
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            {user?.business_name && (
              <span className="hidden text-sm text-muted-foreground sm:block">{user.business_name}</span>
            )}
          </div>
        </header>
        <main className="p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
