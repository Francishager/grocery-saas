import React from 'react'
import { Clock, LogOut, Users, UserCircle, Shield, Activity } from 'lucide-react'

export interface SessionsIconProps {
  /** Icon size */
  size?: number
  /** Icon color */
  color?: string
  /** Additional className */
  className?: string
  /** Whether icon is active */
  active?: boolean
  /** Icon variant */
  variant?: 'default' | 'active' | 'history' | 'manage'
  /** Click handler */
  onClick?: () => void
}

/**
 * Sessions icon component for sidebar
 */
export const SessionsIcon: React.FC<SessionsIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  active = false,
  variant = 'default',
  onClick,
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'active':
        return <Activity size={size} color={color} />
      case 'history':
        return <Clock size={size} color={color} />
      case 'manage':
        return <Shield size={size} color={color} />
      default:
        return <LogOut size={size} color={color} />
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

export default SessionsIcon
