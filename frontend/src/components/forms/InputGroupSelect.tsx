import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputGroupSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  options: { value: string | number; label: string }[]
  inputLabel?: string
  inputValue?: string
  onInputChange?: (value: string) => void
  inputPlaceholder?: string
  inputType?: React.HTMLInputTypeAttribute
  selectPosition?: 'left' | 'right'
}

export const InputGroupSelect = forwardRef<HTMLSelectElement, InputGroupSelectProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      containerClassName,
      className,
      id,
      options,
      inputLabel,
      inputValue,
      onInputChange,
      inputPlaceholder,
      inputType = 'text',
      selectPosition = 'left',
      value,
      onChange,
      disabled,
      ...props
    },
    ref
  ) => {
    const groupId = id || `input-group-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn('space-y-1', containerClassName)}>
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="flex">
          {selectPosition === 'left' ? (
            <>
              <select
                ref={ref}
                id={groupId}
                value={value}
                onChange={onChange}
                disabled={disabled}
                className={cn(
                  'px-3 py-2 border rounded-l-md shadow-sm appearance-none',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                  'disabled:bg-gray-100 disabled:cursor-not-allowed',
                  'border-r-0',
                  error ? 'border-red-500' : 'border-gray-300',
                  className
                )}
                {...props}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type={inputType}
                value={inputValue}
                onChange={(e) => onInputChange?.(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={disabled}
                aria-label={inputLabel}
                className={cn(
                  'flex-1 px-3 py-2 border rounded-r-md shadow-sm',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                  'disabled:bg-gray-100 disabled:cursor-not-allowed',
                  error ? 'border-red-500' : 'border-gray-300',
                  className
                )}
              />
            </>
          ) : (
            <>
              <input
                type={inputType}
                value={inputValue}
                onChange={(e) => onInputChange?.(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={disabled}
                aria-label={inputLabel}
                className={cn(
                  'flex-1 px-3 py-2 border rounded-l-md shadow-sm',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                  'disabled:bg-gray-100 disabled:cursor-not-allowed',
                  'border-r-0',
                  error ? 'border-red-500' : 'border-gray-300',
                  className
                )}
              />
              <select
                ref={ref}
                id={groupId}
                value={value}
                onChange={onChange}
                disabled={disabled}
                className={cn(
                  'px-3 py-2 border rounded-r-md shadow-sm appearance-none',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                  'disabled:bg-gray-100 disabled:cursor-not-allowed',
                  error ? 'border-red-500' : 'border-gray-300',
                  className
                )}
                {...props}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    )
  }
)

InputGroupSelect.displayName = 'InputGroupSelect'

export default InputGroupSelect
