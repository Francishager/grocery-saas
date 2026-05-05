// Permission-related constants

export interface Permission {
  id: string
  name: string
  description: string
  category: string
  /** Whether this permission is for platform-level (SaaS Admin) only */
  isPlatformLevel?: boolean
  /** Whether this permission accesses business data */
  accessesBusinessData?: boolean
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  isSystem: boolean
  /** Whether this role is a platform-level role (SaaS Admin) */
  isPlatformRole?: boolean
}

// Permission categories
export const permissionCategories = [
  { id: 'platform', name: 'Platform Management', description: 'SaaS platform administration' },
  { id: 'tenants', name: 'Tenant Management', description: 'Business tenant management' },
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'sales', name: 'Sales' },
  { id: 'purchases', name: 'Purchases' },
  { id: 'inventory', name: 'Inventory' },
  { id: 'reports', name: 'Reports' },
  { id: 'users', name: 'Users & Access' },
  { id: 'settings', name: 'Settings' },
  { id: 'billing', name: 'Billing & Subscription' },
]

// All permissions
export const permissions: Permission[] = [
  // Platform Management (SaaS Admin only - no business data access)
  { id: 'platform_admin', name: 'Platform Admin', description: 'Full platform administration access', category: 'platform', isPlatformLevel: true },
  { id: 'view_all_tenants', name: 'View All Tenants', description: 'View all business tenants', category: 'tenants', isPlatformLevel: true },
  { id: 'manage_tenants', name: 'Manage Tenants', description: 'Create, edit, delete business tenants', category: 'tenants', isPlatformLevel: true },
  { id: 'suspend_tenants', name: 'Suspend Tenants', description: 'Suspend or activate business tenants', category: 'tenants', isPlatformLevel: true },
  { id: 'view_tenant_billing', name: 'View Tenant Billing', description: 'View tenant subscription and billing', category: 'billing', isPlatformLevel: true },
  { id: 'manage_tenant_billing', name: 'Manage Tenant Billing', description: 'Manage tenant subscriptions and payments', category: 'billing', isPlatformLevel: true },
  { id: 'invite_business_owners', name: 'Invite Business Owners', description: 'Send invitations to create business owner accounts', category: 'tenants', isPlatformLevel: true },
  { id: 'view_platform_analytics', name: 'View Platform Analytics', description: 'View platform-wide analytics and metrics', category: 'platform', isPlatformLevel: true },
  { id: 'manage_plans', name: 'Manage Subscription Plans', description: 'Create and edit subscription plans', category: 'billing', isPlatformLevel: true },
  { id: 'view_platform_users', name: 'View Platform Users', description: 'View all users across platform', category: 'users', isPlatformLevel: true },
  
  // Business Data Permissions (Tenant-level only)
  // Dashboard
  { id: 'view_dashboard', name: 'View Dashboard', description: 'View dashboard overview', category: 'dashboard', accessesBusinessData: true },
  
  // Sales
  { id: 'view_sales', name: 'View Sales', description: 'View sales list and details', category: 'sales', accessesBusinessData: true },
  { id: 'create_sales', name: 'Create Sales', description: 'Create new sales', category: 'sales', accessesBusinessData: true },
  { id: 'edit_sales', name: 'Edit Sales', description: 'Edit existing sales', category: 'sales', accessesBusinessData: true },
  { id: 'delete_sales', name: 'Delete Sales', description: 'Delete sales records', category: 'sales', accessesBusinessData: true },
  { id: 'refund_sales', name: 'Process Refunds', description: 'Process sales refunds', category: 'sales', accessesBusinessData: true },
  
  // Purchases
  { id: 'view_purchases', name: 'View Purchases', description: 'View purchases list and details', category: 'purchases', accessesBusinessData: true },
  { id: 'create_purchases', name: 'Create Purchases', description: 'Create new purchases', category: 'purchases', accessesBusinessData: true },
  { id: 'edit_purchases', name: 'Edit Purchases', description: 'Edit existing purchases', category: 'purchases', accessesBusinessData: true },
  { id: 'delete_purchases', name: 'Delete Purchases', description: 'Delete purchase records', category: 'purchases', accessesBusinessData: true },
  
  // Inventory
  { id: 'view_inventory', name: 'View Inventory', description: 'View inventory list and details', category: 'inventory', accessesBusinessData: true },
  { id: 'manage_inventory', name: 'Manage Inventory', description: 'Add, edit, delete inventory items', category: 'inventory', accessesBusinessData: true },
  { id: 'adjust_stock', name: 'Adjust Stock', description: 'Make stock adjustments', category: 'inventory', accessesBusinessData: true },
  { id: 'transfer_stock', name: 'Transfer Stock', description: 'Transfer stock between branches', category: 'inventory', accessesBusinessData: true },
  
  // Reports
  { id: 'view_reports', name: 'View Reports', description: 'View reports', category: 'reports', accessesBusinessData: true },
  { id: 'export_reports', name: 'Export Reports', description: 'Export reports to file', category: 'reports', accessesBusinessData: true },
  
  // Users (Tenant-level)
  { id: 'view_users', name: 'View Users', description: 'View users list', category: 'users', accessesBusinessData: true },
  { id: 'manage_users', name: 'Manage Users', description: 'Add, edit, delete users within tenant', category: 'users', accessesBusinessData: true },
  { id: 'assign_roles', name: 'Assign Roles', description: 'Assign roles to users', category: 'users', accessesBusinessData: true },
  
  // Settings (Tenant-level)
  { id: 'view_settings', name: 'View Settings', description: 'View settings', category: 'settings', accessesBusinessData: true },
  { id: 'manage_settings', name: 'Manage Settings', description: 'Modify settings', category: 'settings', accessesBusinessData: true },
  
  // Billing (Tenant-level - for business owners)
  { id: 'view_own_billing', name: 'View Own Billing', description: 'View own subscription and billing', category: 'billing' },
  { id: 'manage_own_billing', name: 'Manage Own Billing', description: 'Manage own subscription and payments', category: 'billing' },
]

// Business data permissions (for filtering)
export const businessDataPermissions = permissions
  .filter((p) => p.accessesBusinessData)
  .map((p) => p.id)

// Platform-level permissions (SaaS Admin only)
export const platformPermissions = permissions
  .filter((p) => p.isPlatformLevel)
  .map((p) => p.id)

// Predefined roles
export const roles: Role[] = [
  {
    id: 'saas_admin',
    name: 'SaaS Admin',
    description: 'Platform administrator - manages tenants but cannot access business data',
    isSystem: true,
    isPlatformRole: true,
    permissions: [
      'platform_admin',
      'view_all_tenants',
      'manage_tenants',
      'suspend_tenants',
      'view_tenant_billing',
      'manage_tenant_billing',
      'invite_business_owners',
      'view_platform_analytics',
      'manage_plans',
      'view_platform_users',
    ],
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
