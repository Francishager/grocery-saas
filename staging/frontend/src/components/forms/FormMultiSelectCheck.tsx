import React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export interface MultiSelectCheckOption {
  value: string | number
  label: string
  disabled?: boolean
  description?: string
}

export interface FormMultiSelectCheckProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  options: MultiSelectCheckOption[]
  value?: (string | number)[]
  onChange?: (value: (string | number)[]) => void
  disabled?: boolean
  className?: string
  orientation?: 'horizontal' | 'vertical'
  columns?: number
}

export const FormMultiSelectCheck: React.FC<FormMultiSelectCheckProps> = ({
  label,
  error,
  helperText,
  required,
  containerClassName,
  options,
  value = [],
  onChange,
  disabled,
  className,
  orientation = 'vertical',
  columns = 1,
}) => {
  const handleToggle = (optionValue: string | number) => {
    if (value.includes(optionValue)) {
      onChange?.(value.filter((v) => v !== optionValue))
    } else {
      onChange?.([...value, optionValue])
    }
  }

  return (
    <div className={cn('space-y-1', containerClassName)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        className={cn(
          orientation === 'horizontal' ? 'flex flex-wrap gap-4' : 'space-y-2',
          columns > 1 && 'grid gap-2'
        )}
        style={columns > 1 ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
      >
        {options.map((option) => {
          const isSelected = value.includes(option.value)
          
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors',
                'hover:border-primary/50',
                isSelected && 'border-primary bg-primary/5',
                (option.disabled || disabled) && 'opacity-50 cursor-not-allowed',
                className
              )}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => !disabled && !option.disabled && handleToggle(option.value)}
                disabled={disabled || option.disabled}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-5 h-5 border-2 rounded flex-shrink-0 flex items-center justify-center mt-0.5',
                  isSelected
                    ? 'bg-primary border-primary'
                    : 'border-gray-300'
                )}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900">{option.label}</span>
                {option.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                )}
              </div>
            </label>
          )
        })}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
    </div>
  )
}

export default FormMultiSelectCheck
