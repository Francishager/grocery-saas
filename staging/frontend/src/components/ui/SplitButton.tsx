import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface SplitButtonOption {
  /** Option label */
  label: string
  /** Option value */
  value: string | number
  /** Option icon */
  icon?: React.ReactNode
  /** Whether option is disabled */
  disabled?: boolean
  /** Option description */
  description?: string
}

export interface SplitButtonProps {
  /** Primary button label */
  label: string
  /** Primary button click handler */
  onClick: () => void
  /** Dropdown options */
  options: SplitButtonOption[]
  /** Selected option value */
  value?: string | number
  /** Callback when option is selected */
  onOptionSelect?: (option: SplitButtonOption) => void
  /** Button variant */
  variant?: 'contained' | 'outlined' | 'text'
  /** Button color */
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'
  /** Button size */
  size?: 'sm' | 'md' | 'lg'
  /** Whether button is disabled */
  disabled?: boolean
  /** Whether button is loading */
  loading?: boolean
  /** Loading text */
  loadingText?: string
  /** Icon for primary button */
  startIcon?: React.ReactNode
  /** Icon for primary button (end) */
  endIcon?: React.ReactNode
  /** Additional className */
  className?: string
  /** Dropdown alignment */
  align?: 'left' | 'right'
  /** Whether to split the button */
  split?: boolean
}

const variantClasses = {
  contained: {
    primary: 'bg-primary text-white hover:bg-primary/90',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    error: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    info: 'bg-blue-600 text-white hover:bg-blue-700',
  },
  outlined: {
    primary: 'border-2 border-primary text-primary hover:bg-primary/10',
    secondary: 'border-2 border-gray-600 text-gray-600 hover:bg-gray-100',
    success: 'border-2 border-green-600 text-green-600 hover:bg-green-50',
    error: 'border-2 border-red-600 text-red-600 hover:bg-red-50',
    warning: 'border-2 border-yellow-500 text-yellow-600 hover:bg-yellow-50',
    info: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50',
  },
  text: {
    primary: 'text-primary hover:bg-primary/10',
    secondary: 'text-gray-600 hover:bg-gray-100',
    success: 'text-green-600 hover:bg-green-50',
    error: 'text-red-600 hover:bg-red-50',
    warning: 'text-yellow-600 hover:bg-yellow-50',
    info: 'text-blue-600 hover:bg-blue-50',
  },
}

const sizeClasses = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-4',
  lg: 'h-12 text-base px-6',
}

export const SplitButton: React.FC<SplitButtonProps> = ({
  label,
  onClick,
  options,
  value,
  onOptionSelect,
  variant = 'contained',
  color = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  loadingText = 'Loading...',
  startIcon,
  className,
  align = 'left',
  split = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleOptionClick = (option: SplitButtonOption) => {
    if (option.disabled) return
    onOptionSelect?.(option)
    setIsOpen(false)
  }

  const handlePrimaryClick = () => {
    if (disabled || loading) return
    onClick()
  }

  const handleDropdownToggle = () => {
    if (disabled || loading) return
    setIsOpen(!isOpen)
  }

  return (
    <div ref={dropdownRef} className={cn('inline-flex', className)}>
      {/* Primary Button */}
      <button
        type="button"
        onClick={handlePrimaryClick}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
          variantClasses[variant][color],
          sizeClasses[size],
          split ? 'rounded-l-md' : 'rounded-md'
        )}
      >
        {startIcon}
        {loading ? loadingText : label}
      </button>

      {/* Dropdown Toggle */}
      {split && (
        <button
          type="button"
          onClick={handleDropdownToggle}
          disabled={disabled || loading}
          className={cn(
            'inline-flex items-center justify-center px-2 font-medium transition-colors',
            'border-l border-white/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
            variantClasses[variant][color],
            sizeClasses[size],
            'rounded-r-md'
          )}
        >
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-12 min-w-[200px] bg-white rounded-md shadow-lg border border-gray-200 py-1',
            align === 'left' ? 'left-0' : 'right-0'
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleOptionClick(option)}
              disabled={option.disabled}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2 text-left text-sm',
                'hover:bg-gray-50 transition-colors',
                option.disabled && 'opacity-50 cursor-not-allowed',
                option.value === value && 'bg-primary/5 text-primary'
              )}
            >
              {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
              <div className="flex-1">
                <div className="font-medium">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-gray-500">{option.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SplitButton
