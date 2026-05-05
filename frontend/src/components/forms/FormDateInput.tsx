import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Calendar } from 'lucide-react'

export interface FormDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
}

export const FormDateInput = forwardRef<HTMLInputElement, FormDateInputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      className,
      containerClassName,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `date-${Math.random().toString(36).substr(2, 9)}`

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
          <input
            ref={ref}
            type="date"
            id={inputId}
            className={cn(
              'w-full px-3 py-2 border rounded-md shadow-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              'pr-10',
              error
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300',
              className
            )}
            {...props}
          />
          <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
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

FormDateInput.displayName = 'FormDateInput'

export default FormDateInput
