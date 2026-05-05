import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface FormCheckBoxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  containerClassName?: string
}

export const FormCheckBox = forwardRef<HTMLInputElement, FormCheckBoxProps>(
  (
    {
      label,
      error,
      helperText,
      className,
      containerClassName,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn('space-y-1', containerClassName)}>
        <div className="flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            className={cn(
              'h-4 w-4 text-primary border-gray-300 rounded',
              'focus:ring-2 focus:ring-primary focus:ring-offset-0',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              error && 'border-red-500',
              className
            )}
            {...props}
          />
          {label && (
            <label
              htmlFor={inputId}
              className="ml-2 block text-sm text-gray-700 cursor-pointer"
            >
              {label}
            </label>
          )}
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

FormCheckBox.displayName = 'FormCheckBox'

export default FormCheckBox
