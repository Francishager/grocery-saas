import React, { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Search, X, Mic, MicOff } from 'lucide-react'

export interface SearchInputProps {
  /** Current search value */
  value?: string
  /** Callback when value changes */
  onChange?: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Debounce delay in ms */
  debounceMs?: number
  /** Callback when search is submitted */
  onSearch?: (value: string) => void
  /** Callback when clear button is clicked */
  onClear?: () => void
  /** Whether input is disabled */
  disabled?: boolean
  /** Input size */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to show clear button */
  showClearButton?: boolean
  /** Whether to enable voice input */
  enableVoice?: boolean
  /** Callback when voice input is triggered */
  onVoiceStart?: () => void
  /** Callback when voice input ends */
  onVoiceEnd?: () => void
  /** Additional className */
  className?: string
  /** Container className */
  containerClassName?: string
  /** Whether to auto focus */
  autoFocus?: boolean
  /** Whether input has error */
  error?: boolean
  /** Error message */
  errorMessage?: string
  /** Whether to show search icon */
  showSearchIcon?: boolean
  /** Search icon position */
  iconPosition?: 'left' | 'right'
  /** Loading state */
  loading?: boolean
}

const sizeClasses = {
  sm: 'h-8 text-sm pl-9 pr-9',
  md: 'h-10 text-sm pl-10 pr-10',
  lg: 'h-12 text-base pl-12 pr-12',
}

const iconSizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value: controlledValue,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  onSearch,
  onClear,
  disabled = false,
  size = 'md',
  showClearButton = true,
  enableVoice = false,
  onVoiceStart,
  onVoiceEnd,
  className,
  containerClassName,
  autoFocus = false,
  error = false,
  errorMessage,
  showSearchIcon = true,
  iconPosition = 'left',
  loading = false,
}) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '')
  const [isListening, setIsListening] = useState(false)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync with controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue)
    }
  }, [controlledValue])

  // Cleanup debounce timer
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

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

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
    inputRef.current?.focus()
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

  const handleVoiceToggle = () => {
    if (isListening) {
      setIsListening(false)
      onVoiceEnd?.()
    } else {
      setIsListening(true)
      onVoiceStart?.()
      // Voice recognition would be implemented here
    }
  }

  return (
    <div className={cn('relative', containerClassName)}>
      {/* Search Icon */}
      {showSearchIcon && iconPosition === 'left' && (
        <div className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 text-gray-400',
          loading && 'animate-pulse'
        )}>
          <Search className={iconSizeClasses[size]} />
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'w-full border rounded-lg outline-none transition-all',
          'focus:ring-2 focus:ring-primary/20 focus:border-primary',
          'disabled:bg-gray-100 disabled:cursor-not-allowed',
          sizeClasses[size],
          error
            ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500'
            : 'border-gray-300 hover:border-gray-400',
          !showSearchIcon && 'pl-4',
          iconPosition === 'right' && 'pl-4 pr-10',
          className
        )}
      />

      {/* Search Icon Right */}
      {showSearchIcon && iconPosition === 'right' && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Search className={iconSizeClasses[size]} />
        </div>
      )}

      {/* Clear Button */}
      {showClearButton && internalValue && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <X className={iconSizeClasses[size]} />
        </button>
      )}

      {/* Voice Button */}
      {enableVoice && !internalValue && (
        <button
          type="button"
          onClick={handleVoiceToggle}
          disabled={disabled}
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 p-1',
            isListening ? 'text-red-500' : 'text-gray-400 hover:text-gray-600',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
        >
          {isListening ? (
            <MicOff className={iconSizeClasses[size]} />
          ) : (
            <Mic className={iconSizeClasses[size]} />
          )}
        </button>
      )}

      {/* Error Message */}
      {error && errorMessage && (
        <p className="mt-1 text-sm text-red-500">{errorMessage}</p>
      )}
    </div>
  )
}

export default SearchInput
