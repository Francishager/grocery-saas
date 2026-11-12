import React from 'react'
import { cn } from '@/lib/utils'
import { Menu, X } from 'lucide-react'
import { DashboardNavbar } from './DashboardNavbar'
import { MenuList } from './MenuList'

export interface DashboardLayoutProps {
  /** Children content */
  children: React.ReactNode
  /** Sidebar menu items */
  menuItems?: any[]
  /** User info */
  user?: {
    name: string
    email: string
    avatar?: string
    role?: string
  }
  /** Whether sidebar is collapsible */
  collapsible?: boolean
  /** Default sidebar collapsed state */
  defaultCollapsed?: boolean
  /** Sidebar width */
  sidebarWidth?: number
  /** Header content */
  headerContent?: React.ReactNode
  /** Footer content */
  footerContent?: React.ReactNode
  /** Additional className */
  className?: string
  /** Sidebar className */
  sidebarClassName?: string
  /** Main content className */
  mainClassName?: string
  /** Logo */
  logo?: React.ReactNode
  /** On logout */
  onLogout?: () => void
  /** Notification count */
  notificationCount?: number
  /** On notifications click */
  onNotificationsClick?: () => void
  /** On profile click */
  onProfileClick?: () => void
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  menuItems = [],
  user,
  collapsible = true,
  defaultCollapsed = false,
  sidebarWidth = 260,
  headerContent,
  footerContent,
  className,
  sidebarClassName,
  mainClassName,
  logo,
  onLogout,
  notificationCount,
  onNotificationsClick,
  onProfileClick,
}) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(!defaultCollapsed)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen(!mobileSidebarOpen)
  }

  return (
    <div className={cn('min-h-screen bg-gray-50', className)}>
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={toggleMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-white border-r border-gray-200 transition-all duration-300',
          'lg:translate-x-0',
          sidebarOpen ? 'w-64' : 'w-20',
          !mobileSidebarOpen && '-translate-x-full lg:translate-x-0',
          sidebarClassName
        )}
        style={{ width: sidebarOpen ? sidebarWidth : 80 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          {logo && (
            <div className={cn('transition-opacity', !sidebarOpen && 'opacity-0')}>
              {logo}
            </div>
          )}
          
          {collapsible && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:flex p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              {sidebarOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          <MenuList
            items={menuItems}
            collapsed={!sidebarOpen}
            onItemClick={() => setMobileSidebarOpen(false)}
          />
        </nav>
      </aside>

      {/* Main content area */}
      <div
        className="transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? sidebarWidth : 80 }}
      >
        {/* Navbar */}
        <DashboardNavbar
          user={user}
          onMenuToggle={toggleMobileSidebar}
          notificationCount={notificationCount}
          onNotificationsClick={onNotificationsClick}
          onProfileClick={onProfileClick}
          onLogout={onLogout}
        >
          {headerContent}
        </DashboardNavbar>

        {/* Main content */}
        <main className={cn('p-6', mainClassName)}>
          {children}
        </main>

        {/* Footer */}
        {footerContent && (
          <footer className="px-6 py-4 border-t border-gray-200 bg-white">
            {footerContent}
          </footer>
        )}
      </div>
    </div>
  )
}

export default DashboardLayout
