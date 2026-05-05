// Branch configuration constants

export interface BranchConfig {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  manager?: string
  status: 'active' | 'inactive'
  isHeadquarters?: boolean
  settings: BranchSettings
}

export interface BranchSettings {
  currency: string
  taxRate: number
  timezone: string
  dateFormat: string
  receiptFooter?: string
  lowStockThreshold: number
  enableInventory: boolean
  enableSales: boolean
  enablePurchases: boolean
}

// Default branch settings
export const defaultBranchSettings: BranchSettings = {
  currency: 'UGX',
  taxRate: 18,
  timezone: 'Africa/Kampala',
  dateFormat: 'DD/MM/YYYY',
  lowStockThreshold: 10,
  enableInventory: true,
  enableSales: true,
  enablePurchases: true,
}

// Branch configurations
export const branchConfigs: BranchConfig[] = [
  {
    id: 'branch-1',
    name: 'Main Branch',
    code: 'HQ',
    address: 'Kampala, Uganda',
    phone: '+256 700 123456',
    email: 'main@grocery.com',
    manager: 'John Doe',
    status: 'active',
    isHeadquarters: true,
    settings: defaultBranchSettings,
  },
  {
    id: 'branch-2',
    name: 'Downtown Branch',
    code: 'DT',
    address: 'Downtown Kampala',
    phone: '+256 700 234567',
    email: 'downtown@grocery.com',
    manager: 'Jane Smith',
    status: 'active',
    settings: {
      ...defaultBranchSettings,
      lowStockThreshold: 15,
    },
  },
]

// Branch status options
export const branchStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

// Timezone options
export const timezoneOptions = [
  { value: 'Africa/Kampala', label: 'East Africa Time (EAT)' },
  { value: 'Africa/Nairobi', label: 'East Africa Time (Nairobi)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
]

// Date format options
export const dateFormatOptions = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
]

// Get branch by ID
export const getBranchById = (id: string): BranchConfig | undefined => {
  return branchConfigs.find((branch) => branch.id === id)
}

// Get branch by code
export const getBranchByCode = (code: string): BranchConfig | undefined => {
  return branchConfigs.find((branch) => branch.code === code)
}

// Get active branches
export const getActiveBranches = (): BranchConfig[] => {
  return branchConfigs.filter((branch) => branch.status === 'active')
}

// Get headquarters
export const getHeadquarters = (): BranchConfig | undefined => {
  return branchConfigs.find((branch) => branch.isHeadquarters)
}

export default branchConfigs
