import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Building2, CreditCard, Settings, Mail, Users, Wallet, LogOut, Menu, Shield, Activity } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { SyncIndicator } from '@/components/SyncIndicator'

const navItems = [
  { to: '/saas/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/saas/businesses', label: 'Businesses', icon: Building2 },
  { to: '/saas/plans', label: 'Plans & Pricing', icon: CreditCard },
  { to: '/saas/features', label: 'Features', icon: Settings },
  { to: '/saas/subscriptions', label: 'Subscriptions', icon: Wallet },
  { to: '/saas/owners', label: 'Owners', icon: Users },
  { to: '/saas/invitations', label: 'Invitations', icon: Mail },
  { to: '/saas/audit', label: 'Audit Logs', icon: Activity },
]

export function SaaSAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useJWTAuth()
  const navigate = useNavigate()
  const handleLogout = () => { logout(); navigate('/saas/login') }

  return (
    <div className="min-h-screen bg-slate-950">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      {/* Full-height vertical sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-50 h-screen w-64 transform bg-slate-900 shadow-lg transition-transform duration-200 ease-in-out lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col text-white">
          {/* Fixed logo + Dashboard */}
          <div className="border-b border-slate-800 px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600"><Shield className="h-5 w-5 text-white" /></div>
              <span className="text-lg font-bold text-white">jibuSales</span>
              <span className="text-[10px] bg-blue-600 px-1.5 py-0.5 rounded font-medium text-white">ADMIN</span>
            </div>
            {(() => { const DashIcon = navItems[0].icon; return (
            <NavLink to={navItems[0].to} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
              <DashIcon className="h-5 w-5" />{navItems[0].label}
            </NavLink>
            ) })()}
          </div>
          {/* Scrollable nav items */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.slice(1).map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
                <item.icon className="h-5 w-5" />{item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      {/* Content area: navbar starts after sidebar, then main content */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-slate-800" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></Button>
          </div>
          <div className="flex-1" />
          <SyncIndicator />
          <div className="group relative">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-sm ring-offset-background transition hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 overflow-hidden"
              aria-label="Admin profile"
            >
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </button>
            <div className="invisible absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-900 p-3 text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="mb-3 border-b border-slate-700 pb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
                  {user?.name?.[0]?.toUpperCase() || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold">{user?.name || 'Admin'}</p>
                  <p className="truncate text-xs text-slate-400">{user?.email || ''}</p>
                  <p className="text-xs text-slate-400">Platform Admin</p>
                </div>
              </div>
              <div className="border-t border-slate-700 pt-2">
                <Button variant="ghost" size="sm" className="h-9 w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800" onClick={handleLogout}>
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
