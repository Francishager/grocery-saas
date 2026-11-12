import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputGroupTextProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  prepend?: string | React.ReactNode
  append?: string | React.ReactNode
  prependClassName?: string
  appendClassName?: string
}

export const InputGroupText = forwardRef<HTMLInputElement, InputGroupTextProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerClassName,
      className,
      id,
      prepend,
      append,
      prependClassName,
      appendClassName,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-group-text-${Math.random().toString(36).substr(2, 9)}`

    const hasPrepend = prepend !== undefined
    const hasAppend = append !== undefined

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

        <div className="flex">
          {hasPrepend && (
            <span
              className={cn(
                'inline-flex items-center px-3 border border-r-0 rounded-l-md bg-gray-50 text-gray-500 text-sm',
                error ? 'border-red-500' : 'border-gray-300',
                prependClassName
              )}
            >
              {typeof prepend === 'string' ? prepend : prepend}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              'w-full px-3 py-2 border shadow-sm placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              error
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300',
              !hasPrepend && 'rounded-l-md',
              !hasAppend && 'rounded-r-md',
              className
            )}
            {...props}
          />

          {hasAppend && (
            <span
              className={cn(
                'inline-flex items-center px-3 border border-l-0 rounded-r-md bg-gray-50 text-gray-500 text-sm',
                error ? 'border-red-500' : 'border-gray-300',
                appendClassName
              )}
            >
              {typeof append === 'string' ? append : append}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    )
  }
)

InputGroupText.displayName = 'InputGroupText'

export default InputGroupText
