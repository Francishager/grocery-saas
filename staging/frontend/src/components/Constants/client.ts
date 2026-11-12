// Client-related constants

export interface ClientType {
  id: string
  name: string
  description?: string
}

export interface ClientStatus {
  id: string
  name: string
  color: string
}

// Client types
export const clientTypes: ClientType[] = [
  { id: 'individual', name: 'Individual', description: 'Individual customer' },
  { id: 'business', name: 'Business', description: 'Business entity' },
  { id: 'wholesale', name: 'Wholesale', description: 'Wholesale buyer' },
  { id: 'retail', name: 'Retail', description: 'Retail customer' },
]

// Client statuses
export const clientStatuses: ClientStatus[] = [
  { id: 'active', name: 'Active', color: 'green' },
  { id: 'inactive', name: 'Inactive', color: 'gray' },
  { id: 'pending', name: 'Pending', color: 'yellow' },
  { id: 'blocked', name: 'Blocked', color: 'red' },
]

// Client type options for select
export const clientTypeOptions = clientTypes.map((type) => ({
  value: type.id,
  label: type.name,
}))

// Client status options for select
export const clientStatusOptions = clientStatuses.map((status) => ({
  value: status.id,
  label: status.name,
}))

// Default client settings
export const defaultClientSettings = {
  creditLimit: 0,
  paymentTerms: 30, // days
  discountRate: 0,
  enableLoyalty: false,
  loyaltyPoints: 0,
}

// Payment terms options
export const paymentTermsOptions = [
  { value: 0, label: 'Due on receipt' },
  { value: 7, label: 'Net 7' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
  { value: 90, label: 'Net 90' },
]

// Client account types
export const clientAccountTypes = [
  { value: 'cash', label: 'Cash Account' },
  { value: 'credit', label: 'Credit Account' },
  { value: 'deposit', label: 'Deposit Account' },
]

// Get client type by ID
export const getClientTypeById = (id: string): ClientType | undefined => {
  return clientTypes.find((type) => type.id === id)
}

// Get client status by ID
export const getClientStatusById = (id: string): ClientStatus | undefined => {
  return clientStatuses.find((status) => status.id === id)
}

export default clientTypes
