// Permission-related constants

export interface Permission {
  id: string
  name: string
  description: string
  category: string
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  isSystem: boolean
}

// Permission categories
export const permissionCategories = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'sales', name: 'Sales' },
  { id: 'purchases', name: 'Purchases' },
  { id: 'inventory', name: 'Inventory' },
  { id: 'reports', name: 'Reports' },
  { id: 'users', name: 'Users & Access' },
  { id: 'settings', name: 'Settings' },
  { id: 'admin', name: 'Administration' },
]

// All permissions
export const permissions: Permission[] = [
  // Dashboard
  { id: 'view_dashboard', name: 'View Dashboard', description: 'View dashboard overview', category: 'dashboard' },
  
  // Sales
  { id: 'view_sales', name: 'View Sales', description: 'View sales list and details', category: 'sales' },
  { id: 'create_sales', name: 'Create Sales', description: 'Create new sales', category: 'sales' },
  { id: 'edit_sales', name: 'Edit Sales', description: 'Edit existing sales', category: 'sales' },
  { id: 'delete_sales', name: 'Delete Sales', description: 'Delete sales records', category: 'sales' },
  { id: 'refund_sales', name: 'Process Refunds', description: 'Process sales refunds', category: 'sales' },
  
  // Purchases
  { id: 'view_purchases', name: 'View Purchases', description: 'View purchases list and details', category: 'purchases' },
  { id: 'create_purchases', name: 'Create Purchases', description: 'Create new purchases', category: 'purchases' },
  { id: 'edit_purchases', name: 'Edit Purchases', description: 'Edit existing purchases', category: 'purchases' },
  { id: 'delete_purchases', name: 'Delete Purchases', description: 'Delete purchase records', category: 'purchases' },
  
  // Inventory
  { id: 'view_inventory', name: 'View Inventory', description: 'View inventory list and details', category: 'inventory' },
  { id: 'manage_inventory', name: 'Manage Inventory', description: 'Add, edit, delete inventory items', category: 'inventory' },
  { id: 'adjust_stock', name: 'Adjust Stock', description: 'Make stock adjustments', category: 'inventory' },
  { id: 'transfer_stock', name: 'Transfer Stock', description: 'Transfer stock between branches', category: 'inventory' },
  
  // Reports
  { id: 'view_reports', name: 'View Reports', description: 'View reports', category: 'reports' },
  { id: 'export_reports', name: 'Export Reports', description: 'Export reports to file', category: 'reports' },
  
  // Users
  { id: 'view_users', name: 'View Users', description: 'View users list', category: 'users' },
  { id: 'manage_users', name: 'Manage Users', description: 'Add, edit, delete users', category: 'users' },
  { id: 'assign_roles', name: 'Assign Roles', description: 'Assign roles to users', category: 'users' },
  
  // Settings
  { id: 'view_settings', name: 'View Settings', description: 'View settings', category: 'settings' },
  { id: 'manage_settings', name: 'Manage Settings', description: 'Modify settings', category: 'settings' },
  
  // Admin
  { id: 'admin_access', name: 'Admin Access', description: 'Full administrative access', category: 'admin' },
  { id: 'manage_billing', name: 'Manage Billing', description: 'Manage subscription and billing', category: 'admin' },
]

// Predefined roles
export const roles: Role[] = [
  {
    id: 'saas_admin',
    name: 'SaaS Admin',
    description: 'Full system administrator',
    isSystem: true,
    permissions: permissions.map((p) => p.id),
  },
  {
    id: 'owner',
    name: 'Owner',
    description: 'Business owner with full access',
    isSystem: true,
    permissions: [
      'view_dashboard',
      'view_sales', 'create_sales', 'edit_sales', 'delete_sales', 'refund_sales',
      'view_purchases', 'create_purchases', 'edit_purchases', 'delete_purchases',
      'view_inventory', 'manage_inventory', 'adjust_stock', 'transfer_stock',
      'view_reports', 'export_reports',
      'view_users', 'manage_users', 'assign_roles',
      'view_settings', 'manage_settings',
    ],
  },
  {
    id: 'accountant',
    name: 'Accountant',
    description: 'Financial management access',
    isSystem: true,
    permissions: [
      'view_dashboard',
      'view_sales', 'view_purchases',
      'view_inventory',
      'view_reports', 'export_reports',
      'view_settings',
    ],
  },
  {
    id: 'attendant',
    name: 'Attendant',
    description: 'Sales and basic inventory access',
    isSystem: true,
    permissions: [
      'view_dashboard',
      'view_sales', 'create_sales',
      'view_inventory',
    ],
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Branch manager access',
    isSystem: false,
    permissions: [
      'view_dashboard',
      'view_sales', 'create_sales', 'edit_sales',
      'view_purchases', 'create_purchases', 'edit_purchases',
      'view_inventory', 'manage_inventory', 'adjust_stock',
      'view_reports',
      'view_users',
    ],
  },
]

// Permission options for select
export const permissionOptions = permissions.map((p) => ({
  value: p.id,
  label: p.name,
  category: p.category,
}))

// Role options for select
export const roleOptions = roles.map((r) => ({
  value: r.id,
  label: r.name,
}))

// Get permission by ID
export const getPermissionById = (id: string): Permission | undefined => {
  return permissions.find((p) => p.id === id)
}

// Get role by ID
export const getRoleById = (id: string): Role | undefined => {
  return roles.find((r) => r.id === id)
}

// Get permissions by category
export const getPermissionsByCategory = (category: string): Permission[] => {
  return permissions.filter((p) => p.category === category)
}

// Get role permissions
export const getRolePermissions = (roleId: string): string[] => {
  const role = getRoleById(roleId)
  return role?.permissions || []
}

// Check if role has permission
export const hasPermission = (roleId: string, permissionId: string): boolean => {
  const rolePermissions = getRolePermissions(roleId)
  return rolePermissions.includes(permissionId)
}

export default permissions
