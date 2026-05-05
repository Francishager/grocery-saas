import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface LightTextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Input label */
  label?: string
  /** Error message */
  error?: string
  /** Helper text */
  helperText?: string
  /** Whether input is required */
  required?: boolean
  /** Whether input is full width */
  fullWidth?: boolean
  /** Start adornment */
  startAdornment?: React.ReactNode
  /** End adornment */
  endAdornment?: React.ReactNode
  /** Input size */
  size?: 'sm' | 'md' | 'lg'
  /** Input variant */
  variant?: 'light' | 'outlined' | 'filled' | 'standard'
  /** Container className */
  containerClassName?: string
  /** Label className */
  labelClassName?: string
  /** Whether to show character count */
  showCharCount?: boolean
  /** Max character count */
  maxLength?: number
}

const sizeClasses = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-4',
  lg: 'h-12 text-base px-4',
}

const variantClasses = {
  light: 'bg-gray-50 border-gray-200 focus:bg-white focus:border-primary',
  outlined: 'bg-white border-gray-300 hover:border-gray-400 focus:border-primary',
  filled: 'bg-gray-100 border-transparent focus:bg-white focus:border-primary',
  standard: 'bg-transparent border-0 border-b-2 border-gray-300 rounded-none focus:border-primary',
}

export const LightTextField = forwardRef<HTMLInputElement, LightTextFieldProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      fullWidth = true,
      startAdornment,
      endAdornment,
      size = 'md',
      variant = 'light',
      className,
      containerClassName,
      labelClassName,
      disabled,
      id,
      showCharCount = false,
      maxLength,
      value,
      ...props
    },
    ref
  ) => {
    const inputId = id || `light-text-field-${Math.random().toString(36).substr(2, 9)}`
    const currentLength = typeof value === 'string' ? value.length : 0

    return (
      <div
        className={cn(
          fullWidth ? 'w-full' : 'inline-block',
          containerClassName
        )}
      >
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-sm font-medium text-gray-700 mb-1',
              labelClassName
            )}
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {startAdornment && (
            <div className="absolute left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {startAdornment}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            value={value}
            maxLength={maxLength}
            className={cn(
              'w-full rounded-lg border outline-none transition-all',
              'placeholder:text-gray-400',
              'focus:ring-2 focus:ring-primary/20',
              'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
              sizeClasses[size],
              variantClasses[variant],
              error
                ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500'
                : '',
              startAdornment && 'pl-10',
              endAdornment && 'pr-10',
              className
            )}
            {...props}
          />

          {endAdornment && (
            <div className="absolute right-0 pr-3 flex items-center text-gray-400">
              {endAdornment}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <div>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            {helperText && !error && (
              <p className="text-sm text-gray-500">{helperText}</p>
            )}
          </div>

          {showCharCount && maxLength && (
            <p className="text-xs text-gray-400">
              {currentLength}/{maxLength}
            </p>
          )}
        </div>
      </div>
    )
  }
)

LightTextField.displayName = 'LightTextField'

export default LightTextField
