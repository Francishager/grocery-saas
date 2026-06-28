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
  "canCreateExpense", "canViewExpense", "canEditExpense", "canDeleteExpense",
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
  // Services
  "canViewService", "canCreateService", "canEditService", "canDeleteService",
  "canManageServiceCategory", "canViewServiceReport",
  // Rentals
  "canViewRental", "canCreateRental", "canEditRental", "canDeleteRental",
  "canProcessRentalReturn", "canViewRentalReport",
  // Restaurant & Bar
  "canViewRestaurant",
  // Communication
  "canViewCommunication",
];

// =====================================================
// Role defaults — ALL false except owner & saas_admin.
// Business owner must explicitly assign permissions to
// manager, accountant, and attendant via the Roles &
// Permissions page. No implicit access.
// =====================================================
export const ROLE_DEFAULTS = {
  owner: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true])),
  manager: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
  accountant: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
  attendant: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
};

// =====================================================
// Resolve permissions for a user.
// - saas_admin: wildcard "*" (platform-level, bypasses all checks)
// - owner: ALL permissions (business owner has full access)
// - all other roles: start EMPTY — permissions come ONLY
//   from the UserPermission table (set by business owner)
// =====================================================
export function permissionsForUser(user) {
  if (user.role === "saas_admin") return ["*"];
  if (user.role === "owner") return [...ALL_PERMISSION_KEYS];
  // Non-owner roles: no hardcoded defaults. Permissions are
  // granted exclusively via UserPermission table by the owner.
  return [];
}
