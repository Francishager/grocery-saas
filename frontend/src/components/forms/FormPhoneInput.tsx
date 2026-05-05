import React, { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

export interface CountryCode {
  code: string
  dialCode: string
  name: string
  flag: string
}

const defaultCountryCodes: CountryCode[] = [
  { code: 'UG', dialCode: '+256', name: 'Uganda', flag: '🇺🇬' },
  { code: 'KE', dialCode: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: 'TZ', dialCode: '+255', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'RW', dialCode: '+250', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IN', dialCode: '+91', name: 'India', flag: '🇮🇳' },
  { code: 'NG', dialCode: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'ZA', dialCode: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: 'GH', dialCode: '+233', name: 'Ghana', flag: '🇬🇭' },
]

export interface FormPhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  value?: string
  onChange?: (value: string) => void
  countries?: CountryCode[]
  defaultCountry?: string
}

export const FormPhoneInput = forwardRef<HTMLInputElement, FormPhoneInputProps>(
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
      countries = defaultCountryCodes,
      defaultCountry = 'UG',
      disabled,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [selectedCountry, setSelectedCountry] = useState<CountryCode>(
      countries.find((c) => c.code === defaultCountry) || countries[0]
    )

    const inputId = id || `phone-${Math.random().toString(36).substr(2, 9)}`

    // Parse existing value to extract country code
    const phoneNumber = value.replace(selectedCountry.dialCode, '').trim()

    const handleCountrySelect = (country: CountryCode) => {
      setSelectedCountry(country)
      setIsOpen(false)
      const newPhone = phoneNumber.trim()
      onChange?.(newPhone ? `${country.dialCode} ${newPhone}` : '')
    }

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newPhone = e.target.value.replace(/[^0-9]/g, '')
      onChange?.(`${selectedCountry.dialCode} ${newPhone}`)
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
        
        <div className="flex">
          {/* Country Code Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => !disabled && setIsOpen(!isOpen)}
              className={cn(
                'flex items-center gap-1 px-3 py-2 border border-r-0 rounded-l-md',
                'bg-gray-50 hover:bg-gray-100',
                disabled && 'opacity-50 cursor-not-allowed',
                error ? 'border-red-500' : 'border-gray-300'
              )}
            >
              <span>{selectedCountry.flag}</span>
              <span className="text-sm">{selectedCountry.dialCode}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {isOpen && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto w-48">
                {countries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountrySelect(country)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100',
                      country.code === selectedCountry.code && 'bg-primary/10'
                    )}
                  >
                    <span>{country.flag}</span>
                    <span className="text-sm">{country.name}</span>
                    <span className="text-sm text-gray-500 ml-auto">
                      {country.dialCode}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Phone Number Input */}
          <input
            ref={ref}
            id={inputId}
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            disabled={disabled}
            className={cn(
              'flex-1 px-3 py-2 border rounded-r-md shadow-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
              'disabled:bg-gray-100 disabled:cursor-not-allowed',
              error
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300',
              className
            )}
            placeholder="Enter phone number"
            {...props}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {helperText && !error && <p className="text-sm text-gray-500">{helperText}</p>}
      </div>
    )
  }
)

FormPhoneInput.displayName = 'FormPhoneInput'

export default FormPhoneInput
