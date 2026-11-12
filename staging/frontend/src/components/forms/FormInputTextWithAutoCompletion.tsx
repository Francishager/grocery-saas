import React, { useState, useRef, useEffect, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export interface AutocompleteOption {
  value: string
  label: string
  [key: string]: any
}

export interface FormInputTextWithAutoCompletionProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: string
  onChange?: (value: string, option?: AutocompleteOption) => void
  loadSuggestions: (query: string) => Promise<AutocompleteOption[]>
  debounceMs?: number
  minSearchLength?: number
  showSuggestionsOnFocus?: boolean
  highlightMatch?: boolean
}

export const FormInputTextWithAutoCompletion = forwardRef<HTMLInputElement, FormInputTextWithAutoCompletionProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerClassName,
      className,
      id,
      value = '',
      onChange,
      loadSuggestions,
      debounceMs = 300,
      minSearchLength = 2,
      showSuggestionsOnFocus = true,
      highlightMatch = true,
      disabled,
      ...props
    },
    ref
  ) => {
    const [suggestions, setSuggestions] = useState<AutocompleteOption[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [loading, setLoading] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const debounceRef = useRef<NodeJS.Timeout | null>(null)

    const inputId = id || `autocomplete-${Math.random().toString(36).substr(2, 9)}`

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setShowDropdown(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchSuggestions = async (query: string) => {
      if (query.length < minSearchLength) {
        setSuggestions([])
        return
      }

      setLoading(true)
      try {
        const results = await loadSuggestions(query)
        setSuggestions(results)
        setShowDropdown(true)
      } catch (err) {
        console.error('Failed to load suggestions:', err)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      if (value.length >= minSearchLength) {
        debounceRef.current = setTimeout(() => {
          fetchSuggestions(value)
        }, debounceMs)
      } else {
        setSuggestions([])
      }

      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
        }
      }
    }, [value, debounceMs, minSearchLength])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      onChange?.(newValue)
      setHighlightedIndex(-1)
    }

    const handleFocus = () => {
      if (showSuggestionsOnFocus && value.length >= minSearchLength) {
        fetchSuggestions(value)
      }
    }

    const handleSelectSuggestion = (option: AutocompleteOption) => {
      onChange?.(option.value, option)
      setShowDropdown(false)
      setHighlightedIndex(-1)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!showDropdown) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
          break
        case 'Enter':
          e.preventDefault()
          if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
            handleSelectSuggestion(suggestions[highlightedIndex])
          }
          break
        case 'Escape':
          setShowDropdown(false)
          setHighlightedIndex(-1)
          break
      }
    }

    const highlightText = (text: string, match: string) => {
      if (!highlightMatch || !match) return text

      const parts = text.split(new RegExp(`(${match})`, 'gi'))
      return parts.map((part, i) =>
        part.toLowerCase() === match.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 px-0">
            {part}
          </mark>
        ) : (
          part
        )
      )
    }

    return (
      <div className={cn('space-y-1', containerClassName)} ref={containerRef}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <input
            ref={(el) => {
              inputRef.current = el
              if (typeof ref === 'function') ref(el)
              else if (ref) ref.current = el
            }}
            id={inputId}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              'w-full px-3 py-2 border rounded-md shadow-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              error
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300',
              loading && 'pr-10',
              className
            )}
            {...props}
          />
          
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
          )}

          {showDropdown && suggestions.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {suggestions.map((option, index) => (
                <li
                  key={option.value}
                  onClick={() => handleSelectSuggestion(option)}
                  className={cn(
                    'px-3 py-2 text-sm cursor-pointer',
                    index === highlightedIndex
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-gray-100'
                  )}
                >
                  {highlightMatch ? highlightText(option.label, value) : option.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    )
  }
)

FormInputTextWithAutoCompletion.displayName = 'FormInputTextWithAutoCompletion'

export default FormInputTextWithAutoCompletion
