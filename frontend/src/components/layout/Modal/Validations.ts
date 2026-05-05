// Validation schemas and utilities for modal forms

export interface ValidationRule {
  required?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  custom?: (value: any, formData?: Record<string, any>) => boolean
  message: string
}

export interface FieldValidation {
  [fieldName: string]: ValidationRule[]
}

// Common validation patterns
export const patterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[0-9]{10,15}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  numeric: /^[0-9]+$/,
}

// Common validation rules
export const commonValidations: FieldValidation = {
  name: [
    { required: true, message: 'Name is required' },
    { minLength: 2, message: 'Name must be at least 2 characters' },
    { maxLength: 100, message: 'Name cannot exceed 100 characters' },
  ],
  email: [
    { required: true, message: 'Email is required' },
    { pattern: patterns.email, message: 'Please enter a valid email address' },
  ],
  phone: [
    { pattern: patterns.phone, message: 'Please enter a valid phone number' },
  ],
  password: [
    { required: true, message: 'Password is required' },
    { minLength: 8, message: 'Password must be at least 8 characters' },
    { pattern: patterns.password, message: 'Password must contain uppercase, lowercase, and number' },
  ],
  confirmPassword: [
    { required: true, message: 'Please confirm your password' },
    { custom: (value, formData) => value === formData?.password, message: 'Passwords do not match' },
  ],
  price: [
    { required: true, message: 'Price is required' },
    { min: 0, message: 'Price must be greater than or equal to 0' },
  ],
  quantity: [
    { required: true, message: 'Quantity is required' },
    { min: 0, message: 'Quantity must be greater than or equal to 0' },
  ],
}

// User form validation
export const userFormValidations: FieldValidation = {
  ...commonValidations,
  name: commonValidations.name,
  email: commonValidations.email,
  phone: commonValidations.phone,
  role: [{ required: true, message: 'Role is required' }],
}

// Product form validation
export const productFormValidations: FieldValidation = {
  ...commonValidations,
  name: commonValidations.name,
  sku: [
    { required: true, message: 'SKU is required' },
    { pattern: patterns.alphanumeric, message: 'SKU must be alphanumeric' },
  ],
  category: [{ required: true, message: 'Category is required' }],
  price: commonValidations.price,
  quantity: commonValidations.quantity,
}

// Validate a single field
export const validateField = (
  fieldName: string,
  value: any,
  formData?: Record<string, any>,
  validations?: FieldValidation
): string | null => {
  const rules = validations?.[fieldName] || commonValidations[fieldName]
  if (!rules) return null

  for (const rule of rules) {
    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      return rule.message
    }

    // Skip other checks if value is empty and not required
    if (value === undefined || value === null || value === '') {
      continue
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

// Validate entire form
export const validateForm = (
  data: Record<string, any>,
  validations?: FieldValidation
): Record<string, string> => {
  const errors: Record<string, string> = {}
  const validationSet = validations || commonValidations

  Object.keys(validationSet).forEach((fieldName) => {
    const error = validateField(fieldName, data[fieldName], data, validationSet)
    if (error) {
      errors[fieldName] = error
    }
  })

  return errors
}

// Check if form has errors
export const hasErrors = (errors: Record<string, string>): boolean => {
  return Object.keys(errors).length > 0
}

// Get first error message
export const getFirstError = (errors: Record<string, string>): string | null => {
  const keys = Object.keys(errors)
  return keys.length > 0 ? errors[keys[0]] : null
}

export default commonValidations
