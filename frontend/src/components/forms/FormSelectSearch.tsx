import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronDown, X } from 'lucide-react'

export interface SelectSearchOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface FormSelectSearchProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  options: SelectSearchOption[]
  placeholder?: string
  searchPlaceholder?: string
  value?: string | number
  onChange?: (value: string | number | undefined) => void
  disabled?: boolean
  className?: string
  clearable?: boolean
}

export const FormSelectSearch: React.FC<FormSelectSearchProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  value,
  onChange,
  disabled,
  className,
  clearable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

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

  const handleSelect = (optionValue: string | number) => {
    onChange?.(optionValue)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
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
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <ul className="max-h-60 overflow-auto py-1">
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500 text-center">
                  No options found
                </li>
              ) : (
                filteredOptions.map((option) => (
                  <li
                    key={option.value}
                    onClick={() => !option.disabled && handleSelect(option.value)}
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

export default FormSelectSearch
