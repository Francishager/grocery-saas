import React from 'react'
import { MessageSquare } from 'lucide-react'

export interface CommentIconProps {
  /** Icon size */
  size?: number
  /** Icon color */
  color?: string
  /** Additional className */
  className?: string
  /** Whether icon is active */
  active?: boolean
  /** Number of comments */
  count?: number
  /** Click handler */
  onClick?: () => void
}

/**
 * Comment icon component with optional badge
 */
export const CommentIcon: React.FC<CommentIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  active = false,
  count,
  onClick,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <MessageSquare
        size={size}
        color={color}
        className={active ? 'text-primary' : 'text-gray-500'}
      />
      {count !== undefined && count > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] text-xs font-medium text-white bg-primary rounded-full">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  )
}

export default CommentIcon
