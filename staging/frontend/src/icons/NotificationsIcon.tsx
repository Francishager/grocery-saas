import React from 'react'
import { Bell } from 'lucide-react'

export interface NotificationsIconProps {
  /** Icon size */
  size?: number
  /** Icon color */
  color?: string
  /** Additional className */
  className?: string
  /** Whether icon is active */
  active?: boolean
  /** Number of unread notifications */
  count?: number
  /** Click handler */
  onClick?: () => void
  /** Whether to show badge */
  showBadge?: boolean
}

/**
 * Notifications icon component with badge
 */
export const NotificationsIcon: React.FC<NotificationsIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  active = false,
  count = 0,
  onClick,
  showBadge = true,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <Bell
        size={size}
        color={color}
        className={active ? 'text-primary' : 'text-gray-500'}
      />
      {showBadge && count > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] text-xs font-medium text-white bg-red-500 rounded-full">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  )
}

export default NotificationsIcon
