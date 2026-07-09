// =====================================================
// SINGLE SOURCE OF TRUTH for all permission keys
// =====================================================
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

// =====================================================
// Resolve the effective permissions for a user.
// The effective set is the union of any inherited/base permissions
// (for example from a plan template or a future override layer) plus
// the explicit user-permission record.
// =====================================================
export function resolveEffectivePermissions(user, permissionRecord = null, inheritedPermissions = []) {
  if (!user) return [];
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") return [...ALL_PERMISSION_KEYS];

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
export function permissionsForUser(user) {
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") return [...ALL_PERMISSION_KEYS];
  // No role gets hardcoded permissions — must be explicitly assigned
  return [];
}
