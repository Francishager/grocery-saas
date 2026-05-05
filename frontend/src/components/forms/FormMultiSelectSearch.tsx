import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronDown, X, Check } from 'lucide-react'

export interface MultiSelectSearchOption {
  value: string | number
  label: string
  disabled?: boolean
  category?: string
}

export interface FormMultiSelectSearchProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  options: MultiSelectSearchOption[]
  placeholder?: string
  searchPlaceholder?: string
  value?: (string | number)[]
  onChange?: (value: (string | number)[]) => void
  disabled?: boolean
  className?: string
  maxSelected?: number
  groupByCategory?: boolean
}

export const FormMultiSelectSearch: React.FC<FormMultiSelectSearchProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  options,
  placeholder = 'Select options',
  searchPlaceholder = 'Search...',
  value = [],
  onChange,
  disabled,
  className,
  maxSelected,
  groupByCategory = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOptions = options.filter((opt) => value.includes(opt.value))

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group options by category if enabled
  const groupedOptions = groupByCategory
    ? filteredOptions.reduce((acc, opt) => {
        const category = opt.category || 'Other'
        if (!acc[category]) acc[category] = []
        acc[category].push(opt)
        return acc
      }, {} as Record<string, MultiSelectSearchOption[]>)
    : null

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

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleToggle = (optionValue: string | number) => {
    if (value.includes(optionValue)) {
      onChange?.(value.filter((v) => v !== optionValue))
    } else {
      if (maxSelected && value.length >= maxSelected) return
      onChange?.([...value, optionValue])
    }
  }

  const handleRemove = (optionValue: string | number, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(value.filter((v) => v !== optionValue))
  }

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.([])
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
            'w-full px-3 py-2 border rounded-md shadow-sm text-left min-h-[42px]',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            'disabled:bg-gray-100 disabled:cursor-not-allowed',
            error
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300',
            className
          )}
          disabled={disabled}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedOptions.length === 0 ? (
                <span className="text-gray-400">{placeholder}</span>
              ) : (
                selectedOptions.map((opt) => (
                  <span
                    key={opt.value}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-sm rounded"
                  >
                    {opt.label}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-primary/70"
                      onClick={(e) => handleRemove(opt.value, e)}
                    />
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-1">
              {selectedOptions.length > 0 && (
                <X
                  className="h-4 w-4 text-gray-400 hover:text-gray-600"
                  onClick={handleClearAll}
                />
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-gray-400 transition-transform',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
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

            <div className="max-h-60 overflow-auto">
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500 text-center">No options found</p>
              ) : groupedOptions ? (
                Object.entries(groupedOptions).map(([category, opts]) => (
                  <div key={category}>
                    <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                      {category}
                    </div>
                    {opts.map((option) => {
                      const isSelected = value.includes(option.value)
                      const isMaxReached = maxSelected && value.length >= maxSelected && !isSelected

                      return (
                        <div
                          key={option.value}
                          onClick={() => !option.disabled && !isMaxReached && handleToggle(option.value)}
                          className={cn(
                            'px-3 py-2 text-sm cursor-pointer flex items-center gap-2',
                            option.disabled || isMaxReached
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'hover:bg-gray-100',
                            isSelected && 'bg-primary/10'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 border rounded flex items-center justify-center',
                              isSelected ? 'bg-primary border-primary' : 'border-gray-300'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span>{option.label}</span>
                        </div>
                      )
                    })}
                  </div>
                ))
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = value.includes(option.value)
                  const isMaxReached = maxSelected && value.length >= maxSelected && !isSelected

                  return (
                    <div
                      key={option.value}
                      onClick={() => !option.disabled && !isMaxReached && handleToggle(option.value)}
                      className={cn(
                        'px-3 py-2 text-sm cursor-pointer flex items-center gap-2',
                        option.disabled || isMaxReached
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'hover:bg-gray-100',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 border rounded flex items-center justify-center',
                          isSelected ? 'bg-primary border-primary' : 'border-gray-300'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span>{option.label}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {maxSelected && (
        <p className="text-xs text-gray-500">
          {value.length}/{maxSelected} selected
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

export default FormMultiSelectSearch
