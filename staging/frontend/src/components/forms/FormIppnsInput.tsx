import React, { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle } from 'lucide-react'

export interface FormIppnsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: string
  onChange?: (value: string) => void
  validateFormat?: boolean
}

// IPPNS format: Typically used for insurance/pension numbers
// Format varies by organization, common patterns:
// - UG IPPNS: UG-XXXX-XXXX-XXXX (alphanumeric)
// - Generic: 10-20 alphanumeric characters

const ippnsPatterns = {
  standard: {
    pattern: /^[A-Z]{2}-\d{4}-\d{4}-\d{4}$/,
    description: 'Format: XX-0000-0000-0000',
  },
  numeric: {
    pattern: /^\d{10,16}$/,
    description: '10-16 digits',
  },
  alphanumeric: {
    pattern: /^[A-Z0-9]{10,20}$/,
    description: '10-20 alphanumeric characters',
  },
}

export const FormIppnsInput = forwardRef<HTMLInputElement, FormIppnsInputProps>(
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
      disabled,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const inputId = id || `ippns-${Math.random().toString(36).substr(2, 9)}`

    // Auto-format value with dashes
    const formatValue = (input: string): string => {
      // Remove non-alphanumeric characters
      const cleaned = input.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      
      // Format as XX-0000-0000-0000
      if (cleaned.length <= 2) return cleaned
      if (cleaned.length <= 6) return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`
      if (cleaned.length <= 10) return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}-${cleaned.slice(10, 14)}`
    }

    const isValid = !validateFormat || (value.length > 0 && ippnsPatterns.standard.pattern.test(value.toUpperCase()))
    const showError = validateFormat && value.length > 0 && !isValid

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatValue(e.target.value)
      onChange?.(formatted)
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
            maxLength={17}
            className={cn(
              'w-full px-3 py-2 border rounded-md shadow-sm uppercase tracking-wider font-mono',
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
            placeholder="XX-0000-0000-0000"
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
          <p className="text-xs text-gray-500">{ippnsPatterns.standard.description}</p>
        )}

        {(error || showError) && (
          <p className="text-sm text-red-500">
            {error || 'Invalid IPPNS format'}
          </p>
        )}
        
        {helperText && !error && !showError && (
          <p className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

FormIppnsInput.displayName = 'FormIppnsInput'

export default FormIppnsInput
