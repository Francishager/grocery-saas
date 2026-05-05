import React from 'react'
import { Search, X } from 'lucide-react'

export interface SearchIconProps {
  /** Icon size */
  size?: number
  /** Icon color */
  color?: string
  /** Additional className */
  className?: string
  /** Whether search is active */
  active?: boolean
  /** Click handler */
  onClick?: () => void
  /** Clear handler */
  onClear?: () => void
  /** Whether to show clear button */
  showClear?: boolean
  /** Whether search has value */
  hasValue?: boolean
}

/**
 * Search icon component with optional clear button
 */
export const SearchIcon: React.FC<SearchIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  active = false,
  onClick,
  onClear,
  showClear = false,
  hasValue = false,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {showClear && hasValue ? (
        <X
          size={size}
          color={color}
          className="text-gray-400 hover:text-gray-600 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onClear?.()
          }}
        />
      ) : (
        <Search
          size={size}
          color={color}
          className={active ? 'text-primary' : 'text-gray-500'}
        />
      )}
    </div>
  )
}

export default SearchIcon
