import React from 'react'
import { Users, UserPlus, UserCog, UserCheck, UserX } from 'lucide-react'

export interface UserManagementIconProps {
  /** Icon size */
  size?: number
  /** Icon color */
  color?: string
  /** Additional className */
  className?: string
  /** Whether icon is active */
  active?: boolean
  /** Icon variant */
  variant?: 'default' | 'add' | 'edit' | 'approve' | 'block'
  /** Click handler */
  onClick?: () => void
}

/**
 * User management icon component for sidebar
 */
export const UserManagementIcon: React.FC<UserManagementIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  active = false,
  variant = 'default',
  onClick,
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'add':
        return <UserPlus size={size} color={color} />
      case 'edit':
        return <UserCog size={size} color={color} />
      case 'approve':
        return <UserCheck size={size} color={color} />
      case 'block':
        return <UserX size={size} color={color} />
      default:
        return <Users size={size} color={color} />
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

export default UserManagementIcon
