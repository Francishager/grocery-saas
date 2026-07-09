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
  { id: 'purchases', name: 'Purchases / Payables' },
  { id: 'inventory', name: 'Inventory' },
  { id: 'expenses', name: 'Expenses' },
  { id: 'customers', name: 'Customers / Receivables' },
  { id: 'suppliers', name: 'Suppliers' },
  { id: 'reports', name: 'Reports' },
  { id: 'users', name: 'Staff & Access' },
  { id: 'branches', name: 'Branches' },
  { id: 'settings', name: 'Settings' },
  { id: 'receipts', name: 'Receipts' },
  { id: 'tax', name: 'Tax' },
  { id: 'services', name: 'Services' },
  { id: 'rentals', name: 'Rentals' },
  { id: 'restaurant', name: 'Restaurant & Bar' },
  { id: 'fuel_station', name: 'Fuel Station' },
  { id: 'manufacturing', name: 'Manufacturing' },
  { id: 'agriculture', name: 'Agriculture' },
  { id: 'service_business', name: 'Service Business' },
  { id: 'communication', name: 'Communication' },
  { id: 'accounting', name: 'Accounting' },
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
  { id: 'canViewDashboard', name: 'View Dashboard', description: 'View dashboard overview', category: 'dashboard', accessesBusinessData: true },
  
  // Sales
  { id: 'canViewSale', name: 'View Sales', description: 'View sales list and details', category: 'sales', accessesBusinessData: true },
  { id: 'canCreateSale', name: 'Create Sales', description: 'Create new sales', category: 'sales', accessesBusinessData: true },
  { id: 'canEditSale', name: 'Edit Sales', description: 'Edit existing sales', category: 'sales', accessesBusinessData: true },
  { id: 'canDeleteSale', name: 'Delete Sales', description: 'Delete sales records', category: 'sales', accessesBusinessData: true },
  { id: 'canRefundSale', name: 'Process Refunds', description: 'Process sales refunds', category: 'sales', accessesBusinessData: true },
  
  // Purchases / Payables
  { id: 'canViewPurchase', name: 'View Purchases', description: 'View purchases list and details', category: 'purchases', accessesBusinessData: true },
  { id: 'canCreatePurchase', name: 'Create Purchases', description: 'Create new purchases', category: 'purchases', accessesBusinessData: true },
  { id: 'canEditPurchase', name: 'Edit Purchases', description: 'Edit existing purchases', category: 'purchases', accessesBusinessData: true },
  { id: 'canDeletePurchase', name: 'Delete Purchases', description: 'Delete purchase records', category: 'purchases', accessesBusinessData: true },
  
  // Payables
  { id: 'canViewPayable', name: 'View Payables', description: 'View payables list and details', category: 'purchases', accessesBusinessData: true },
  { id: 'canCreatePayable', name: 'Create Payables', description: 'Create new payables', category: 'purchases', accessesBusinessData: true },
  { id: 'canEditPayable', name: 'Edit Payables', description: 'Edit existing payables', category: 'purchases', accessesBusinessData: true },
  { id: 'canDeletePayable', name: 'Delete Payables', description: 'Delete payable records', category: 'purchases', accessesBusinessData: true },
  
  // Inventory
  { id: 'canViewProduct', name: 'View Inventory', description: 'View inventory list and details', category: 'inventory', accessesBusinessData: true },
  { id: 'canCreateProduct', name: 'Create Products', description: 'Add new inventory items', category: 'inventory', accessesBusinessData: true },
  { id: 'canEditProduct', name: 'Edit Products', description: 'Edit inventory items', category: 'inventory', accessesBusinessData: true },
  { id: 'canDeleteProduct', name: 'Delete Products', description: 'Delete inventory items', category: 'inventory', accessesBusinessData: true },
  { id: 'canAdjustStock', name: 'Adjust Stock', description: 'Make stock adjustments', category: 'inventory', accessesBusinessData: true },
  { id: 'canTransferStock', name: 'Transfer Stock', description: 'Transfer stock between branches', category: 'inventory', accessesBusinessData: true },
  
  // Expenses
  { id: 'canViewExpense', name: 'View Expense Records', description: 'View expense records and details', category: 'expenses', accessesBusinessData: true },
  { id: 'canCreateExpense', name: 'Create Expense Records', description: 'Create new expense records', category: 'expenses', accessesBusinessData: true },
  { id: 'canEditExpense', name: 'Edit Expense Records', description: 'Edit existing expense records', category: 'expenses', accessesBusinessData: true },
  { id: 'canDeleteExpense', name: 'Delete Expense Records', description: 'Delete expense records', category: 'expenses', accessesBusinessData: true },
  { id: 'canViewStaffTillSheet', name: 'View Staff Till Sheet', description: 'View staff till sheet and cash movement summary', category: 'accounting', accessesBusinessData: true },
  
  // Customers / Receivables
  { id: 'canViewCustomer', name: 'View Customers', description: 'View customers list', category: 'customers', accessesBusinessData: true },
  { id: 'canCreateCustomer', name: 'Create Customers', description: 'Create new customers', category: 'customers', accessesBusinessData: true },
  { id: 'canEditCustomer', name: 'Edit Customers', description: 'Edit existing customers', category: 'customers', accessesBusinessData: true },
  { id: 'canDeleteCustomer', name: 'Delete Customers', description: 'Delete customer records', category: 'customers', accessesBusinessData: true },
  
  // Receivables
  { id: 'canViewReceivable', name: 'View Receivables', description: 'View receivables list and details', category: 'customers', accessesBusinessData: true },
  { id: 'canCreateReceivable', name: 'Create Receivables', description: 'Create new receivables', category: 'customers', accessesBusinessData: true },
  { id: 'canEditReceivable', name: 'Edit Receivables', description: 'Edit existing receivables', category: 'customers', accessesBusinessData: true },
  { id: 'canDeleteReceivable', name: 'Delete Receivables', description: 'Delete receivable records', category: 'customers', accessesBusinessData: true },
  
  // Suppliers
  { id: 'canViewSupplier', name: 'View Suppliers', description: 'View suppliers list', category: 'suppliers', accessesBusinessData: true },
  { id: 'canCreateSupplier', name: 'Create Suppliers', description: 'Create new suppliers', category: 'suppliers', accessesBusinessData: true },
  { id: 'canEditSupplier', name: 'Edit Suppliers', description: 'Edit existing suppliers', category: 'suppliers', accessesBusinessData: true },
  { id: 'canDeleteSupplier', name: 'Delete Suppliers', description: 'Delete supplier records', category: 'suppliers', accessesBusinessData: true },
  
  // Reports (granular)
  { id: 'canViewSalesReport', name: 'View Sales Reports', description: 'View sales reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewInventoryReport', name: 'View Inventory Reports', description: 'View inventory reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewFinancialReport', name: 'View Financial Reports', description: 'View financial reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewCustomerReport', name: 'View Customer Reports', description: 'View customer reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewSupplierReport', name: 'View Supplier Reports', description: 'View supplier reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewReceivablesReport', name: 'View Receivables Reports', description: 'View receivables reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewPayablesReport', name: 'View Payables Reports', description: 'View payables reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewPerformanceReport', name: 'View Performance Reports', description: 'View business performance reports', category: 'reports', accessesBusinessData: true },
  { id: 'canViewAuditReport', name: 'View Audit Reports', description: 'View audit log reports', category: 'reports', accessesBusinessData: true },
  { id: 'canExportReport', name: 'Export Reports', description: 'Export reports to file', category: 'reports', accessesBusinessData: true },
  
  // Staff (Tenant-level)
  { id: 'canViewStaff', name: 'View Staff', description: 'View staff list', category: 'users', accessesBusinessData: true },
  { id: 'canCreateStaff', name: 'Create Staff', description: 'Add new staff members', category: 'users', accessesBusinessData: true },
  { id: 'canEditStaff', name: 'Edit Staff', description: 'Edit staff details', category: 'users', accessesBusinessData: true },
  { id: 'canDeleteStaff', name: 'Delete Staff', description: 'Delete staff members', category: 'users', accessesBusinessData: true },
  
  // Branches
  { id: 'canViewBranch', name: 'View Branches', description: 'View branches list', category: 'branches', accessesBusinessData: true },
  { id: 'canCreateBranch', name: 'Create Branches', description: 'Create new branches', category: 'branches', accessesBusinessData: true },
  { id: 'canEditBranch', name: 'Edit Branches', description: 'Edit existing branches', category: 'branches', accessesBusinessData: true },
  { id: 'canDeleteBranch', name: 'Delete Branches', description: 'Delete branches', category: 'branches', accessesBusinessData: true },
  
  // Settings (Tenant-level)
  { id: 'canViewSettings', name: 'View Settings', description: 'View settings', category: 'settings', accessesBusinessData: true },
  { id: 'canEditSettings', name: 'Edit Settings', description: 'Modify settings', category: 'settings', accessesBusinessData: true },
  
  // Receipts
  { id: 'canViewReceipt', name: 'View Receipts', description: 'View and print receipts', category: 'receipts', accessesBusinessData: true },
  { id: 'canCreateReceipt', name: 'Create Receipts', description: 'Generate receipts', category: 'receipts', accessesBusinessData: true },
  
  // Discounts
  { id: 'canGiveDiscount', name: 'Give Discounts', description: 'Apply discounts to sales', category: 'sales', accessesBusinessData: true },
  
  // Tax
  { id: 'canViewTax', name: 'View Tax', description: 'View tax settings', category: 'tax', accessesBusinessData: true },
  { id: 'canManageTax', name: 'Manage Tax', description: 'Modify tax settings', category: 'tax', accessesBusinessData: true },

  // Services
  { id: 'canViewService', name: 'View Services', description: 'View service items', category: 'services', accessesBusinessData: true },
  { id: 'canCreateService', name: 'Create Services', description: 'Create new service items', category: 'services', accessesBusinessData: true },
  { id: 'canEditService', name: 'Edit Services', description: 'Edit existing service items', category: 'services', accessesBusinessData: true },
  { id: 'canDeleteService', name: 'Delete Services', description: 'Delete service items', category: 'services', accessesBusinessData: true },
  { id: 'canManageServiceCategory', name: 'Manage Service Categories', description: 'Create and edit service categories', category: 'services', accessesBusinessData: true },
  { id: 'canViewServiceReport', name: 'View Service Reports', description: 'View service-related reports', category: 'services', accessesBusinessData: true },

  // Rentals / Hire
  { id: 'canViewRental', name: 'View Rentals', description: 'View rental/hire records', category: 'rentals', accessesBusinessData: true },
  { id: 'canCreateRental', name: 'Create Rentals', description: 'Hire out items to customers', category: 'rentals', accessesBusinessData: true },
  { id: 'canEditRental', name: 'Edit Rentals', description: 'Edit existing rental records', category: 'rentals', accessesBusinessData: true },
  { id: 'canDeleteRental', name: 'Cancel Rentals', description: 'Cancel rental bookings', category: 'rentals', accessesBusinessData: true },
  { id: 'canProcessRentalReturn', name: 'Process Returns', description: 'Process return of hired items', category: 'rentals', accessesBusinessData: true },
  { id: 'canViewRentalReport', name: 'View Rental Reports', description: 'View rental-related reports', category: 'rentals', accessesBusinessData: true },
  
  // Restaurant & Bar
  { id: 'canViewRestaurant', name: 'View Restaurant', description: 'Access restaurant & bar module', category: 'restaurant', accessesBusinessData: true },
  { id: 'canCreateRestaurant', name: 'Create Restaurant', description: 'Create restaurant orders, tables, reservations', category: 'restaurant', accessesBusinessData: true },
  { id: 'canEditRestaurant', name: 'Edit Restaurant', description: 'Edit restaurant orders and settings', category: 'restaurant', accessesBusinessData: true },
  { id: 'canDeleteRestaurant', name: 'Delete Restaurant', description: 'Delete restaurant records', category: 'restaurant', accessesBusinessData: true },
  { id: 'canViewRestaurantReport', name: 'View Restaurant Reports', description: 'View restaurant-related reports', category: 'restaurant', accessesBusinessData: true },

  // Fuel Station
  { id: 'canViewFuelStation', name: 'View Fuel Station', description: 'Access fuel station module', category: 'fuel_station', accessesBusinessData: true },
  { id: 'canCreateFuelStation', name: 'Create Fuel Station', description: 'Create pumps, tanks, deliveries, shifts', category: 'fuel_station', accessesBusinessData: true },
  { id: 'canEditFuelStation', name: 'Edit Fuel Station', description: 'Edit fuel station records', category: 'fuel_station', accessesBusinessData: true },
  { id: 'canDeleteFuelStation', name: 'Delete Fuel Station', description: 'Delete fuel station records', category: 'fuel_station', accessesBusinessData: true },
  { id: 'canViewFuelStationReport', name: 'View Fuel Station Reports', description: 'View fuel station reports', category: 'fuel_station', accessesBusinessData: true },

  // Manufacturing
  { id: 'canViewManufacturing', name: 'View Manufacturing', description: 'Access manufacturing module', category: 'manufacturing', accessesBusinessData: true },
  { id: 'canCreateManufacturing', name: 'Create Manufacturing', description: 'Create production orders, waste records, BOMs', category: 'manufacturing', accessesBusinessData: true },
  { id: 'canEditManufacturing', name: 'Edit Manufacturing', description: 'Edit manufacturing records', category: 'manufacturing', accessesBusinessData: true },
  { id: 'canDeleteManufacturing', name: 'Delete Manufacturing', description: 'Delete manufacturing records', category: 'manufacturing', accessesBusinessData: true },
  { id: 'canViewManufacturingReport', name: 'View Manufacturing Reports', description: 'View manufacturing reports', category: 'manufacturing', accessesBusinessData: true },

  // Agriculture
  { id: 'canViewAgriculture', name: 'View Agriculture', description: 'Access agriculture module', category: 'agriculture', accessesBusinessData: true },
  { id: 'canCreateAgriculture', name: 'Create Agriculture', description: 'Create fields, livestock, harvests, expenses', category: 'agriculture', accessesBusinessData: true },
  { id: 'canEditAgriculture', name: 'Edit Agriculture', description: 'Edit agriculture records', category: 'agriculture', accessesBusinessData: true },
  { id: 'canDeleteAgriculture', name: 'Delete Agriculture', description: 'Delete agriculture records', category: 'agriculture', accessesBusinessData: true },
  { id: 'canViewAgricultureReport', name: 'View Agriculture Reports', description: 'View agriculture reports', category: 'agriculture', accessesBusinessData: true },

  // Service Business (appointments, work orders, contracts)
  { id: 'canViewServiceBusiness', name: 'View Service Business', description: 'Access service business module', category: 'service_business', accessesBusinessData: true },
  { id: 'canCreateServiceBusiness', name: 'Create Service Business', description: 'Create appointments, work orders, contracts', category: 'service_business', accessesBusinessData: true },
  { id: 'canEditServiceBusiness', name: 'Edit Service Business', description: 'Edit service business records', category: 'service_business', accessesBusinessData: true },
  { id: 'canDeleteServiceBusiness', name: 'Delete Service Business', description: 'Delete service business records', category: 'service_business', accessesBusinessData: true },
  { id: 'canViewServiceBusinessReport', name: 'View Service Business Reports', description: 'View service business reports', category: 'service_business', accessesBusinessData: true },

  // Communication
  { id: 'canViewCommunication', name: 'View Communication', description: 'Access communication module', category: 'communication', accessesBusinessData: true },
  { id: 'canCreateCommunication', name: 'Create Communication', description: 'Create and send messages/notifications', category: 'communication', accessesBusinessData: true },
  { id: 'canEditCommunication', name: 'Edit Communication', description: 'Edit communication templates and settings', category: 'communication', accessesBusinessData: true },
  { id: 'canDeleteCommunication', name: 'Delete Communication', description: 'Delete communication records', category: 'communication', accessesBusinessData: true },

  // Accounting
  { id: 'canViewAccounting', name: 'View Accounting Module', description: 'Open the accounting module and view transaction accounts', category: 'accounting', accessesBusinessData: true },
  { id: 'canCreateAccounting', name: 'Create Transaction Accounts', description: 'Create new transaction accounts', category: 'accounting', accessesBusinessData: true },
  { id: 'canEditAccounting', name: 'Edit Transaction Accounts', description: 'Edit existing transaction accounts', category: 'accounting', accessesBusinessData: true },
  { id: 'canDeleteAccounting', name: 'Delete Transaction Accounts', description: 'Delete transaction accounts', category: 'accounting', accessesBusinessData: true },
  
  // Data Import
  { id: 'canImportInventory', name: 'Import Inventory Data', description: 'Bulk import products and inventory via CSV/Excel', category: 'inventory', accessesBusinessData: true },
  
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
    description: 'Business owner — permissions must be explicitly assigned',
    isSystem: true,
    permissions: [],
  },
  {
    id: 'accountant',
    name: 'Accountant',
    description: 'Financial management access — permissions must be assigned by business owner',
    isSystem: true,
    permissions: [],
  },
  {
    id: 'attendant',
    name: 'Attendant',
    description: 'Sales and basic inventory access — permissions must be assigned by business owner',
    isSystem: true,
    permissions: [],
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Branch manager access — permissions must be assigned by business owner',
    isSystem: false,
    permissions: [],
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
