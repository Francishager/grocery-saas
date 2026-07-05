// Form field configurations for modal forms

export interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'email' | 'password' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'date' | 'hidden'
  placeholder?: string
  required?: boolean
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
  defaultValue?: string | number | boolean
  validation?: {
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    message?: string
  }
  className?: string
  span?: number // for grid layout
}

export interface FormSection {
  title?: string
  description?: string
  fields: FormField[]
}

// Common form field configurations
export const commonFormFields: Record<string, FormField> = {
  name: {
    name: 'name',
    label: 'Name',
    type: 'text',
    placeholder: 'Enter name',
    required: true,
    validation: {
      minLength: 2,
      maxLength: 100,
      message: 'Name must be between 2 and 100 characters',
    },
  },
  email: {
    name: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'Enter email address',
    required: true,
    validation: {
      pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      message: 'Please enter a valid email address',
    },
  },
  phone: {
    name: 'phone',
    label: 'Phone Number',
    type: 'text',
    placeholder: 'Enter phone number',
    validation: {
      pattern: '^\\+?[0-9]{10,15}$',
      message: 'Please enter a valid phone number',
    },
  },
  description: {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Enter description',
    validation: {
      maxLength: 500,
      message: 'Description cannot exceed 500 characters',
    },
  },
  status: {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'pending', label: 'Pending' },
    ],
    defaultValue: 'active',
  },
}

// User form fields
export const userFormFields: FormField[] = [
  commonFormFields.name,
  commonFormFields.email,
  commonFormFields.phone,
  {
    name: 'role',
    label: 'Role',
    type: 'select',
    required: true,
    options: [
      { value: 'owner', label: 'Owner' },
      { value: 'accountant', label: 'Accountant' },
      { value: 'attendant', label: 'Attendant' },
    ],
  },
  commonFormFields.status,
]

// Product form fields
export const productFormFields: FormField[] = [
  commonFormFields.name,
  {
    name: 'sku',
    label: 'SKU',
    type: 'text',
    placeholder: 'Enter SKU',
    required: true,
  },
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: [], // To be populated dynamically
  },
  {
    name: 'price',
    label: 'Price',
    type: 'number',
    placeholder: 'Enter price',
    required: true,
    validation: {
      min: 0,
      message: 'Price must be greater than or equal to 0',
    },
  },
  {
    name: 'quantity',
    label: 'Quantity',
    type: 'number',
    placeholder: 'Enter quantity',
    required: true,
    validation: {
      min: 0,
      message: 'Quantity must be greater than or equal to 0',
    },
  },
  commonFormFields.description,
]

// Business settings form fields
export const businessSettingsFormFields: FormField[] = [
  {
    name: 'businessName',
    label: 'Business Name',
    type: 'text',
    placeholder: 'Enter business name',
    required: true,
    span: 2,
  },
  {
    name: 'businessType',
    label: 'Business Type',
    type: 'select',
    required: true,
    options: [
      { value: 'retail', label: 'Retail Store' },
      { value: 'pharmacy', label: 'Pharmacy' },
      { value: 'hardware', label: 'Hardware Store' },
      { value: 'supermarket', label: 'Supermarket' },
      { value: 'wholesale', label: 'Wholesale' },
      { value: 'restaurant', label: 'Restaurant' },
      { value: 'bar', label: 'Bar' },
      { value: 'restaurant_bar', label: 'Restaurant & Bar' },
      { value: 'cafe', label: 'Cafe' },
      { value: 'coffee_shop', label: 'Coffee Shop' },
      { value: 'fast_food', label: 'Fast Food' },
      { value: 'hotel_restaurant', label: 'Hotel Restaurant' },
      { value: 'bakery', label: 'Bakery' },
      { value: 'service', label: 'Service Business' },
      { value: 'salon_spa', label: 'Salon & Spa' },
      { value: 'repair_shop', label: 'Repair Shop' },
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'other', label: 'Other' },
    ],
  },
  commonFormFields.phone,
  commonFormFields.email,
  {
    name: 'address',
    label: 'Address',
    type: 'textarea',
    placeholder: 'Enter business address',
    span: 2,
  },
  {
    name: 'currency',
    label: 'Default Currency',
    type: 'select',
    required: true,
    options: [
      { value: 'UGX', label: 'UGX - Ugandan Shilling' },
      { value: 'USD', label: 'USD - US Dollar' },
      { value: 'KES', label: 'KES - Kenyan Shilling' },
    ],
  },
  {
    name: 'taxRate',
    label: 'Tax Rate (%)',
    type: 'number',
    placeholder: 'Enter tax rate',
    validation: {
      min: 0,
      max: 100,
      message: 'Tax rate must be between 0 and 100',
    },
  },
]

export default commonFormFields
