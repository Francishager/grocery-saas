// =====================================================
// SINGLE SOURCE OF TRUTH for all permission keys
// =====================================================
const PERMISSION_TO_FEATURES = {
  canCreateSale: ['sales.orders', 'sales'],
  canViewSale: ['sales.orders', 'sales'],
  canEditSale: ['sales.orders', 'sales'],
  canDeleteSale: ['sales.orders', 'sales'],
  canRefundSale: ['sales.returns', 'sales'],
  canCreateProduct: ['inventory.products', 'inventory'],
  canViewProduct: ['inventory.products', 'inventory'],
  canEditProduct: ['inventory.products', 'inventory'],
  canDeleteProduct: ['inventory.products', 'inventory'],
  canAdjustStock: ['inventory.stock', 'inventory'],
  canTransferStock: ['inventory.transfers', 'inventory'],
  canCreatePurchase: ['purchases', 'inventory'],
  canViewPurchase: ['purchases', 'inventory'],
  canEditPurchase: ['purchases', 'inventory'],
  canDeletePurchase: ['purchases', 'inventory'],
  canCreatePayable: ['accounting', 'payables'],
  canViewPayable: ['accounting', 'payables'],
  canEditPayable: ['accounting', 'payables'],
  canDeletePayable: ['accounting', 'payables'],
  canCreateExpense: ['expenses', 'accounting'],
  canViewExpense: ['expenses', 'accounting'],
  canEditExpense: ['expenses', 'accounting'],
  canDeleteExpense: ['expenses', 'accounting'],
  canCreateCustomer: ['customers', 'crm'],
  canViewCustomer: ['customers', 'crm'],
  canEditCustomer: ['customers', 'crm'],
  canDeleteCustomer: ['customers', 'crm'],
  canCreateSupplier: ['suppliers', 'inventory'],
  canViewSupplier: ['suppliers', 'inventory'],
  canEditSupplier: ['suppliers', 'inventory'],
  canDeleteSupplier: ['suppliers', 'inventory'],
  canCreateStaff: ['hr', 'staff'],
  canViewStaff: ['hr', 'staff'],
  canEditStaff: ['hr', 'staff'],
  canDeleteStaff: ['hr', 'staff'],
  canCreateBranch: ['branches', 'core'],
  canViewBranch: ['branches', 'core'],
  canEditBranch: ['branches', 'core'],
  canDeleteBranch: ['branches', 'core'],
  canViewSettings: ['settings', 'core'],
  canEditSettings: ['settings', 'core'],
  canViewRestaurant: ['restaurant', 'restaurant.orders'],
  canCreateRestaurant: ['restaurant', 'restaurant.orders'],
  canEditRestaurant: ['restaurant', 'restaurant.orders'],
  canDeleteRestaurant: ['restaurant', 'restaurant.orders'],
  canViewManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canCreateManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canEditManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canDeleteManufacturing: ['manufacturing', 'manufacturing.production_orders'],
  canViewAgriculture: ['agriculture', 'agriculture.fields'],
  canCreateAgriculture: ['agriculture', 'agriculture.fields'],
  canEditAgriculture: ['agriculture', 'agriculture.fields'],
  canDeleteAgriculture: ['agriculture', 'agriculture.fields'],
  canViewFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canCreateFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canEditFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canDeleteFuelStation: ['fuel_station', 'fuel_station.pumps'],
  canViewServiceBusiness: ['service', 'service.appointments'],
  canCreateServiceBusiness: ['service', 'service.appointments'],
  canEditServiceBusiness: ['service', 'service.appointments'],
  canDeleteServiceBusiness: ['service', 'service.appointments'],
};

const OWNER_CORE_PERMISSIONS = new Set([
  'canViewDashboard',
  'canViewBranch',
  'canCreateBranch',
  'canEditBranch',
  'canDeleteBranch',
  'canViewStaff',
  'canCreateStaff',
  'canEditStaff',
  'canDeleteStaff',
  'canViewSettings',
  'canEditSettings',
]);

export const ALL_PERMISSION_KEYS = [
  "canViewDashboard",
  // Sales
  "canCreateSale", "canViewSale", "canEditSale", "canDeleteSale", "canRefundSale",
  // Inventory
  "canCreateProduct", "canViewProduct", "canEditProduct", "canDeleteProduct", "canAdjustStock", "canTransferStock",
  // Purchases / Payables
  "canCreatePurchase", "canViewPurchase", "canEditPurchase", "canDeletePurchase",
  "canCreatePayable", "canViewPayable", "canEditPayable", "canDeletePayable",
  // Expenses
  "canCreateExpense", "canViewExpense", "canEditExpense", "canDeleteExpense", "canViewStaffTillSheet",
  // Customers / Receivables
  "canCreateCustomer", "canViewCustomer", "canEditCustomer", "canDeleteCustomer",
  "canCreateReceivable", "canViewReceivable", "canEditReceivable", "canDeleteReceivable",
  // Suppliers
  "canCreateSupplier", "canViewSupplier", "canEditSupplier", "canDeleteSupplier",
  // Staff
  "canCreateStaff", "canViewStaff", "canEditStaff", "canDeleteStaff",
  // Branches
  "canCreateBranch", "canViewBranch", "canEditBranch", "canDeleteBranch",
  // Reports
  "canViewSalesReport", "canViewInventoryReport", "canViewFinancialReport", "canViewCustomerReport",
  "canViewSupplierReport", "canViewReceivablesReport", "canViewPayablesReport",
  "canViewPerformanceReport", "canViewAuditReport", "canExportReport",
  // Settings
  "canViewSettings", "canEditSettings",
  // Receipts
  "canViewReceipt", "canCreateReceipt",
  // Discounts
  "canGiveDiscount",
  // Tax
  "canViewTax", "canManageTax",
  // Services (inventory service items)
  "canViewService", "canCreateService", "canEditService", "canDeleteService",
  "canManageServiceCategory", "canViewServiceReport",
  // Rentals
  "canViewRental", "canCreateRental", "canEditRental", "canDeleteRental",
  "canProcessRentalReturn", "canViewRentalReport",
  // Restaurant & Bar
  "canViewRestaurant", "canCreateRestaurant", "canEditRestaurant", "canDeleteRestaurant",
  "canViewRestaurantReport",
  // Fuel Station
  "canViewFuelStation", "canCreateFuelStation", "canEditFuelStation", "canDeleteFuelStation",
  "canViewFuelStationReport",
  // Manufacturing
  "canViewManufacturing", "canCreateManufacturing", "canEditManufacturing", "canDeleteManufacturing",
  "canViewManufacturingReport",
  // Agriculture
  "canViewAgriculture", "canCreateAgriculture", "canEditAgriculture", "canDeleteAgriculture",
  "canViewAgricultureReport",
  // Service Business (appointments, work orders, contracts)
  "canViewServiceBusiness", "canCreateServiceBusiness", "canEditServiceBusiness", "canDeleteServiceBusiness",
  "canViewServiceBusinessReport",
  // Communication
  "canViewCommunication", "canCreateCommunication", "canEditCommunication", "canDeleteCommunication",
  // Accounting
  "canViewAccounting", "canCreateAccounting", "canEditAccounting", "canDeleteAccounting",
  // Payment Methods (for spending — expenses, payables)
  "canUseCash", "canUseMobileMoney", "canUseBank", "canUseCard",
  // Data Import
  "canImportInventory",
];

// =====================================================
// Role defaults — ALL false for every role.
// No role gets auto-permissions. The business owner must
// explicitly assign permissions to every user including
// themselves via the Roles & Permissions page.
// Only saas_admin bypasses all checks (platform-level).
// =====================================================
export const ROLE_DEFAULTS = {
  owner: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true])),
  manager: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
  accountant: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
  attendant: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
};

// =====================================================
// Normalize a permission record to the canonical permission-key shape.
// =====================================================
export function normalizePermissionRecord(permissionRecord = {}) {
  const normalized = {};
  for (const key of ALL_PERMISSION_KEYS) {
    normalized[key] = Boolean(permissionRecord?.[key] ?? false);
  }
  return normalized;
}

function hasFeatureAccessForTenant(tenantFeatures, featureNames = []) {
  if (!tenantFeatures || !Array.isArray(featureNames) || featureNames.length === 0) {
    return true;
  }

  const features = tenantFeatures instanceof Set ? tenantFeatures : new Set(tenantFeatures || []);
  const names = featureNames.filter(Boolean);

  return names.some((featureName) => {
    if (!featureName) return true;
    if (features.has(featureName)) return true;

    const parts = String(featureName).split('.');
    for (let index = parts.length - 1; index > 0; index -= 1) {
      const parentFeature = parts.slice(0, index).join('.');
      if (features.has(parentFeature)) return true;
    }

    return false;
  });
}

// =====================================================
// Resolve the effective permissions for a user.
// The effective set is the union of any inherited/base permissions
// (for example from a plan template or a future override layer) plus
// the explicit user-permission record.
// =====================================================
export function resolveEffectivePermissions(user, permissionRecord = null, inheritedPermissions = [], tenantFeatures = null) {
  if (!user) return [];
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") {
    const granted = new Set();
    for (const permissionKey of ALL_PERMISSION_KEYS) {
      if (OWNER_CORE_PERMISSIONS.has(permissionKey)) {
        granted.add(permissionKey);
        continue;
      }

      const mappedFeatures = PERMISSION_TO_FEATURES[permissionKey];
      if (!mappedFeatures || hasFeatureAccessForTenant(tenantFeatures, mappedFeatures)) {
        granted.add(permissionKey);
      }
    }
    return [...granted];
  }

  const granted = new Set();

  if (Array.isArray(inheritedPermissions)) {
    inheritedPermissions.filter(Boolean).forEach((permission) => granted.add(permission));
  }

  const normalized = normalizePermissionRecord(permissionRecord || {});
  for (const [key, enabled] of Object.entries(normalized)) {
    if (enabled && key.startsWith("can")) {
      granted.add(key);
    }
  }

  return [...granted];
}

// =====================================================
// Resolve permissions for a user.
// - saas_admin: wildcard "*" (platform-level, bypasses all checks)
// - owner: ALL permissions (business owner has full access)
// - Other roles: permissions come ONLY from the UserPermission table
// =====================================================
export function permissionsForUser(user, tenantFeatures = null) {
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") return resolveEffectivePermissions(user, null, [], tenantFeatures);
  // No role gets hardcoded permissions — must be explicitly assigned
  return [];
}
