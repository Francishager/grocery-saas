import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronDown, X, Loader2 } from 'lucide-react'

export interface AsyncSelectOption {
  value: string | number
  label: string
  disabled?: boolean
  [key: string]: any
}

export interface FormAsyncSelectSearchProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  placeholder?: string
  searchPlaceholder?: string
  value?: string | number | undefined
  onChange?: (value: string | number | undefined, option?: AsyncSelectOption) => void
  disabled?: boolean
  className?: string
  loadOptions: (searchQuery: string) => Promise<AsyncSelectOption[]>
  cacheOptions?: boolean
  debounceMs?: number
  minSearchLength?: number
  clearable?: boolean
}

export const FormAsyncSelectSearch: React.FC<FormAsyncSelectSearchProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  placeholder = 'Select an option',
  searchPlaceholder = 'Type to search...',
  value,
  onChange,
  disabled,
  className,
  loadOptions,
  cacheOptions = true,
  debounceMs = 300,
  minSearchLength = 2,
  clearable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [options, setOptions] = useState<AsyncSelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedOption, setSelectedOption] = useState<AsyncSelectOption | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cacheRef = useRef<Map<string, AsyncSelectOption[]>>(new Map())
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Load selected option on mount if value exists
  useEffect(() => {
    if (value && !selectedOption) {
      // You might want to provide a way to load the initial option
      // For now, we'll just set a placeholder
    }
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchOptions = useCallback(async (query: string) => {
    if (query.length < minSearchLength) {
      setOptions([])
      return
    }

    // Check cache first
    if (cacheOptions && cacheRef.current.has(query)) {
      setOptions(cacheRef.current.get(query) || [])
      return
    }

    setLoading(true)
    try {
      const results = await loadOptions(query)
      setOptions(results)
      if (cacheOptions) {
        cacheRef.current.set(query, results)
      }
    } catch (err) {
      console.error('Failed to load options:', err)
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [loadOptions, cacheOptions, minSearchLength])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (searchQuery) {
      debounceRef.current = setTimeout(() => {
        fetchOptions(searchQuery)
      }, debounceMs)
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchQuery, debounceMs, fetchOptions])

  const handleSelect = (option: AsyncSelectOption) => {
    setSelectedOption(option)
    onChange?.(option.value, option)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedOption(null)
    onChange?.(undefined)
  }

  return (
    <div className={cn('space-y-1', containerClassName)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            'w-full px-3 py-2 border rounded-md shadow-sm text-left',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            'flex items-center justify-between',
            error
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300',
            className
          )}
          disabled={disabled}
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
            {selectedOption?.label || placeholder}
          </span>
          <div className="flex items-center gap-1">
            {clearable && selectedOption && !disabled && (
              <X
                className="h-4 w-4 text-gray-400 hover:text-gray-600"
                onClick={handleClear}
              />
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-400 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
            <div className="p-2 border-b border-gray-200">
              <div className="relative">
                {loading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                )}
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={cn(
                    'w-full pl-8 pr-10 py-1.5 border border-gray-300 rounded-md text-sm',
                    'focus:outline-none focus:ring-1 focus:ring-primary'
                  )}
                />
              </div>
            </div>

            <ul className="max-h-60 overflow-auto py-1">
              {searchQuery.length < minSearchLength ? (
                <li className="px-3 py-2 text-sm text-gray-500 text-center">
                  Type at least {minSearchLength} characters to search
                </li>
              ) : loading ? (
                <li className="px-3 py-2 text-sm text-gray-500 text-center">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading...
                </li>
              ) : options.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500 text-center">
                  No options found
                </li>
              ) : (
                options.map((option) => (
                  <li
                    key={option.value}
                    onClick={() => !option.disabled && handleSelect(option)}
                    className={cn(
                      'px-3 py-2 text-sm cursor-pointer',
                      option.disabled
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'hover:bg-gray-100',
                      option.value === value && 'bg-primary/10 text-primary font-medium'
                    )}
                  >
                    {option.label}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

export default FormAsyncSelectSearch
