import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface RadioOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface FormRadioBtnProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  containerClassName?: string
  options: RadioOption[]
  orientation?: 'horizontal' | 'vertical'
}

export const FormRadioBtn = forwardRef<HTMLInputElement, FormRadioBtnProps>(
  (
    {
      label,
      error,
      helperText,
      className,
      containerClassName,
      id,
      options,
      orientation = 'vertical',
      name,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const groupName = name || `radio-group-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn('space-y-1', containerClassName)}>
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div
          className={cn(
            'flex',
            orientation === 'vertical' ? 'flex-col space-y-2' : 'flex-row space-x-4'
          )}
        >
          {options.map((option) => {
            const optionId = `${groupName}-${option.value}`
            return (
              <div key={option.value} className="flex items-center">
                <input
                  ref={ref}
                  type="radio"
                  id={optionId}
                  name={groupName}
                  value={option.value}
                  checked={value === option.value}
                  onChange={onChange}
                  disabled={option.disabled || props.disabled}
                  className={cn(
                    'h-4 w-4 text-primary border-gray-300',
                    'focus:ring-2 focus:ring-primary focus:ring-offset-0',
                    'disabled:bg-gray-100 disabled:cursor-not-allowed',
                    error && 'border-red-500',
                    className
                  )}
                  {...props}
                />
                <label
                  htmlFor={optionId}
                  className={cn(
                    'ml-2 block text-sm text-gray-700 cursor-pointer',
                    option.disabled && 'text-gray-400 cursor-not-allowed'
                  )}
                >
                  {option.label}
                </label>
              </div>
            )
          })}
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

FormRadioBtn.displayName = 'FormRadioBtn'

export default FormRadioBtn
