import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface FormSelectInputProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  options: SelectOption[]
  placeholder?: string
}

export const FormSelectInput = forwardRef<HTMLSelectElement, FormSelectInputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      className,
      containerClassName,
      id,
      options,
      placeholder = 'Select an option',
      ...props
    },
    ref
  ) => {
    const inputId = id || `select-${Math.random().toString(36).substr(2, 9)}`

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
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

FormSelectInput.displayName = 'FormSelectInput'

export default FormSelectInput
