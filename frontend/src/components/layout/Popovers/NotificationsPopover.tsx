import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Bell, Check, X, Trash2, Settings } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: Date | string
  link?: string
}

export interface NotificationsPopoverProps {
  /** Notifications list */
  notifications?: Notification[]
  /** Callback when notification is marked as read */
  onMarkAsRead?: (id: string) => void
  /** Callback when notification is deleted */
  onDelete?: (id: string) => void
  /** Callback when all notifications are marked as read */
  onMarkAllAsRead?: () => void
  /** Callback when notification is clicked */
  onNotificationClick?: (notification: Notification) => void
  /** Callback when settings is clicked */
  onSettingsClick?: () => void
  /** Maximum visible notifications */
  maxVisible?: number
  /** Additional className */
  className?: string
  /** Trigger element */
  trigger?: React.ReactNode
  /** Whether popover is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
}

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  notifications = [],
  onMarkAsRead,
  onDelete,
  onMarkAllAsRead,
  onNotificationClick,
  onSettingsClick,
  maxVisible = 5,
  className,
  trigger,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const unreadCount = notifications.filter((n) => !n.read).length

  const handleToggle = () => {
    const newState = !isOpen
    setInternalOpen(newState)
    onOpenChange?.(newState)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      setInternalOpen(false)
      onOpenChange?.(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onOpenChange])

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  const typeColors = {
    info: 'bg-blue-100 text-blue-600',
    success: 'bg-green-100 text-green-600',
    warning: 'bg-yellow-100 text-yellow-600',
    error: 'bg-red-100 text-red-600',
  }

  const popoverContent = isOpen && (
    <div
      ref={popoverRef}
      className={cn(
        'fixed right-0 top-14 z-50 w-80 bg-white rounded-lg shadow-xl border border-gray-200',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all as read
            </button>
          )}
          <button
            type="button"
            onClick={onSettingsClick}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Bell className="h-8 w-8 mb-2" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          notifications.slice(0, maxVisible).map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer',
                !notification.read && 'bg-blue-50/50'
              )}
              onClick={() => onNotificationClick?.(notification)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'p-1.5 rounded-full mt-0.5',
                    typeColors[notification.type]
                  )}
                >
                  <Bell className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {notification.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(notification.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!notification.read && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMarkAsRead?.(notification.id)
                      }}
                      className="p-1 text-gray-400 hover:text-green-600"
                      title="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete?.(notification.id)
                    }}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > maxVisible && (
        <div className="px-4 py-3 border-t border-gray-200">
          <button
            type="button"
            className="w-full text-sm text-primary hover:underline"
          >
            View all notifications ({notifications.length})
          </button>
        </div>
      )}
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
          className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] text-xs font-medium text-white bg-red-500 rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      )}
      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  )
}

export default NotificationsPopover
