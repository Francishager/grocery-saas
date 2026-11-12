import React from 'react'
import { User, Settings, Key, Bell, Palette, HelpCircle } from 'lucide-react'

export interface UserProfileIconProps {
  /** Icon size */
  size?: number
  /** Icon color */
  color?: string
  /** Additional className */
  className?: string
  /** Whether icon is active */
  active?: boolean
  /** Icon variant */
  variant?: 'default' | 'settings' | 'security' | 'notifications' | 'appearance' | 'help'
  /** Click handler */
  onClick?: () => void
}

/**
 * User profile icon component for sidebar
 */
export const UserProfileIcon: React.FC<UserProfileIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  active = false,
  variant = 'default',
  onClick,
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'settings':
        return <Settings size={size} color={color} />
      case 'security':
        return <Key size={size} color={color} />
      case 'notifications':
        return <Bell size={size} color={color} />
      case 'appearance':
        return <Palette size={size} color={color} />
      case 'help':
        return <HelpCircle size={size} color={color} />
      default:
        return <User size={size} color={color} />
    }
  }

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={active ? 'text-primary' : 'text-gray-500'}>
        {getIcon()}
      </div>
    </div>
  )
}

export default UserProfileIcon
