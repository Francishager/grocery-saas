import React from 'react'
import { cn } from '@/lib/utils'
import { Menu, Bell, Search, User, LogOut, Settings, HelpCircle } from 'lucide-react'
import { UkoAvatar } from '@/components/UkoAvatar'

export interface DashboardNavbarProps {
  /** Children content */
  children?: React.ReactNode
  /** User info */
  user?: {
    name: string
    email: string
    avatar?: string
    role?: string
  }
  /** On menu toggle (mobile) */
  onMenuToggle?: () => void
  /** Notification count */
  notificationCount?: number
  /** On notifications click */
  onNotificationsClick?: () => void
  /** On profile click */
  onProfileClick?: () => void
  /** On logout */
  onLogout?: () => void
  /** On settings click */
  onSettingsClick?: () => void
  /** Whether to show search */
  showSearch?: boolean
  /** Search placeholder */
  searchPlaceholder?: string
  /** On search */
  onSearch?: (query: string) => void
  /** Additional className */
  className?: string
  /** Whether fixed position */
  fixed?: boolean
}

export const DashboardNavbar: React.FC<DashboardNavbarProps> = ({
  children,
  user,
  onMenuToggle,
  notificationCount = 0,
  onNotificationsClick,
  onProfileClick,
  onLogout,
  onSettingsClick,
  showSearch = true,
  searchPlaceholder = 'Search...',
  onSearch,
  className,
  fixed = true,
}) => {
  const [showUserMenu, setShowUserMenu] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch?.(searchQuery)
  }

  return (
    <header
      className={cn(
        'bg-white border-b border-gray-200 z-30',
        fixed && 'sticky top-0',
        className
      )}
    >
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left section */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={onMenuToggle}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search */}
          {showSearch && (
            <form onSubmit={handleSearch} className="hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-64 lg:w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </form>
          )}

          {/* Custom content */}
          {children}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] text-xs font-medium text-white bg-red-500 rounded-full">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={onSettingsClick}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* Help */}
          <button
            type="button"
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <HelpCircle className="h-5 w-5" />
          </button>

          {/* User menu */}
          <div className="relative ml-2">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100"
            >
              <UkoAvatar
                src={user?.avatar}
                name={user?.name}
                size="sm"
              />
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            </button>

            {/* User dropdown menu */}
            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      onProfileClick?.()
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      onSettingsClick?.()
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <hr className="my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      onLogout?.()
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default DashboardNavbar
