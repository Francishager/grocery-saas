import React, { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle } from 'lucide-react'

export interface FormNinInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: string
  onChange?: (value: string) => void
  validateFormat?: boolean
  country?: 'uganda' | 'kenya' | 'tanzania' | 'rwanda' | 'generic'
}

// NIN format patterns by country
const ninPatterns: Record<string, { pattern: RegExp; length: number; description: string }> = {
  uganda: {
    pattern: /^[A-Z]{2}\d{7}[A-Z]$/,
    length: 10,
    description: 'Uganda NIN: 2 letters, 7 digits, 1 letter (e.g., CM1234567A)',
  },
  kenya: {
    pattern: /^\d{7,8}$/,
    length: 8,
    description: 'Kenya ID: 7-8 digits',
  },
  tanzania: {
    pattern: /^\d{8,12}$/,
    length: 12,
    description: 'Tanzania NIDA: 8-12 digits',
  },
  rwanda: {
    pattern: /^\d{16}$/,
    length: 16,
    description: 'Rwanda ID: 16 digits',
  },
  generic: {
    pattern: /^[A-Z0-9]{6,20}$/i,
    length: 20,
    description: 'National ID: 6-20 alphanumeric characters',
  },
}

export const FormNinInput = forwardRef<HTMLInputElement, FormNinInputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      className,
      containerClassName,
      id,
      value = '',
      onChange,
      validateFormat = true,
      country = 'uganda',
      disabled,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const inputId = id || `nin-${Math.random().toString(36).substr(2, 9)}`

    const pattern = ninPatterns[country] || ninPatterns.generic
    const isValid = !validateFormat || (value.length > 0 && pattern.pattern.test(value.toUpperCase()))
    const showError = validateFormat && value.length > 0 && !isValid

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value.toUpperCase()
      onChange?.(newValue)
    }

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
            id={inputId}
            type="text"
            value={value.toUpperCase()}
            onChange={handleChange}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            maxLength={pattern.length}
            className={cn(
              'w-full px-3 py-2 border rounded-md shadow-sm uppercase',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              'pr-10',
              (error || showError)
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : isValid && value.length > 0
                ? 'border-green-500 focus:ring-green-500 focus:border-green-500'
                : 'border-gray-300',
              className
            )}
            placeholder={pattern.description.split(':')[1]?.trim() || 'Enter National ID'}
            {...props}
          />
          
          {validateFormat && value.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isValid ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
          )}
        </div>

        {isFocused && helperText === undefined && (
          <p className="text-xs text-gray-500">{pattern.description}</p>
        )}

        {(error || showError) && (
          <p className="text-sm text-red-500">
            {error || `Invalid ${country.charAt(0).toUpperCase() + country.slice(1)} ID format`}
          </p>
        )}
        
        {helperText && !error && !showError && (
          <p className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

FormNinInput.displayName = 'FormNinInput'

export default FormNinInput
