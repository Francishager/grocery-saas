import React, { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Search, X, Filter, SlidersHorizontal } from 'lucide-react'

export interface TableSearchInputProps {
  /** Placeholder text for the search input */
  placeholder?: string
  /** Current search value */
  value?: string
  /** Callback when search value changes */
  onChange?: (value: string) => void
  /** Debounce delay in milliseconds */
  debounceMs?: number
  /** Whether to show filter button */
  showFilterButton?: boolean
  /** Whether to show advanced filters button */
  showAdvancedButton?: boolean
  /** Callback when filter button is clicked */
  onFilterClick?: () => void
  /** Callback when advanced button is clicked */
  onAdvancedClick?: () => void
  /** Whether filters are currently active */
  hasActiveFilters?: boolean
  /** Number of active filters */
  activeFilterCount?: number
  /** Whether the component is disabled */
  disabled?: boolean
  /** Additional className for the container */
  containerClassName?: string
  /** Additional className for the input */
  inputClassName?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to auto-focus on mount */
  autoFocus?: boolean
  /** Callback when Enter key is pressed */
  onSearch?: (value: string) => void
  /** Whether to show clear button */
  showClearButton?: boolean
  /** Custom clear button handler */
  onClear?: () => void
}

export const TableSearchInput: React.FC<TableSearchInputProps> = ({
  placeholder = 'Search...',
  value: controlledValue,
  onChange,
  debounceMs = 300,
  showFilterButton = false,
  showAdvancedButton = false,
  onFilterClick,
  onAdvancedClick,
  hasActiveFilters = false,
  activeFilterCount = 0,
  disabled = false,
  containerClassName,
  inputClassName,
  size = 'md',
  autoFocus = false,
  onSearch,
  showClearButton = true,
  onClear,
}) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '')
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  // Sync with controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue)
    }
  }, [controlledValue])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [debounceTimer])

  const handleChange = useCallback(
    (newValue: string) => {
      setInternalValue(newValue)

      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      // Set new debounce timer
      const timer = setTimeout(() => {
        onChange?.(newValue)
      }, debounceMs)

      setDebounceTimer(timer)
    },
    [debounceMs, onChange, debounceTimer]
  )

  const handleClear = () => {
    setInternalValue('')
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    onChange?.('')
    onClear?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      onChange?.(internalValue)
      onSearch?.(internalValue)
    }
    if (e.key === 'Escape') {
      handleClear()
    }
  }

  const sizeClasses = {
    sm: 'h-8 text-sm',
    md: 'h-10 text-sm',
    lg: 'h-12 text-base',
  }

  const iconSizeClasses = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  return (
    <div className={cn('flex items-center gap-2', containerClassName)}>
      {/* Main Search Input */}
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className={cn('text-gray-400', iconSizeClasses[size])} />
        </div>

        <input
          type="text"
          value={internalValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            'w-full pl-10 pr-10 border rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            'transition-colors',
            sizeClasses[size],
            hasActiveFilters ? 'border-primary' : 'border-gray-300',
            inputClassName
          )}
        />

        {/* Clear Button */}
        {showClearButton && internalValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <X className={iconSizeClasses[size]} />
          </button>
        )}
      </div>

      {/* Filter Button */}
      {showFilterButton && (
        <button
          type="button"
          onClick={onFilterClick}
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 px-3 border rounded-lg transition-colors',
            'hover:bg-gray-50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            sizeClasses[size],
            hasActiveFilters
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-gray-300 text-gray-700'
          )}
        >
          <Filter className={iconSizeClasses[size]} />
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-primary text-white rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* Advanced Filters Button */}
      {showAdvancedButton && (
        <button
          type="button"
          onClick={onAdvancedClick}
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 px-3 border rounded-lg transition-colors',
            'hover:bg-gray-50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            sizeClasses[size],
            hasActiveFilters
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-gray-300 text-gray-700'
          )}
        >
          <SlidersHorizontal className={iconSizeClasses[size]} />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-primary text-white rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

export default TableSearchInput
