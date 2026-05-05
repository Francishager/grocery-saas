import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Calendar, Clock } from 'lucide-react'

export interface FormDateTimeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
}

export const FormDateTimeInput = forwardRef<HTMLInputElement, FormDateTimeInputProps>(
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
    const inputId = id || `datetime-${Math.random().toString(36).substr(2, 9)}`

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
            type="datetime-local"
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
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            <Calendar className="h-4 w-4 text-gray-400" />
            <Clock className="h-4 w-4 text-gray-400" />
          </div>
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

FormDateTimeInput.displayName = 'FormDateTimeInput'

export default FormDateTimeInput
