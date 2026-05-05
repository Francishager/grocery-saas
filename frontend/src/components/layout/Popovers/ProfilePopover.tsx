import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { User, Settings, LogOut, HelpCircle, Moon, Sun } from 'lucide-react'
import { createPortal } from 'react-dom'
import { UkoAvatar } from '@/components/UkoAvatar'

export interface ProfilePopoverProps {
  /** User info */
  user?: {
    name: string
    email: string
    avatar?: string
    role?: string
  }
  /** Callback when profile is clicked */
  onProfileClick?: () => void
  /** Callback when settings is clicked */
  onSettingsClick?: () => void
  /** Callback when logout is clicked */
  onLogoutClick?: () => void
  /** Callback when help is clicked */
  onHelpClick?: () => void
  /** Whether to show theme toggle */
  showThemeToggle?: boolean
  /** Current theme */
  theme?: 'light' | 'dark'
  /** Callback when theme is toggled */
  onThemeToggle?: () => void
  /** Additional className */
  className?: string
  /** Trigger element */
  trigger?: React.ReactNode
  /** Menu items */
  menuItems?: Array<{
    label: string
    icon?: React.ReactNode
    onClick?: () => void
    divider?: boolean
  }>
}

export const ProfilePopover: React.FC<ProfilePopoverProps> = ({
  user,
  onProfileClick,
  onSettingsClick,
  onLogoutClick,
  onHelpClick,
  showThemeToggle = true,
  theme = 'light',
  onThemeToggle,
  className,
  trigger,
  menuItems,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleToggle = () => setIsOpen(!isOpen)
  const handleClose = () => setIsOpen(false)

  const defaultMenuItems = [
    {
      label: 'Profile',
      icon: <User className="h-4 w-4" />,
      onClick: onProfileClick,
    },
    {
      label: 'Settings',
      icon: <Settings className="h-4 w-4" />,
      onClick: onSettingsClick,
    },
    {
      label: 'Help & Support',
      icon: <HelpCircle className="h-4 w-4" />,
      onClick: onHelpClick,
    },
  ]

  const items = menuItems || defaultMenuItems

  const popoverContent = isOpen && (
    <div
      ref={popoverRef}
      className={cn(
        'fixed right-4 top-14 z-50 w-64 bg-white rounded-lg shadow-xl border border-gray-200',
        className
      )}
    >
      {/* User info header */}
      {user && (
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <UkoAvatar src={user.avatar} name={user.name} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
              {user.role && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">
                  {user.role}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Menu items */}
      <div className="py-2">
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            {item.divider && <hr className="my-2 border-gray-200" />}
            <button
              type="button"
              onClick={() => {
                item.onClick?.()
                handleClose()
              }}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.icon}
              {item.label}
            </button>
          </React.Fragment>
        ))}

        {/* Theme toggle */}
        {showThemeToggle && (
          <button
            type="button"
            onClick={() => {
              onThemeToggle?.()
            }}
            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        )}
      </div>

      {/* Logout */}
      <div className="border-t border-gray-200 py-2">
        <button
          type="button"
          onClick={() => {
            onLogoutClick?.()
            handleClose()
          }}
          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div ref={triggerRef} className="relative">
      {trigger ? (
        <div onClick={handleToggle}>{trigger}</div>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100"
        >
          <UkoAvatar src={user?.avatar} name={user?.name} size="sm" />
        </button>
      )}
      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  )
}

export default ProfilePopover
