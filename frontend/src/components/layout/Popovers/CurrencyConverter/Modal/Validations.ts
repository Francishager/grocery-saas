// Validation schemas for Currency Converter

export interface ValidationRule {
  required?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: any) => boolean
  message: string
}

export interface FieldValidation {
  [fieldName: string]: ValidationRule[]
}

export const currencyConverterValidations: FieldValidation = {
  fromCurrency: [
    {
      required: true,
      message: 'Please select a source currency',
    },
  ],
  toCurrency: [
    {
      required: true,
      message: 'Please select a target currency',
    },
    {
      custom: (value, formData) => value !== formData?.fromCurrency,
      message: 'Source and target currencies must be different',
    },
  ],
  amount: [
    {
      required: true,
      message: 'Please enter an amount',
    },
    {
      min: 0.01,
      message: 'Amount must be greater than 0',
    },
    {
      max: 1000000000,
      message: 'Amount is too large',
    },
    {
      pattern: /^\d+\.?\d*$/,
      message: 'Please enter a valid number',
    },
  ],
}

export const validateField = (
  fieldName: string,
  value: any,
  formData?: Record<string, any>
): string | null => {
  const rules = currencyConverterValidations[fieldName]
  if (!rules) return null

  for (const rule of rules) {
    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      return rule.message
    }

    // Min check
    if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
      return rule.message
    }

    // Max check
    if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
      return rule.message
    }

    // MinLength check
    if (rule.minLength !== undefined && typeof value === 'string' && value.length < rule.minLength) {
      return rule.message
    }

    // MaxLength check
    if (rule.maxLength !== undefined && typeof value === 'string' && value.length > rule.maxLength) {
      return rule.message
    }

    // Pattern check
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      return rule.message
    }

    // Custom check
    if (rule.custom && !rule.custom(value, formData)) {
      return rule.message
    }
  }

  return null
}

export const validateForm = (
  data: Record<string, any>
): Record<string, string> => {
  const errors: Record<string, string> = {}

  Object.keys(currencyConverterValidations).forEach((fieldName) => {
    const error = validateField(fieldName, data[fieldName], data)
    if (error) {
      errors[fieldName] = error
    }
  })

  return errors
}

export default currencyConverterValidations
