// User type constants

export interface UserType {
  id: string
  name: string
  description?: string
}

export interface UserStatus {
  id: string
  name: string
  color: string
}

// User types
export const userTypes: UserType[] = [
  { id: 'staff', name: 'Staff', description: 'Internal staff member' },
  { id: 'customer', name: 'Customer', description: 'Customer account' },
  { id: 'supplier', name: 'Supplier', description: 'Supplier contact' },
  { id: 'admin', name: 'Admin', description: 'System administrator' },
]

// User statuses
export const userStatuses: UserStatus[] = [
  { id: 'active', name: 'Active', color: 'green' },
  { id: 'inactive', name: 'Inactive', color: 'gray' },
  { id: 'pending', name: 'Pending', color: 'yellow' },
  { id: 'suspended', name: 'Suspended', color: 'red' },
  { id: 'locked', name: 'Locked', color: 'orange' },
]

// User type options for select
export const userTypeOptions = userTypes.map((type) => ({
  value: type.id,
  label: type.name,
}))

// User status options for select
export const userStatusOptions = userStatuses.map((status) => ({
  value: status.id,
  label: status.name,
}))

// Gender options
export const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

// Language options
export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Swahili' },
  { value: 'lg', label: 'Luganda' },
  { value: 'fr', label: 'French' },
]

// Timezone options
export const timezoneOptions = [
  { value: 'Africa/Kampala', label: 'East Africa Time (Kampala)' },
  { value: 'Africa/Nairobi', label: 'East Africa Time (Nairobi)' },
  { value: 'UTC', label: 'UTC' },
]

// Default user preferences
export const defaultUserPreferences = {
  language: 'en',
  timezone: 'Africa/Kampala',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  currency: 'UGX',
  notifications: {
    email: true,
    push: true,
    sms: false,
  },
  theme: 'light',
  sidebarCollapsed: false,
}

// Password requirements
export const passwordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: false,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
}

// Session settings
export const sessionSettings = {
  maxSessions: 5,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  rememberMeDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
  passwordExpiryDays: 90,
  passwordHistoryCount: 5,
}

// Get user type by ID
export const getUserTypeById = (id: string): UserType | undefined => {
  return userTypes.find((type) => type.id === id)
}

// Get user status by ID
export const getUserStatusById = (id: string): UserStatus | undefined => {
  return userStatuses.find((status) => status.id === id)
}

// Validate password
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (password.length < passwordRequirements.minLength) {
    errors.push(`Password must be at least ${passwordRequirements.minLength} characters`)
  }

  if (passwordRequirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (passwordRequirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (passwordRequirements.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (passwordRequirements.requireSpecialChar && !new RegExp(`[${passwordRequirements.specialChars}]`).test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export default userTypes
