import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

export interface SelectGroupOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: SelectGroupOption[]
  disabled?: boolean
}

export interface SelectGroupSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  groups: SelectGroup[]
  placeholder?: string
}

export const SelectGroupSelect = forwardRef<HTMLSelectElement, SelectGroupSelectProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerClassName,
      className,
      id,
      groups,
      placeholder = 'Select an option',
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || `select-group-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn('space-y-1', containerClassName)}>
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
          <select
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              'w-full px-3 py-2 border rounded-md shadow-sm appearance-none',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              'pr-10',
              error
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300',
              className
            )}
            {...props}
          >
            <option value="" disabled>
              {placeholder}
            </option>
            
            {groups.map((group) => (
              <optgroup
                key={group.label}
                label={group.label}
                disabled={group.disabled}
              >
                {group.options.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    )
  }
)

SelectGroupSelect.displayName = 'SelectGroupSelect'

export default SelectGroupSelect
